const dbStore = require('../models/dbStore');

async function getRuns(req, res) {
  try {
    const { userId } = req.query;
    const searches = await dbStore.getJobSearches(userId);
    return res.json({ success: true, count: searches.length, runs: searches });
  } catch (error) {
    console.error('[historyController getRuns Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while fetching runs history.' });
  }
}

async function getSentJobs(req, res) {
  try {
    const { userId } = req.query;
    const sentJobs = await dbStore.getSentJobsHistory(userId);
    return res.json({ success: true, count: sentJobs.length, jobs: sentJobs });
  } catch (error) {
    console.error('[historyController getSentJobs Error]:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while fetching sent jobs history.' });
  }
}

module.exports = {
  getRuns,
  getSentJobs
};
