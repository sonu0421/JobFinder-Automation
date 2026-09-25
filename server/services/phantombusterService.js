require('dotenv').config();

// LinkedIn GeoId map for Indian cities — prevents LinkedIn from matching US/Ireland cities
// All geoIds verified from LinkedIn search URL inspection
const INDIA_GEOID_MAP = {
  'delhi': '106187582',   // Delhi, India
  'new delhi': '115918471',   // New Delhi, India
  'ncr': '106187582',   // NCR → Delhi region
  'noida': '104869687',   // Noida, Uttar Pradesh
  'gurgaon': '115884833',   // Gurugram, Haryana
  'gurugram': '115884833',   // Gurugram, Haryana
  'faridabad': '106187582',   // Faridabad → Delhi region
  'mumbai': '106164952',   // Mumbai, Maharashtra
  'bangalore': '90009633',    // Greater Bengaluru Area
  'bengaluru': '90009633',    // Greater Bengaluru Area
  'hyderabad': '105556991',   // Hyderabad, Telangana
  'pune': '114806696',   // Pune, Maharashtra
  'chennai': '106888327',   // Chennai, Tamil Nadu
  'kolkata': '111795395',   // Kolkata, West Bengal
  'chandigarh': '101612481',   // Chandigarh
  'ahmedabad': '106093533',   // Ahmedabad, Gujarat
  'jaipur': '106173694',   // Jaipur, Rajasthan
  'lucknow': '104442220',   // Lucknow, Uttar Pradesh
  'indore': '105214831',   // Indore, Madhya Pradesh
  'bhopal': '105214831',   // Bhopal, Madhya Pradesh
  'kochi': '103621821',   // Kochi, Kerala
  'india': '102713980'    // India (country-level fallback)
};

function buildLinkedInSearchUrl({ keywords, location, experienceLevel, jobType, workType, postingTime }) {
  const baseUrl = 'https://www.linkedin.com/jobs/search/';
  const params = new URLSearchParams();

  if (keywords) params.append('keywords', keywords.trim());

  // Handle Location (supports single city, array of cities, or comma-separated string)
  if (location) {
    let locArray = [];
    if (Array.isArray(location)) {
      locArray = location;
    } else if (typeof location === 'string') {
      locArray = location.split(',').map(s => s.trim()).filter(Boolean);
    }

    if (locArray.length > 0) {
      const geoIds = [];
      const formattedLocs = [];

      for (const locItem of locArray) {
        const locLower = locItem.toLowerCase();
        const geoId = INDIA_GEOID_MAP[locLower];
        if (geoId && !geoIds.includes(geoId)) {
          geoIds.push(geoId);
        }
        formattedLocs.push(locItem);
      }

      const locJoined = formattedLocs.join(', ');
      const locationStr = locJoined.toLowerCase().includes('india') ? locJoined : `${locJoined}, India`;
      params.append('location', locationStr);

      if (geoIds.length > 0) {
        params.append('geoId', geoIds.join(','));
      }
    }
  }

  // Handle Work Type (Remote, Hybrid, On-site -> f_WT)
  // LinkedIn values: 1 = On-site, 2 = Remote, 3 = Hybrid
  if (workType) {
    let wtArray = [];
    if (Array.isArray(workType)) {
      wtArray = workType;
    } else if (typeof workType === 'string') {
      wtArray = workType.split(',').map(s => s.trim()).filter(Boolean);
    }

    const wtValues = [];
    wtArray.forEach(wt => {
      const wtLower = wt.toLowerCase();
      if (wtLower.includes('site') || wtLower.includes('office') || wtLower === '1') {
        if (!wtValues.includes('1')) wtValues.push('1');
      } else if (wtLower.includes('remote') || wtLower === '2') {
        if (!wtValues.includes('2')) wtValues.push('2');
      } else if (wtLower.includes('hybrid') || wtLower === '3') {
        if (!wtValues.includes('3')) wtValues.push('3');
      }
    });

    if (wtValues.length > 0) {
      params.append('f_WT', wtValues.join(','));
    }
  }

  // Handle Job Posting Time -> f_TPR
  // LinkedIn values: r3600 (1h), r21600 (6h), r43200 (12h), r86400 (24h)
  if (postingTime && postingTime !== 'any') {
    const ptLower = postingTime.toLowerCase();
    if (ptLower === 'r3600' || ptLower.includes('1 hour') || ptLower.includes('1h')) {
      params.append('f_TPR', 'r3600');
    } else if (ptLower === 'r21600' || ptLower.includes('6 hour') || ptLower.includes('6h')) {
      params.append('f_TPR', 'r21600');
    } else if (ptLower === 'r43200' || ptLower.includes('12 hour') || ptLower.includes('12h')) {
      params.append('f_TPR', 'r43200');
    } else if (ptLower === 'r86400' || ptLower.includes('24 hour') || ptLower.includes('24h') || ptLower.includes('day')) {
      params.append('f_TPR', 'r86400');
    }
  }

  // Map Experience Level -> f_E
  if (experienceLevel) {
    const expLower = experienceLevel.toLowerCase();
    if (expLower.includes('intern')) params.append('f_E', '1');
    else if (expLower.includes('fresher') || expLower.includes('entry')) params.append('f_E', '2');
    else if (expLower.includes('associate')) params.append('f_E', '3');
    else if (expLower.includes('experienced') || expLower.includes('mid') || expLower.includes('senior')) params.append('f_E', '4');
  }

  // Map Job Type -> f_JT
  if (jobType) {
    const typeLower = jobType.toLowerCase();
    if (typeLower.includes('full')) params.append('f_JT', 'F');
    else if (typeLower.includes('part')) params.append('f_JT', 'P');
    else if (typeLower.includes('intern')) params.append('f_JT', 'I');
    else if (typeLower.includes('contract')) params.append('f_JT', 'C');
  }

  return `${baseUrl}?${params.toString()}`;
}

