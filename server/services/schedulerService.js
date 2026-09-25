const cron = require('node-cron');
require('dotenv').config();

let isSchedulerRunning = false;

function initScheduler(triggerSearchCallback) {
  if (process.env.ENABLE_SCHEDULER === 'false') {
    console.log('[Scheduler] Automated schedule is currently DISABLED (ENABLE_SCHEDULER=false) for manual testing.');
    return;
  }
  const cronSchedule = process.env.AUTO_SCHEDULE_CRON || '0 */6 * * *'; // Default every 6 hours
  
  if (!cron.validate(cronSchedule)) {
    console.error(`[Scheduler] Invalid cron expression: ${cronSchedule}`);
    return;
  }

  cron.schedule(cronSchedule, async () => {
    console.log(`[Scheduler] Running scheduled multi-user job scraping cycle at ${new Date().toISOString()}...`);
    try {
      if (typeof triggerSearchCallback === 'function') {
        await triggerSearchCallback();
      }
    } catch (err) {
      console.error('[Scheduler Execution Error]:', err);
    }
  });

  isSchedulerRunning = true;
  console.log(`[Scheduler] Automated multi-user schedule initialized with expression: '${cronSchedule}'`);
}

module.exports = {
  initScheduler,
  isSchedulerRunning: () => isSchedulerRunning
};
