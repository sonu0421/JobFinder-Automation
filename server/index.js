const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const { initScheduler } = require('./services/schedulerService');
const dbStore = require('./models/dbStore');
const { buildLinkedInSearchUrl } = require('./services/phantombusterService');
const { dispatchJobSearch } = require('./services/jobDispatcher');
const { triggerN8nWebhook } = require('./services/n8nService');

const app = express();
const PORT = process.env.PORT || 5000;

// Security settings & headers
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Configure CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : null;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !allowedOrigins || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('CORS request blocked by security policy'));
    }
  }
}));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Simple in-memory rate limiter for API endpoints (100 requests / 15 minutes per IP)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count += 1;
  }

  rateLimitMap.set(ip, record);

  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
  }
  next();
}

// Serve frontend static assets from 'src'
app.use(express.static(path.join(__dirname, '../src')));

// API Routes with rate limiting
app.use('/api', rateLimiter, apiRoutes);

// Fallback route for SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../src/index.html'));
});

// Start automated scheduler callback for all active user preferences
initScheduler(async () => {
  console.log('[Automated Multi-User Cycle] Fetching all active user preferences...');
  try {
    const activePrefs = await dbStore.getAllActivePreferences();
    console.log(`[Automated Multi-User Cycle] Found ${activePrefs.length} active user profiles.`);

    for (const pref of activePrefs) {
      console.log(`[Automated Cycle] Processing User: ${pref.user_id} (${pref.job_keywords} in ${pref.location}) -> Telegram: ${pref.telegram_chat_id}`);
      const { normalizeSources } = require('./services/jobDispatcher');
      const jobSources = normalizeSources(pref.job_source);
      const searchUrl = (jobSources.length === 1 && jobSources[0] === 'phantombuster')
        ? buildLinkedInSearchUrl({
            keywords: pref.job_keywords,
            location: pref.location,
            experienceLevel: pref.experience_level,
            jobType: pref.job_type,
            workType: pref.work_type,
            postingTime: pref.job_posting_time
          })
        : `multi://${jobSources.join('+')}/${encodeURIComponent(pref.job_keywords)} in ${encodeURIComponent(pref.location)}`;

      const searchRecord = await dbStore.createJobSearch({
        preference_id: pref.id,
        user_id: pref.user_id,
        job_keywords: pref.job_keywords,
        location: pref.location,
        experience_level: pref.experience_level,
        job_type: pref.job_type,
        work_type: pref.work_type,
        job_posting_time: pref.job_posting_time,
        telegram_chat_id: pref.telegram_chat_id,
        status: 'Running',
        search_url: searchUrl
      });

      const payload = {
        searchId: searchRecord.id,
        userId: pref.user_id,
        keywords: pref.job_keywords,
        location: pref.location,
        experienceLevel: pref.experience_level,
        jobType: pref.job_type,
        workType: pref.work_type,
        postingTime: pref.job_posting_time,
        telegramChatId: pref.telegram_chat_id,
        searchUrl,
        jobSource: jobSources
      };

      dispatchJobSearch(payload)
        .then(async (res) => {
          if (!res.success) {
            const { buildNoResultPayload } = require('./services/jobDispatcher');
            await triggerN8nWebhook(buildNoResultPayload({
              searchId: payload.searchId,
              userId: payload.userId,
              telegramChatId: payload.telegramChatId,
              searchUrl: payload.searchUrl,
              keywords: payload.keywords,
              location: payload.location,
              sources: jobSources,
              reason: `Search failed (${(res.errors || []).join('; ')})`.slice(0, 300)
            }));
          }
        })
        .catch(async (err) => {
          const { buildNoResultPayload } = require('./services/jobDispatcher');
          await triggerN8nWebhook(buildNoResultPayload({
            searchId: payload.searchId,
            userId: payload.userId,
            telegramChatId: payload.telegramChatId,
            searchUrl: payload.searchUrl,
            keywords: payload.keywords,
            location: payload.location,
            sources: jobSources,
            reason: `Search failed: ${err?.message || err}`.slice(0, 300)
          }));
        });
    }
  } catch (err) {
    console.error('[Automated Multi-User Cycle Error]:', err);
  }
});

function startServer(initialPort) {
  const server = app.listen(initialPort, () => {
    console.log(`=================================================================`);
    console.log(`🚀 Job Scraping Dashboard Backend Server Running on Port ${initialPort}`);
    console.log(`🌐 Local Web Dashboard: http://localhost:${initialPort}`);
    console.log(`=================================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server Warning] Port ${initialPort} is in use. Trying port ${initialPort + 1}...`);
      startServer(initialPort + 1);
    } else {
      console.error('[Server Error]:', err);
    }
  });
}

startServer(Number(PORT));
