require('dotenv').config();

// JSearch API via RapidAPI — aggregates LinkedIn / Indeed / Glassdoor listings.
// Subscribe (free tier available) at: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
// Needs RAPIDAPI_KEY in environment variables.

const JSEARCH_HOST = 'jsearch.p.rapidapi.com';
const JSEARCH_BASE = `https://${JSEARCH_HOST}/search-v2`;

function mapPostingTimeToDatePosted(postingTime) {
  if (!postingTime || postingTime === 'any') return 'all';
  const pt = String(postingTime).toLowerCase();
  if (pt.includes('3600') || pt.includes('21600') || pt.includes('43200') || pt.includes('86400') || pt.includes('day') || pt.includes('24h')) return 'today';
  if (pt.includes('3days') || pt.includes('3 days')) return '3days';
  if (pt.includes('week')) return 'week';
  if (pt.includes('month')) return 'month';
  return 'all';
}

function mapJobTypeToEmploymentTypes(jobType) {
  const jt = String(jobType || '').toLowerCase();
  const types = [];
  if (jt.includes('full')) types.push('FULLTIME');
  if (jt.includes('part')) types.push('PARTTIME');
  if (jt.includes('contract')) types.push('CONTRACTOR');
  if (jt.includes('intern')) types.push('INTERN');
  return types.length ? types.join(',') : null;
}

// Extract the numeric LinkedIn job ID from a LinkedIn apply URL so the same
// job scraped via PhantomBuster (LinkedIn IDs) dedupes correctly in n8n.
function extractLinkedInId(url) {
  if (!url) return null;
  const m = String(url).match(/linkedin\.com\/jobs\/view\/[^0-9]*?(\d{6,})/i);
  return m ? m[1] : null;
}

// Normalize one JSearch result into the JobFinder standard job shape.
// This shape is the contract with the n8n workflow — DO NOT change field names.
function normalizeJSearchJob(j, locationFallback) {
  const locParts = [j.job_city, j.job_state, j.job_country].filter(Boolean);
  const applyUrl = j.job_apply_link || j.job_google_link || '';
  const liId = extractLinkedInId(applyUrl);
  return {
    jobId: liId ? `li_${liId}` : String(j.job_id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    jobTitle: j.job_title || 'Untitled role',
    companyName: j.employer_name || 'N/A',
    location: locParts.length ? locParts.join(', ') : (locationFallback || 'India'),
    workplaceType: j.job_is_remote ? 'Remote' : 'On-site',
    postedAt: j.job_posted_at_datetime_utc || new Date().toISOString(),
    jobUrl: applyUrl
  };
}

async function fetchJSearchJobs({ keywords, location, experienceLevel, jobType, workType, postingTime }) {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    return { success: false, jobs: [], error: 'RAPIDAPI_KEY is not configured in environment variables (needed for JSearch).' };
  }
  if (!keywords) {
    return { success: false, jobs: [], error: 'Keywords are required for JSearch.' };
  }

  try {
    const where = Array.isArray(location) ? location.join(', ') : String(location || 'India').trim();
    const query = `${String(keywords).trim()} in ${where}`;

    const params = new URLSearchParams({
      query,
      page: '1',
      num_pages: '1',
      date_posted: mapPostingTimeToDatePosted(postingTime)
    });
    const employmentTypes = mapJobTypeToEmploymentTypes(jobType);
    if (employmentTypes) params.append('employment_types', employmentTypes);
    const wt = String(workType || '').toLowerCase();
    if (wt.includes('remote') && !wt.includes('hybrid') && !wt.includes('site') && !wt.includes('office')) {
      params.append('remote_jobs_only', 'true');
    }
    // Experience mapping -> JSearch job_requirements
    const exp = String(experienceLevel || '').toLowerCase();
    if (exp.includes('intern')) params.append('job_requirements', 'under_3_years_experience');
    else if (exp.includes('fresher') || exp.includes('entry')) params.append('job_requirements', 'under_3_years_experience');
    else if (exp.includes('associate')) params.append('job_requirements', 'more_than_3_years_experience');

    const url = `${JSEARCH_BASE}?${params.toString()}`;
    console.log(`[JSearch] Searching jobs: "${query}"...`);

    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': JSEARCH_HOST
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) {
      return { success: false, jobs: [], error: `JSearch API returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const data = await res.json();
    // search-v2 response shape: { status, data: { jobs: [...], cursor } }
    const results = Array.isArray(data?.data?.jobs) ? data.data.jobs
      : Array.isArray(data?.data) ? data.data
      : [];
    console.log(`[JSearch] Found ${results.length} jobs.`);

    const jobs = results.map(j => ({ ...normalizeJSearchJob(j, where), source: 'jsearch' }));
    return { success: true, jobs };
  } catch (error) {
    return { success: false, jobs: [], error: error.message };
  }
}

async function runJSearchSearch({ searchId, userId, keywords, location, experienceLevel, jobType, workType, postingTime, telegramChatId }) {
  const dbStore = require('../models/dbStore');
  const { triggerN8nWebhook } = require('./n8nService');

  const fail = async (error) => {
    console.warn('[JSearch]:', error);
    if (searchId) {
      try { await dbStore.updateJobSearchStatus(searchId, { status: 'Failed', error_message: String(error).slice(0, 500) }); } catch (e) { /* ignore */ }
    }
    return { success: false, error };
  };

  const fetched = await fetchJSearchJobs({ keywords, location, experienceLevel, jobType, workType, postingTime });
  if (!fetched.success) return fail(fetched.error);

  try {
    const where = Array.isArray(location) ? location.join(', ') : String(location || 'India').trim();
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
      searchUrl: `jsearch://query=${encodeURIComponent(`${String(keywords).trim()} in ${where}`)}`,
      jobs: enrichedJobs,
      resultObject: JSON.stringify(enrichedJobs)
    };

    console.log(`[JSearch] Dispatching ${enrichedJobs.length} jobs to n8n webhook...`);
    const n8nRes = await triggerN8nWebhook(n8nPayload);
    console.log(`[JSearch] n8n dispatch done. Status: ${n8nRes.status}, success: ${n8nRes.success}${n8nRes.error ? ', error: ' + n8nRes.error : ''}`);

    return { success: n8nRes.success, jobsFound: enrichedJobs.length, n8n: n8nRes };
  } catch (error) {
    return fail(error.message);
  }
}

module.exports = {
  runJSearchSearch,
  fetchJSearchJobs,
  normalizeJSearchJob,
  mapPostingTimeToDatePosted,
  extractLinkedInId
};
