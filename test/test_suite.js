const assert = require('assert');
const path = require('path');
require('dotenv').config();

const { buildLinkedInSearchUrl } = require('../server/services/phantombusterService');
const dbStore = require('../server/models/dbStore');

async function runTests() {
  console.log('🧪 Starting JobFinder Automated Test Suite...\n');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}\n     Error: ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}\n     Error: ${err.message}`);
    }
  }

  // --- Test 1: LinkedIn URL Generation ---
  test('LinkedIn URL Generation - Single Location & Keywords', () => {
    const url = buildLinkedInSearchUrl({
      keywords: 'Software Engineer',
      location: 'Delhi',
      experienceLevel: 'Fresher',
      jobType: 'Full-time',
      workType: 'Remote, Hybrid',
      postingTime: 'r86400'
    });
    assert(url.includes('keywords=Software+Engineer'), 'Keywords missing');
    assert(url.includes('location=Delhi%2C+India'), 'Location missing');
    assert(url.includes('geoId=106187582'), 'Delhi GeoID missing');
    assert(url.includes('f_E=2'), 'Experience level entry missing');
    assert(url.includes('f_JT=F'), 'Job type fulltime missing');
    assert(url.includes('f_WT=2%2C3'), 'Work type Remote/Hybrid missing');
    assert(url.includes('f_TPR=r86400'), 'Posting time 24h missing');
  });

  test('LinkedIn URL Generation - Multiple Locations & Custom Work Type', () => {
    const url = buildLinkedInSearchUrl({
      keywords: 'Data Analyst',
      location: ['Mumbai', 'Bengaluru'],
      experienceLevel: 'Internship',
      jobType: 'Internship',
      workType: ['Remote'],
      postingTime: 'r3600'
    });
    assert(url.includes('keywords=Data+Analyst'), 'Keywords missing');
    assert(url.includes('geoId=106164952%2C90009633'), 'GeoIDs missing');
    assert(url.includes('f_E=1'), 'Internship exp level missing');
    assert(url.includes('f_JT=I'), 'Internship job type missing');
    assert(url.includes('f_WT=2'), 'Remote worktype missing');
    assert(url.includes('f_TPR=r3600'), 'Posting time 1h missing');
  });

  // --- Test 2: In-Memory DB Preference Storage ---
  await testAsync('dbStore - Save and Retrieve User Preferences', async () => {
    const newPref = await dbStore.saveUserPreference({
      user_id: 'usr_test123',
      job_keywords: 'React Developer',
      telegram_chat_id: '9988776655',
      location: 'Pune',
      experience_level: 'Fresher',
      job_type: 'Full-time',
      work_type: 'Remote',
      job_posting_time: 'r86400'
    });

    assert(newPref.id, 'Preference ID missing');
    assert.strictEqual(newPref.user_id, 'usr_test123');
    assert.strictEqual(newPref.telegram_chat_id, '9988776655');

    const prefs = await dbStore.getUserPreferences('usr_test123');
    assert(prefs.length > 0, 'Saved preference not retrieved');
    assert.strictEqual(prefs[0].job_keywords, 'React Developer');
  });

  // --- Test 3: In-Memory DB Job Search Execution Tracking ---
  await testAsync('dbStore - Create & Update Job Search Status', async () => {
    const searchRecord = await dbStore.createJobSearch({
      user_id: 'usr_test123',
      job_keywords: 'React Developer',
      location: 'Pune',
      experience_level: 'Fresher',
      job_type: 'Full-time',
      work_type: 'Remote',
      job_posting_time: 'r86400',
      telegram_chat_id: '9988776655',
      status: 'Running'
    });

    assert.strictEqual(searchRecord.status, 'Running');

    const updated = await dbStore.updateJobSearchStatus(searchRecord.id, {
      status: 'Completed',
      jobs_found: 15,
      jobs_sent: 10
    });

    assert.strictEqual(updated.status, 'Completed');
    assert.strictEqual(updated.jobs_found, 15);
    assert.strictEqual(updated.jobs_sent, 10);
    assert(updated.completed_at, 'Completed timestamp missing');
  });

  // --- Test 4: Record Sent Jobs ---
  await testAsync('dbStore - Record Sent Jobs History', async () => {
    const sent = await dbStore.recordSentJobs([
      {
        jobId: 'job_101',
        jobTitle: 'Frontend Engineer',
        companyName: 'TechCorp',
        location: 'Pune',
        telegramChatId: '9988776655',
        userId: 'usr_test123'
      }
    ]);

    assert.strictEqual(sent.length, 1);

    const history = await dbStore.getSentJobsHistory('usr_test123');
    assert(history.length > 0, 'Sent jobs history not retrieved');
  });

  console.log(`\n📊 Test Results: ${passed}/${total} passed.`);
  if (passed === total) {
    console.log('🎉 All unit & integration sanity tests PASSED successfully!\n');
  } else {
    console.error('❌ Some tests failed.\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
