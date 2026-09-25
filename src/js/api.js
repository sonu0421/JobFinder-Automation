const API_BASE = '/api';

export async function savePreference(prefData) {
  const response = await fetch(`${API_BASE}/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefData)
  });
  return response.json();
}

export async function fetchPreferences(userId) {
  const url = userId ? `${API_BASE}/preferences?userId=${userId}` : `${API_BASE}/preferences`;
  const response = await fetch(url);
  return response.json();
}

export async function triggerManualSearch(searchPayload) {
  const response = await fetch(`${API_BASE}/workflow/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchPayload)
  });
  return response.json();
}

export async function fetchLatestStatus(userId) {
  const url = userId ? `${API_BASE}/workflow/status?userId=${userId}` : `${API_BASE}/workflow/status`;
  const response = await fetch(url);
  return response.json();
}

export async function fetchRunsHistory(userId) {
  const url = userId ? `${API_BASE}/history/runs?userId=${userId}` : `${API_BASE}/history/runs`;
  const response = await fetch(url);
  return response.json();
}

export async function fetchSentJobsHistory(userId) {
  const url = userId ? `${API_BASE}/history/sent-jobs?userId=${userId}` : `${API_BASE}/history/sent-jobs`;
  const response = await fetch(url);
  return response.json();
}

export async function checkServerHealth() {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}