async function triggerPhantomBusterScrape({ searchId, userId, keywords, location, experienceLevel, jobType, workType, postingTime, telegramChatId }) {
  const apiKey = process.env.PHANTOMBUSTER_API_KEY;
  const agentId = process.env.PHANTOMBUSTER_AGENT_ID;
  const searchUrl = buildLinkedInSearchUrl({ keywords, location, experienceLevel, jobType, workType, postingTime });

  if (!apiKey || !agentId) {
    console.warn('[PhantomBuster Service]: PHANTOMBUSTER_API_KEY or PHANTOMBUSTER_AGENT_ID is missing in environment variables.');
    return {
      success: false,
      error: 'PhantomBuster API Key or Agent ID is not configured in environment variables.',
      searchUrl
    };
  }

  try {
    // 1. Fetch current agent configuration to preserve existing sessionCookie / identities
    let currentArg = {};
    let notifications = {};
    try {
      const fetchRes = await fetch(`https://api.phantombuster.com/api/v2/agents/fetch?id=${agentId}`, {
        headers: { 'x-phantombuster-key': apiKey }
      });
      if (fetchRes.ok) {
        const agentData = await fetchRes.json();
        if (agentData.argument) {
          currentArg = JSON.parse(agentData.argument);
        }
        notifications = agentData.notifications || {};
      }
    } catch (e) {
      console.warn('[PhantomBuster Fetch Warning]: Could not fetch existing agent config:', e.message);
    }

    // 2. Merge dynamic user search preferences into PhantomBuster arguments
    currentArg.category = 'Jobs';
    currentArg.searchType = 'linkedInSearchUrl';
    currentArg.linkedInSearchUrl = searchUrl;
    currentArg.searches = [searchUrl];
    currentArg.customData = {
      searchId,
      userId: userId || 'usr_default',
      telegramChatId,
      keywords,
      location,
      experienceLevel,
      jobType,
      workType,
      postingTime
    };

    // Ensure webhook is linked to n8n with user metadata in query params
    const baseWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (baseWebhookUrl) {
      try {
        const webhookUrlObj = new URL(baseWebhookUrl);
        if (telegramChatId) webhookUrlObj.searchParams.set('telegramChatId', telegramChatId);
        if (userId) webhookUrlObj.searchParams.set('userId', userId || 'usr_default');
        if (searchId) webhookUrlObj.searchParams.set('searchId', searchId);
        notifications.webhook = webhookUrlObj.toString();
      } catch (err) {
        console.warn('[PhantomBuster Webhook URL Warning]: Invalid N8N_WEBHOOK_URL format:', err.message);
      }
    }

    // 3. Save updated configuration in PhantomBuster
    await fetch('https://api.phantombuster.com/api/v2/agents/save', {
      method: 'POST',
      headers: {
        'x-phantombuster-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: agentId,
        argument: JSON.stringify(currentArg),
        notifications
      })
    });

    // 4. Launch PhantomBuster agent with automatic wait/retry if previous search is currently running
    const maxRetries = 15; // Wait up to 15 x 5s = 75 seconds
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
        method: 'POST',
        headers: {
          'x-phantombuster-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: agentId
        })
      });

      const data = await response.json();

      if (response.ok && data.containerId) {
        console.log(`[PhantomBuster Launch Success] Container ID: ${data.containerId} for searchUrl: ${searchUrl}`);

        // Asynchronously poll container completion & push enriched jobs (with telegramChatId) to n8n
        pollPhantomContainerAndNotify({
          containerId: data.containerId,
          searchId,
          userId,
          telegramChatId,
          searchUrl
        });

        return {
          success: true,
          data,
          searchUrl
        };
      }

      // If PhantomBuster is currently running a previous search (parallel executions limit reached)
      if (data.error && (data.error.includes('parallel executions limit') || data.details?.detailedErrorSlug === 'maxParallelismReached')) {
        console.log(`[PhantomBuster Queue] Attempt ${attempt}/${maxRetries}: Agent is running a previous scrape. Waiting 5s for completion...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      // Other error
      console.warn(`[PhantomBuster Launch Error]:`, data);
      return {
        success: false,
        data,
        searchUrl
      };
    }

    return {
      success: false,
      error: 'PhantomBuster agent timed out waiting for previous run to complete.',
      searchUrl
    };
  } catch (error) {
    console.error('[PhantomBuster Service Error]:', error);
    return {
      success: false,
      error: error.message,
      searchUrl
    };
  }
}

async function pollPhantomContainerAndNotify({ containerId, searchId, userId, telegramChatId, searchUrl }) {
  const apiKey = process.env.PHANTOMBUSTER_API_KEY;
  if (!apiKey) {
    console.warn('[PhantomBuster Poller Warning]: PHANTOMBUSTER_API_KEY is missing. Aborting poller.');
    return;
  }
  const maxAttempts = 30; // Poll for up to 5 minutes (30 x 10s)
  const dbStore = require('../models/dbStore');
  const { triggerN8nWebhook } = require('./n8nService');

  console.log(`[PhantomBuster Poller] Started background monitoring for Container ID: ${containerId} (Telegram: ${telegramChatId})`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // wait 10 seconds between polls

    try {
      const res = await fetch(`https://api.phantombuster.com/api/v2/containers/fetch?id=${containerId}`, {
        headers: { 'x-phantombuster-key': apiKey }
      });

      if (!res.ok) continue;

      const containerData = await res.json();
      const status = containerData.status;

      if (status === 'FINISHED' || status === 'ERROR') {
        console.log(`[PhantomBuster Poller] Container ${containerId} completed with status: ${status}`);

        let jobs = [];
        if (containerData.resultObject) {
          try {
            jobs = typeof containerData.resultObject === 'string'
              ? JSON.parse(containerData.resultObject)
              : containerData.resultObject;
          } catch (e) {
            console.warn('[PhantomBuster Poller] Could not parse resultObject:', e.message);
          }
        }

        const jobsList = Array.isArray(jobs) ? jobs : [];

        // Enrich every job object with routing metadata
        const enrichedJobs = jobsList.map(j => ({
          ...j,
          telegramChatId,
          userId,
          searchId
        }));

        // Update DB search record
        if (searchId) {
          await dbStore.updateJobSearchStatus(searchId, {
            status: status === 'FINISHED' ? 'Completed' : 'Failed',
            jobs_found: enrichedJobs.length,
            jobs_sent: enrichedJobs.length,
            error_message: status === 'ERROR' ? (containerData.output || 'Container error') : null
          });
        }

        // Send enriched jobs to n8n webhook with telegramChatId guaranteed!
        const n8nPayload = {
          searchId,
          userId,
          telegramChatId,
          searchUrl,
          jobs: enrichedJobs,
          resultObject: enrichedJobs
        };

        const n8nRes = await triggerN8nWebhook(n8nPayload);
        console.log(`[PhantomBuster Poller] Successfully dispatched ${enrichedJobs.length} jobs to n8n webhook. Status: ${n8nRes.status}`);

        return;
      }
    } catch (err) {
      console.warn(`[PhantomBuster Poller Warning] Attempt ${attempt}:`, err.message);
    }
  }

  console.warn(`[PhantomBuster Poller] Container ${containerId} monitoring timed out after 5 minutes.`);
}

module.exports = {
  buildLinkedInSearchUrl,
  triggerPhantomBusterScrape,
  pollPhantomContainerAndNotify
};

