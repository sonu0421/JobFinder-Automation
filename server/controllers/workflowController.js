const dbStore = require('../models/dbStore');
const { buildLinkedInSearchUrl, triggerPhantomBusterScrape } = require('../services/phantombusterService');
const { triggerN8nWebhook } = require('../services/n8nService');

async function triggerSearch(req, res) {
  try {
    const { preferenceId, userId, job_keywords, location, experience_level, job_type, work_type, job_posting_time, telegram_chat_id } = req.body;

    let keywords = job_keywords;
    let loc = location;
    let exp = experience_level;
    let type = job_type;
    let wt = work_type;
    let pt = job_posting_time;
    let telegramId = telegram_chat_id;
    let targetUserId = userId || 'usr_default';

    if (preferenceId) {
      const prefs = await dbStore.getUserPreferences();
      const match = prefs.find(p => p.id === preferenceId);
      if (match) {
        keywords = match.job_keywords;
        loc = match.location;
        exp = match.experience_level;
        type = match.job_type;
        wt = match.work_type;
        pt = match.job_posting_time;
        telegramId = match.telegram_chat_id;
        targetUserId = match.user_id;
      }
    }

    if (!keywords || !telegramId) {
      return res.status(400).json({ success: false, error: 'Missing job keywords or Telegram Chat ID.' });
    }

    const searchUrl = buildLinkedInSearchUrl({
      keywords,
      location: loc,
      experienceLevel: exp,
      jobType: type,
      workType: wt,
      postingTime: pt
    });

    // Create Execution Search Record in DB
    const searchRecord = await dbStore.createJobSearch({
      preference_id: preferenceId || null,
      user_id: targetUserId,
      job_keywords: keywords,
      location: loc || 'India',
      experience_level: exp || 'Any',
      job_type: type || 'Any',
      work_type: wt || 'Remote, Hybrid, On-site',
      job_posting_time: pt || 'any',
      telegram_chat_id: telegramId,
      status: 'Running',
      search_url: searchUrl
    });

    const payload = {
      searchId: searchRecord.id,
      userId: targetUserId,
      keywords,
      location: loc,
      experienceLevel: exp,
      jobType: type,
      workType: wt,
      postingTime: pt,
      telegramChatId: telegramId,
      searchUrl
    };

    // Dispatch PhantomBuster & n8n workflow
    const pbResult = await triggerPhantomBusterScrape(payload);
    const n8nResult = await triggerN8nWebhook(payload);

    return res.json({
      success: true,
      message: `Workflow search triggered successfully for user (${targetUserId})!`,
      searchId: searchRecord.id,
      searchUrl,
      phantombuster: pbResult,
      n8n: n8nResult
    });
  } catch (error) {
    console.error('[workflowController triggerSearch Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while triggering workflow search.' });
  }
}

async function updateStatus(req, res) {
  try {
    const { searchId, status, jobs_found, jobs_sent, error_message } = req.body;
    if (!searchId || !status) {
      return res.status(400).json({ success: false, error: 'searchId and status are required.' });
    }

    const updated = await dbStore.updateJobSearchStatus(searchId, {
      status,
      jobs_found: Number(jobs_found) || 0,
      jobs_sent: Number(jobs_sent) || 0,
      error_message: error_message ? String(error_message) : null
    });

    return res.json({ success: true, search: updated });
  } catch (error) {
    console.error('[workflowController updateStatus Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while updating status.' });
  }
}

async function getStatus(req, res) {
  try {
    const { searchId, userId } = req.query;
    const searches = await dbStore.getJobSearches(userId);

    if (searchId) {
      const match = searches.find(s => s.id === searchId);
      return res.json({ success: true, search: match || null });
    }

    const latest = searches.length > 0 ? searches[0] : null;
    return res.json({ success: true, latest, searches });
  } catch (error) {
    console.error('[workflowController getStatus Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while fetching status.' });
  }
}

async function lookupTelegramChat(req, res) {
  try {
    const { searchUrl, keywords, location } = req.query;
    const prefs = await dbStore.getAllActivePreferences();
    
    let match = null;

    if (keywords && location) {
      const kLower = keywords.toLowerCase();
      const lLower = location.toLowerCase();
      match = prefs.find(p => p.job_keywords.toLowerCase() === kLower && p.location.toLowerCase() === lLower);
    }

    if (!match && searchUrl) {
      const searches = await dbStore.getJobSearches();
      const searchMatch = searches.find(s => s.search_url === searchUrl);
      if (searchMatch) {
        return res.json({
          success: true,
          telegramChatId: searchMatch.telegram_chat_id,
          userId: searchMatch.user_id,
          searchId: searchMatch.id
        });
      }
    }

    if (match) {
      return res.json({
        success: true,
        telegramChatId: match.telegram_chat_id,
        userId: match.user_id,
        preferenceId: match.id
      });
    }

    const fallbackId = process.env.DEFAULT_TELEGRAM_CHAT_ID || null;
    return res.json({
      success: false,
      telegramChatId: fallbackId,
      message: fallbackId ? 'No exact preference match found, returned default Telegram Chat ID.' : 'No preference match found and DEFAULT_TELEGRAM_CHAT_ID is not configured.'
    });
  } catch (error) {
    console.error('[workflowController lookupTelegramChat Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error during Telegram lookup.' });
  }
}

module.exports = {
  triggerSearch,
  updateStatus,
  getStatus,
  lookupTelegramChat
};

