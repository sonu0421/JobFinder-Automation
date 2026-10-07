const { supabase, isConfigured } = require('../config/supabase');
const { v4: uuidv4 } = require('crypto');

// In-memory fallback database store
const memoryStore = {
  user_preferences: [
    {
      id: 'pref_1',
      user_id: 'user_a',
      user_email: 'usera@example.com',
      job_keywords: 'Generative AI Intern',
      telegram_chat_id: '987654321',
      location: 'Delhi',
      experience_level: 'Internship',
      job_type: 'Internship',
      work_type: 'Remote, Hybrid, On-site',
      job_posting_time: 'r86400',
      is_active: true,
      created_at: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
      id: 'pref_2',
      user_id: 'user_b',
      user_email: 'userb@example.com',
      job_keywords: 'Desktop Support Engineer',
      telegram_chat_id: '123456789',
      location: 'Noida',
      experience_level: 'Fresher',
      job_type: 'Full-time',
      work_type: 'On-site',
      job_posting_time: 'any',
      is_active: true,
      created_at: new Date(Date.now() - 3600000 * 12).toISOString()
    }
  ],
  job_searches: [
    {
      id: 'search_1',
      preference_id: 'pref_1',
      user_id: 'user_a',
      job_keywords: 'Generative AI Intern',
      location: 'Delhi',
      experience_level: 'Internship',
      job_type: 'Internship',
      work_type: 'Remote, Hybrid, On-site',
      job_posting_time: 'r86400',
      telegram_chat_id: '987654321',
      status: 'Completed',
      jobs_found: 12,
      jobs_sent: 5,
      error_message: null,
      search_url: 'https://www.linkedin.com/jobs/search/?keywords=Generative+AI+Intern&location=Delhi&f_E=1&f_JT=I',
      started_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      completed_at: new Date(Date.now() - 3600000 * 4.9).toISOString()
    }
  ],
  jobs_sent: []
};

// --- User Preferences Operations ---
async function saveUserPreference(prefData) {
  const insertPayload = {
    user_id: prefData.user_id || 'usr_default',
    user_email: prefData.user_email || '',
    job_keywords: prefData.job_keywords,
    telegram_chat_id: prefData.telegram_chat_id,
    location: prefData.location,
    experience_level: prefData.experience_level,
    job_type: prefData.job_type,
    work_type: prefData.work_type || 'Remote, Hybrid, On-site',
    job_posting_time: prefData.job_posting_time || 'any',
    job_source: prefData.job_source || 'phantombuster',
    is_active: true
  };

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .insert([insertPayload])
        .select();

      if (error) throw error;
      return data[0];
    } catch (err) {
      console.warn('[DB Warning - saveUserPreference retry without optional columns]:', err.message);
      // Fallback if remote Supabase table schema doesn't have new columns yet
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.work_type;
      delete fallbackPayload.job_posting_time;
      delete fallbackPayload.job_source;
      const { data, error } = await supabase
        .from('user_preferences')
        .insert([fallbackPayload])
        .select();
      if (error) throw error;
      return { ...data[0], work_type: insertPayload.work_type, job_posting_time: insertPayload.job_posting_time, job_source: insertPayload.job_source };
    }
  } else {
    const newPref = {
      id: 'pref_' + Date.now(),
      ...insertPayload,
      created_at: new Date().toISOString()
    };
    memoryStore.user_preferences.unshift(newPref);
    return newPref;
  }
}

async function getUserPreferences(userId) {
  if (isConfigured && supabase) {
    let query = supabase.from('user_preferences').select('*').order('created_at', { ascending: false });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } else {
    if (userId) {
      return memoryStore.user_preferences.filter(p => p.user_id === userId);
    }
    return memoryStore.user_preferences;
  }
}

async function getAllActivePreferences() {
  if (isConfigured && supabase) {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('is_active', true);
    if (error) throw error;
    return data || [];
  } else {
    return memoryStore.user_preferences.filter(p => p.is_active);
  }
}

