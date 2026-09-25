const assert = require('assert');

async function testApiEndpoints() {
  console.log('🧪 Testing Live Server API Endpoints...\n');
  const baseUrl = 'http://localhost:5000/api';
  let passed = 0;
  let total = 0;

  async function check(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}\n     Error: ${err.message}`);
    }
  }

  // 1. Health check
  await check('GET /api/health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'online');
  });

  // 2. Preference validation rejection for invalid Telegram Chat ID
  await check('POST /api/preferences - Validation Rejection (Invalid Telegram ID)', async () => {
    const res = await fetch(`${baseUrl}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_keywords: 'Node.js Developer',
        telegram_chat_id: 'invalid_chat_id_abc',
        location: 'Delhi',
        experience_level: 'Fresher',
        job_type: 'Full-time'
      })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert(data.error.includes('Telegram Chat ID'), 'Validation message missing');
  });

  // 3. Preference Creation & Auto-Trigger
  let createdPrefId = null;
  await check('POST /api/preferences - Create Preference (Valid Input)', async () => {
    const res = await fetch(`${baseUrl}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_keywords: 'Fullstack Engineer',
        telegram_chat_id: '123456789',
        location: ['Delhi', 'Noida'],
        experience_level: 'Fresher',
        job_type: 'Full-time',
        work_type: ['Remote', 'Hybrid'],
        job_posting_time: 'r86400',
        auto_trigger: false // Don't call external PhantomBuster network in live API test
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.preference.id, 'Preference ID missing');
    createdPrefId = data.preference.id;
  });

  // 4. GET /api/preferences
  await check('GET /api/preferences', async () => {
    const res = await fetch(`${baseUrl}/preferences?userId=usr_123456789`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.preferences));
  });

  // 5. GET /api/workflow/status
  await check('GET /api/workflow/status', async () => {
    const res = await fetch(`${baseUrl}/workflow/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

  // 6. GET /api/history/runs
  await check('GET /api/history/runs', async () => {
    const res = await fetch(`${baseUrl}/history/runs`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(typeof data.count === 'number');
  });

  // 7. GET /api/history/sent-jobs
  await check('GET /api/history/sent-jobs', async () => {
    const res = await fetch(`${baseUrl}/history/sent-jobs`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(typeof data.count === 'number');
  });

  console.log(`\n📊 API Test Results: ${passed}/${total} passed.`);
  if (passed === total) {
    console.log('🎉 All live HTTP API tests PASSED successfully!\n');
  } else {
    console.error('❌ Some API tests failed.\n');
    process.exit(1);
  }
}

testApiEndpoints().catch(err => {
  console.error('Fatal API test error:', err);
  process.exit(1);
});
