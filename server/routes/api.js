const express = require('express');
const router = express.Router();

const preferencesController = require('../controllers/preferencesController');
const workflowController = require('../controllers/workflowController');
const historyController = require('../controllers/historyController');
const dbStore = require('../models/dbStore');

// Preferences API
router.post('/preferences', preferencesController.createPreference);
router.get('/preferences', preferencesController.getPreferences);

// Workflow API
router.post('/workflow/trigger', workflowController.triggerSearch);
router.post('/workflow/callback', workflowController.updateStatus);
router.get('/workflow/status', workflowController.getStatus);
router.get('/workflow/lookup-telegram', workflowController.lookupTelegramChat);

// History API
router.get('/history/runs', historyController.getRuns);
router.get('/history/sent-jobs', historyController.getSentJobs);

// Health Check
router.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    supabaseConfigured: dbStore.isConfigured()
  });
});

module.exports = router;
