require('dotenv').config();

// Adzuna Jobs API — official, stable, no browser automation needed.
// Docs: https://developer.adzuna.com/
// Free dev tier: sign up at developer.adzuna.com to get APP_ID + APP_KEY.

const ADZUNA_BASE = 'https://api.adzuna.com/v1/api/jobs';

function mapPostingTimeToMaxDaysOld(postingTime) {
  if (!postingTime || postingTime === 'any') return null;
  const pt = String(postingTime).toLowerCase();
  if (pt.includes('3600') || pt.includes('21600') || pt.includes('43200')) return 1; // <=12h -> 1 day
  if (pt.includes('86400') || pt.includes('24h') || pt.includes('day')) return 1;
  if (pt.includes('week')) return 7;
  if (pt.includes('month')) return 30;
  return null;
}

function deriveWorkplaceType(ad, workTypePref) {
  const text = `${ad.title || ''} ${ad.description || ''}`.toLowerCase();
  if (text.includes('remote')) return 'Remote';
  if (text.includes('hybrid')) return 'Hybrid';
  // Fall back to the user's preference when it names a single type
  if (workTypePref) {
    const wt = String(workTypePref).toLowerCase();
    if (wt.includes('remote') && !wt.includes('hybrid') && !wt.includes('site')) return 'Remote';
    if (wt.includes('hybrid') && !wt.includes('remote') && !wt.includes('site')) return 'Hybrid';
  }
  return 'On-site';
}

// Normalize one Adzuna result into the JobFinder standard job shape.
// This shape is the contract with the n8n workflow — DO NOT change field names.
function normalizeAdzunaJob(ad, locationFallback) {
  return {
    jobId: String(ad.id),
    jobTitle: ad.title || 'Untitled role',
    companyName: (ad.company && ad.company.display_name) || 'N/A',
    location: (ad.location && ad.location.display_name) || locationFallback || 'India',
    workplaceType: deriveWorkplaceType(ad),
    postedAt: ad.created || new Date().toISOString(),
    jobUrl: ad.redirect_url || ''
  };
}

async function fetchAdzunaJobs({ keywords, location, experienceLevel, jobType, workType, postingTime }) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return { success: false, jobs: [], error: 'ADZUNA_APP_ID or ADZUNA_APP_KEY is not configured in environment variables.' };
  }
  if (!keywords) {
    return { success: false, jobs: [], error: 'Keywords are required for Adzuna search.' };
  }

  try {
    const params = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      what: String(keywords).trim(),
      results_per_page: '20',
      sort_by: 'date'
    });
    const where = Array.isArray(location) ? location.join(' ') : String(location || 'India').trim();
    if (where) params.append('where', where);

    const maxDaysOld = mapPostingTimeToMaxDaysOld(postingTime);
    if (maxDaysOld) params.append('max_days_old', String(maxDaysOld));

    // Job type mapping -> Adzuna params
    const jt = String(jobType || '').toLowerCase();
    if (jt.includes('full')) params.append('full_time', '1');
    if (jt.includes('part')) params.append('part_time', '1');
    if (jt.includes('contract')) params.append('contract', '1');

    const url = `${ADZUNA_BASE}/in/search/1?${params.toString()}`;
    console.log(`[Adzuna] Searching jobs: "${keywords}" in "${where}"...`);

    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      return { success: false, jobs: [], error: `Adzuna API returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    console.log(`[Adzuna] Found ${results.length} jobs.`);

    const jobs = results.map(ad => ({ ...normalizeAdzunaJob(ad, where), source: 'adzuna' }));
    return { success: true, jobs };
  } catch (error) {
    return { success: false, jobs: [], error: error.message };
  }
}

async function runAdzunaSearch({ searchId, userId, keywords, location, experienceLevel, jobType, workType, postingTime, telegramChatId }) {
  const dbStore = require('../models/dbStore');
  const { triggerN8nWebhook } = require('./n8nService');

  const fail = async (error) => {
    console.warn('[Adzuna]:', error);
    if (searchId) {
      try { await dbStore.updateJobSearchStatus(searchId, { status: 'Failed', error_message: String(error).slice(0, 500) }); } catch (e) { /* ignore */ }
    }
    return { success: false, error };
  };

  const fetched = await fetchAdzunaJobs({ keywords, location, experienceLevel, jobType, workType, postingTime });
  if (!fetched.success) return fail(fetched.error);

  try {
    const where = Array.isArray(location) ? location.join(' ') : String(location || 'India').trim();
    const enrichedJobs = fetched.jobs.map(j => ({
      ...j,
      telegramChatId,
      userId: userId || 'usr_default',
      searchId
    }));

    if (searchId) {
      await dbStore.updateJobSearchStatus(searchId, {
        status: 'Completed',
        jobs_found: enrichedJobs.length,
        jobs_sent: enrichedJobs.length
      });
    }

    // Same n8n payload contract as the PhantomBuster flow — n8n needs no changes.
    const n8nPayload = {
      searchId,
      userId: userId || 'usr_default',
      telegramChatId,
      searchUrl: `adzuna://in/what=${encodeURIComponent(String(keywords))}&where=${encodeURIComponent(where)}`,
      jobs: enrichedJobs,
      resultObject: JSON.stringify(enrichedJobs)
    };

    console.log(`[Adzuna] Dispatching ${enrichedJobs.length} jobs to n8n webhook...`);
    const n8nRes = await triggerN8nWebhook(n8nPayload);
    console.log(`[Adzuna] n8n dispatch done. Status: ${n8nRes.status}, success: ${n8nRes.success}${n8nRes.error ? ', error: ' + n8nRes.error : ''}`);

    return { success: n8nRes.success, jobsFound: enrichedJobs.length, n8n: n8nRes };
  } catch (error) {
    return fail(error.message);
  }
}

module.exports = {
  runAdzunaSearch,
  fetchAdzunaJobs,
  normalizeAdzunaJob,
  mapPostingTimeToMaxDaysOld
};
