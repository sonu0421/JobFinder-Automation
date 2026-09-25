const dbStore = require('../models/dbStore');
const { buildLinkedInSearchUrl, triggerPhantomBusterScrape } = require('../services/phantombusterService');
const { triggerN8nWebhook } = require('../services/n8nService');

async function createPreference(req, res) {
  try {
    const {
      job_keywords,
      telegram_chat_id,
      location,
      experience_level,
      job_type,
      work_type,
      job_posting_time,
      user_id,
      user_email,
      auto_trigger
    } = req.body;

    // Validation
    const cleanTgId = (telegram_chat_id || '').toString().trim();
    if (!job_keywords || typeof job_keywords !== 'string' || !job_keywords.trim()) {
      return res.status(400).json({ success: false, error: 'Job Keywords are required.' });
    }
    if (!cleanTgId) {
      return res.status(400).json({ success: false, error: 'Telegram Chat ID is required.' });
    }
    if (!/^-?\d+$/.test(cleanTgId)) {
      return res.status(400).json({ success: false, error: 'Invalid Telegram Chat ID format. Must be a numeric ID (e.g. 123456789 or -1002630615047).' });
    }
    if (!location || (typeof location === 'string' && !location.trim()) || (Array.isArray(location) && location.length === 0)) {
      return res.status(400).json({ success: false, error: 'Location is required.' });
    }
    if (!experience_level || typeof experience_level !== 'string' || !experience_level.trim()) {
      return res.status(400).json({ success: false, error: 'Experience Level is required.' });
    }
    if (!job_type || typeof job_type !== 'string' || !job_type.trim()) {
      return res.status(400).json({ success: false, error: 'Job Type is required.' });
    }

    const formattedLocation = Array.isArray(location) ? location.map(l => String(l).trim()).filter(Boolean).join(', ') : location.trim();
    const formattedWorkType = Array.isArray(work_type) ? work_type.map(w => String(w).trim()).filter(Boolean).join(', ') : (work_type ? String(work_type).trim() : 'Remote, Hybrid, On-site');
    const formattedPostingTime = job_posting_time ? String(job_posting_time).trim() : 'any';

    // Save Preference to DB (Supabase / Memory fallback)
    const preference = await dbStore.saveUserPreference({
      user_id: user_id || 'usr_' + cleanTgId.replace(/[^0-9]/g, ''),
      user_email: user_email || '',
      job_keywords: job_keywords.trim(),
      telegram_chat_id: cleanTgId,
      location: formattedLocation,
      experience_level: experience_level.trim(),
      job_type: job_type.trim(),
      work_type: formattedWorkType,
      job_posting_time: formattedPostingTime
    });

    // Optionally initiate initial scraping run automatically upon submission
    let searchRecord = null;

    if (auto_trigger !== false) {
      const searchUrl = buildLinkedInSearchUrl({
        keywords: preference.job_keywords,
        location: preference.location,
        experienceLevel: preference.experience_level,
        jobType: preference.job_type,
        workType: preference.work_type,
        postingTime: preference.job_posting_time
      });

      // Create Job Search Record with status 'Pending' -> 'Running'
      searchRecord = await dbStore.createJobSearch({
        preference_id: preference.id,
        user_id: preference.user_id,
        job_keywords: preference.job_keywords,
        location: preference.location,
        experience_level: preference.experience_level,
        job_type: preference.job_type,
        work_type: preference.work_type,
        job_posting_time: preference.job_posting_time,
        telegram_chat_id: preference.telegram_chat_id,
        status: 'Running',
        search_url: searchUrl
      });

      // Trigger PhantomBuster & n8n workflow async
      const payload = {
        searchId: searchRecord.id,
        userId: preference.user_id,
        keywords: preference.job_keywords,
        location: preference.location,
        experienceLevel: preference.experience_level,
        jobType: preference.job_type,
        workType: preference.work_type,
        postingTime: preference.job_posting_time,
        telegramChatId: preference.telegram_chat_id,
        searchUrl
      };

      // Synchronously await PhantomBuster scrape launch
      try {
        const pbRes = await triggerPhantomBusterScrape(payload);
        console.log(`[Dashboard Trigger] PhantomBuster launch status:`, pbRes.success ? 'SUCCESS' : 'FAILED', pbRes);
        if (!pbRes.success) {
          await triggerN8nWebhook(payload);
        }
      } catch (err) {
        console.warn('[Auto-trigger error fallback to n8n webhook]:', err.message);
        await triggerN8nWebhook(payload);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Job preferences saved successfully and search initiated!',
      preference,
      search: searchRecord
    });
  } catch (error) {
    console.error('[preferencesController Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while processing preference.' });
  }
}

async function getPreferences(req, res) {
  try {
    const { userId } = req.query;
    const preferences = await dbStore.getUserPreferences(userId);
    return res.json({ success: true, preferences });
  } catch (error) {
    console.error('[preferencesController getPreferences Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while fetching preferences.' });
  }
}

module.exports = {
  createPreference,
  getPreferences
};