// --- Job Search History Operations ---
async function createJobSearch(searchData) {
  const insertPayload = {
    preference_id: searchData.preference_id || null,
    user_id: searchData.user_id || 'usr_default',
    job_keywords: searchData.job_keywords,
    location: searchData.location,
    experience_level: searchData.experience_level,
    job_type: searchData.job_type,
    work_type: searchData.work_type || 'Remote, Hybrid, On-site',
    job_posting_time: searchData.job_posting_time || 'any',
    telegram_chat_id: searchData.telegram_chat_id,
    status: searchData.status || 'Pending',
    search_url: searchData.search_url || '',
    jobs_found: 0,
    jobs_sent: 0
  };

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('job_searches')
        .insert([insertPayload])
        .select();

      if (error) throw error;
      return data[0];
    } catch (err) {
      console.warn('[DB Warning - createJobSearch retry without optional columns]:', err.message);
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.work_type;
      delete fallbackPayload.job_posting_time;
      const { data, error } = await supabase
        .from('job_searches')
        .insert([fallbackPayload])
        .select();
      if (error) throw error;
      return { ...data[0], work_type: insertPayload.work_type, job_posting_time: insertPayload.job_posting_time, job_source: insertPayload.job_source };
    }
  } else {
    const newSearch = {
      id: 'search_' + Date.now(),
      ...insertPayload,
      error_message: null,
      started_at: new Date().toISOString(),
      completed_at: null
    };
    memoryStore.job_searches.unshift(newSearch);
    return newSearch;
  }
}

async function updateJobSearchStatus(searchId, updates) {
  if (isConfigured && supabase) {
    const payload = { ...updates };
    if (updates.status === 'Completed' || updates.status === 'Failed') {
      payload.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('job_searches')
      .update(payload)
      .eq('id', searchId)
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  } else {
    const search = memoryStore.job_searches.find(s => s.id === searchId);
    if (search) {
      Object.assign(search, updates);
      if (updates.status === 'Completed' || updates.status === 'Failed') {
        search.completed_at = new Date().toISOString();
      }
    }
    return search;
  }
}

async function getJobSearches(userId) {
  if (isConfigured && supabase) {
    let query = supabase.from('job_searches').select('*').order('started_at', { ascending: false }).limit(50);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } else {
    if (userId) {
      return memoryStore.job_searches.filter(s => s.user_id === userId);
    }
    return memoryStore.job_searches;
  }
}

async function getSentJobsHistory(userId) {
  if (isConfigured && supabase) {
    let query = supabase.from('jobs_sent').select('*').order('created_at', { ascending: false }).limit(100);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } else {
    if (userId) {
      return memoryStore.jobs_sent.filter(j => j.user_id === userId);
    }
    return memoryStore.jobs_sent;
  }
}

async function recordSentJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];
  const records = jobs.map(j => ({
    jobId: j.jobId || j.id || String(Math.random()),
    jobTitle: j.jobTitle || j.title || '',
    companyName: j.companyName || j.company || '',
    location: j.location || '',
    workplaceType: j.workplaceType || j.workType || '',
    jobUrl: j.jobUrl || j.link || '',
    postedAt: j.postedAt || new Date().toISOString(),
    telegramChatId: j.telegramChatId || '',
    user_id: j.userId || 'usr_default',
    created_at: new Date().toISOString()
  }));

  if (isConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('jobs_sent').insert(records).select();
      if (error) console.warn('[DB Warning - recordSentJobs]:', error.message);
      return data || records;
    } catch (err) {
      console.warn('[DB Error - recordSentJobs]:', err.message);
      return records;
    }
  } else {
    memoryStore.jobs_sent.unshift(...records);
    return records;
  }
}

module.exports = {
  saveUserPreference,
  getUserPreferences,
  getAllActivePreferences,
  createJobSearch,
  updateJobSearchStatus,
  getJobSearches,
  getSentJobsHistory,
  recordSentJobs,
  isConfigured: () => isConfigured
};
