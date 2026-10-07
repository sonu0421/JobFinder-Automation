require('dotenv').config();

// Central router: runs every job source the user selected on the dashboard
// (one, two, or all three) and funnels the jobs to n8n.
//
// - API sources (adzuna / jsearch) run IN PARALLEL, their jobs are merged,
//   deduped by URL, and sent to n8n in ONE webhook call.
// - PhantomBuster keeps its existing async flow: launch now, its poller
//   dispatches to n8n when the scrape finishes (~5 min later).
// - Every source normalizes jobs into the SAME resultObject shape, so the
//   n8n workflow never needs changes.
//
// job_source may be: 'phantombuster' | 'adzuna' | 'jsearch'
//   | 'adzuna,jsearch' | ['phantombuster','adzuna','jsearch'] etc.
// Defaults to ['phantombuster'] to preserve existing behavior.

const { triggerPhantomBusterScrape } = require('./phantombusterService');
const { fetchAdzunaJobs } = require('./adzunaService');
const { fetchJSearchJobs } = require('./jsearchService');
const { triggerN8nWebhook } = require('./n8nService');

const VALID_SOURCES = ['phantombuster', 'adzuna', 'jsearch'];
const API_SOURCES = ['adzuna', 'jsearch'];

function normalizeSource(jobSource) {
  const arr = normalizeSources(jobSource);
  return arr[0];
}

function normalizeSources(jobSource) {
  let list = [];
  if (Array.isArray(jobSource)) {
    list = jobSource;
  } else if (typeof jobSource === 'string' && jobSource.trim()) {
    list = jobSource.split(',').map(s => s.trim());
  }
  const valid = [...new Set(
    list.map(s => String(s).toLowerCase().trim()).filter(s => VALID_SOURCES.includes(s))
  )];
  return valid.length ? valid : ['phantombuster'];
}

// Normalize a job URL for dedup: lowercase, strip query/fragment/trailing slash.
function normalizeUrl(url) {
  if (!url) return '';
  return String(url).toLowerCase().split('?')[0].split('#')[0].replace(/\/$/, '');
}

function dedupeJobs(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    const key = normalizeUrl(j.jobUrl) || `id:${j.jobId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

async function dispatchJobSearch(params) {
  const sources = normalizeSources(params.jobSource || params.jobSources);
  const {
    searchId, userId, keywords, location,
    experienceLevel, jobType, workType, postingTime, telegramChatId
  } = params;

  console.log(`[Dispatcher] Routing search ${searchId || '(no id)'} -> sources: ${sources.join(', ')}`);

  const common = {
    searchId, userId, keywords, location,
    experienceLevel, jobType, workType, postingTime, telegramChatId
  };

  const apiSources = sources.filter(s => API_SOURCES.includes(s));
  const summary = { sources, apiJobsFound: 0, apiDispatched: false, phantomLaunched: false, errors: [] };

  // 1. API sources: fetch in parallel -> merge -> dedupe -> ONE n8n dispatch
  if (apiSources.length > 0) {
    const fetchers = {
      adzuna: () => fetchAdzunaJobs(common),
      jsearch: () => fetchJSearchJobs(common)
    };
    const settled = await Promise.allSettled(apiSources.map(s => fetchers[s]()));

    let merged = [];
    settled.forEach((r, i) => {
      const src = apiSources[i];
      if (r.status === 'fulfilled' && r.value.success) {
        merged = merged.concat(r.value.jobs);
      } else {
        const err = r.status === 'rejected' ? r.reason?.message : r.value?.error;
        summary.errors.push(`${src}: ${err}`);
        console.warn(`[Dispatcher] ${src} fetch failed:`, err);
      }
    });

    merged = dedupeJobs(merged);
    summary.apiJobsFound = merged.length;

    if (merged.length > 0) {
      const dbStore = require('../models/dbStore');
      const enrichedJobs = merged.map(j => ({
        ...j,
        telegramChatId,
        userId: userId || 'usr_default',
        searchId
      }));

      if (searchId) {
        try {
          await dbStore.updateJobSearchStatus(searchId, {
            status: 'Completed',
            jobs_found: enrichedJobs.length,
            jobs_sent: enrichedJobs.length
          });
        } catch (e) { console.warn('[Dispatcher] DB update failed:', e.message); }
      }

      const where = Array.isArray(location) ? location.join(', ') : String(location || 'India').trim();
      const n8nPayload = {
        searchId,
        userId: userId || 'usr_default',
        telegramChatId,
        searchUrl: `multi://${apiSources.join('+')}/what=${encodeURIComponent(String(keywords))}&where=${encodeURIComponent(where)}`,
        jobs: enrichedJobs,
        resultObject: JSON.stringify(enrichedJobs)
      };

      console.log(`[Dispatcher] Dispatching ${enrichedJobs.length} merged jobs (${apiSources.join('+')}) to n8n webhook...`);
      const n8nRes = await triggerN8nWebhook(n8nPayload);
      summary.apiDispatched = n8nRes.success;
      console.log(`[Dispatcher] n8n dispatch done. success: ${n8nRes.success}${n8nRes.error ? ', error: ' + n8nRes.error : ''}`);
      if (!n8nRes.success) summary.errors.push(`n8n: ${n8nRes.error}`);
    } else {
      console.log('[Dispatcher] API sources returned 0 jobs — nothing to dispatch.');
    }
  }

  // 2. PhantomBuster: unchanged async flow (launch now, poller dispatches later)
  if (sources.includes('phantombuster')) {
    try {
      const pbRes = await triggerPhantomBusterScrape(common);
      summary.phantomLaunched = !!pbRes.success;
      if (!pbRes.success) summary.errors.push(`phantombuster: ${pbRes.error || 'launch failed'}`);
      console.log(`[Dispatcher] PhantomBuster launch:`, pbRes.success ? 'SUCCESS' : 'FAILED');
    } catch (err) {
      summary.errors.push(`phantombuster: ${err.message}`);
      console.warn('[Dispatcher] PhantomBuster error:', err.message);
    }
  }

  // success = something actually produced results or is on its way.
  // (API fetch OK but 0 jobs, or any failure -> false, so the controller
  // fires the fallback n8n webhook and the user gets the "No Result Found" Telegram.)
  summary.success = summary.apiDispatched || summary.phantomLaunched;

  return summary;
}

module.exports = {
  dispatchJobSearch,
  normalizeSource,
  normalizeSources,
  dedupeJobs,
  VALID_SOURCES
};
