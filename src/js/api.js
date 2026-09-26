const API_BASE = '/api';

export async function savePreference(prefData) {
  try {
    const response = await fetch(`${API_BASE}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefData)
    });

    if (response.status === 429) {
      return {
        success: false,
        isRateLimit: true,
        error: 'Too many requests. Please wait 5 minutes and try again.'
      };
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: data.error || 'Something went wrong. Please try again later.'
      };
    }

    return data;
  } catch (err) {
    if (!navigator.onLine || err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('NetworkError')) {
      return {
        success: false,
        isNetworkError: true,
        error: 'Connection failed. Please check your internet connection.'
      };
    }
    return {
      success: false,
      error: err.message || 'Something went wrong. Please try again later.'
    };
  }
}

export async function fetchPreferences(userId) {
  try {
    const url = userId ? `${API_BASE}/preferences?userId=${userId}` : `${API_BASE}/preferences`;
    const response = await fetch(url);
    if (response.status === 429) return { success: false, isRateLimit: true };
    return await response.json();
  } catch (err) {
    return { success: false, isNetworkError: true, error: err.message };
  }
}

export async function triggerManualSearch(searchPayload) {
  try {
    const response = await fetch(`${API_BASE}/workflow/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchPayload)
    });
    if (response.status === 429) return { success: false, isRateLimit: true, error: 'Too many requests. Please wait 5 minutes and try again.' };
    return await response.json();
  } catch (err) {
    return { success: false, isNetworkError: true, error: 'Connection failed. Please check your internet connection.' };
  }
}

export async function fetchLatestStatus(userId) {
  try {
    const url = userId ? `${API_BASE}/workflow/status?userId=${userId}` : `${API_BASE}/workflow/status`;
    const response = await fetch(url);
    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function fetchRunsHistory(userId) {
  try {
    const url = userId ? `${API_BASE}/history/runs?userId=${userId}` : `${API_BASE}/history/runs`;
    const response = await fetch(url);
    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function fetchSentJobsHistory(userId) {
  try {
    const url = userId ? `${API_BASE}/history/sent-jobs?userId=${userId}` : `${API_BASE}/history/sent-jobs`;
    const response = await fetch(url);
    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function checkServerHealth() {
  const response = await fetch(`${API_BASE}/health`);
  return response.json();
}
