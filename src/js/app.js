import * as API from './api.js';

const POPULAR_LOCATIONS = [
  'Delhi',
  'Noida',
  'Gurugram',
  'Mumbai',
  'Pune',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
  'Lucknow',
  'Chandigarh',
  'Indore',
  'Bhopal'
];

let selectedLocations = ['Delhi'];
let statusPollTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  initLocationDropdown();
  bindFormEvents();
  bindChipClickEvents();
  bindNavTabs();
  checkSystemStatus();
  loadPreferences();
  loadLatestStatus();
  loadHistoryRuns();

  // Poll status every 5 seconds for live workflow updates
  statusPollTimer = setInterval(() => {
    loadLatestStatus();
    loadHistoryRuns();
  }, 5000);
}

function bindNavTabs() {
  const allNavLinks = document.querySelectorAll('.sidebar-menu .menu-item, .mobile-bottom-nav .mobile-tab');

  allNavLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const targetSection = document.querySelector(href);
        if (targetSection) {
          e.preventDefault();
          targetSection.scrollIntoView({ behavior: 'smooth' });

          allNavLinks.forEach(item => item.classList.remove('active'));
          link.classList.add('active');
        }
      }
    });
  });
}

// --- 1. Location Multi-Select Dropdown ---
function initLocationDropdown() {
  const container = document.getElementById('location-select-container');
  const wrapper = document.getElementById('location-input-wrapper');
  const searchInput = document.getElementById('location-search-input');
  const selectAllBtn = document.getElementById('select-all-locs-btn');
  const clearAllBtn = document.getElementById('clear-all-locs-btn');

  if (!container || !searchInput) return;

  renderSelectedLocationChips();
  renderLocationOptions();

  // Open dropdown on clicking wrapper
  wrapper.addEventListener('click', (e) => {
    if (e.target.classList.contains('loc-chip-remove')) return;
    container.classList.add('open');
    searchInput.focus();
  });

  // Filter options on search typing
  searchInput.addEventListener('input', () => {
    container.classList.add('open');
    renderLocationOptions(searchInput.value.trim());
  });

  // Pressing Enter adds typed city if custom
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = searchInput.value.trim();
      if (val && !selectedLocations.some(l => l.toLowerCase() === val.toLowerCase())) {
        selectedLocations.push(val);
        searchInput.value = '';
        renderSelectedLocationChips();
        renderLocationOptions();
      }
    }
  });

  // Select All button
  selectAllBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedLocations = [...POPULAR_LOCATIONS];
    renderSelectedLocationChips();
    renderLocationOptions(searchInput.value.trim());
  });

  // Clear All button
  clearAllBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedLocations = [];
    renderSelectedLocationChips();
    renderLocationOptions(searchInput.value.trim());
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      container.classList.remove('open');
    }
  });
}

function renderSelectedLocationChips() {
  const chipsContainer = document.getElementById('selected-location-chips');
  const hiddenInput = document.getElementById('location');
  if (!chipsContainer) return;

  if (selectedLocations.length === 0) {
    chipsContainer.innerHTML = '';
    if (hiddenInput) hiddenInput.value = '';
    return;
  }

  chipsContainer.innerHTML = selectedLocations.map(loc => `
    <span class="loc-chip">
      ${escapeHtml(loc)}
      <span class="loc-chip-remove" data-loc="${escapeHtml(loc)}">✕</span>
    </span>
  `).join('');

  if (hiddenInput) {
    hiddenInput.value = selectedLocations.join(', ');
  }

  // Bind click event on remove icons
  chipsContainer.querySelectorAll('.loc-chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const locToRemove = btn.getAttribute('data-loc');
      selectedLocations = selectedLocations.filter(l => l !== locToRemove);
      renderSelectedLocationChips();
      renderLocationOptions(document.getElementById('location-search-input')?.value.trim() || '');
    });
  });
}

function renderLocationOptions(filterText = '') {
  const optionsList = document.getElementById('location-options-list');
  if (!optionsList) return;

  const filterLower = filterText.toLowerCase();
  const filtered = POPULAR_LOCATIONS.filter(loc => loc.toLowerCase().includes(filterLower));

  if (filtered.length === 0) {
    optionsList.innerHTML = `
      <div style="padding:0.75rem 0.85rem; font-size:0.85rem; color:var(--text-muted); text-align:center;">
        No matching city. Press Enter to add "<strong>${escapeHtml(filterText)}</strong>"
      </div>
    `;
    return;
  }

  optionsList.innerHTML = filtered.map(loc => {
    const isSelected = selectedLocations.some(l => l.toLowerCase() === loc.toLowerCase());
    return `
      <div class="dropdown-option ${isSelected ? 'selected' : ''}" data-loc="${escapeHtml(loc)}">
        <span>📍 ${escapeHtml(loc)}</span>
        ${isSelected ? '<span class="option-check">✓</span>' : ''}
      </div>
    `;
  }).join('');

  optionsList.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const locName = opt.getAttribute('data-loc');
      const idx = selectedLocations.findIndex(l => l.toLowerCase() === locName.toLowerCase());

      if (idx >= 0) {
        selectedLocations.splice(idx, 1);
      } else {
        selectedLocations.push(locName);
      }

      renderSelectedLocationChips();
      renderLocationOptions(document.getElementById('location-search-input')?.value.trim() || '');
    });
  });
}

function getSelectedWorkTypes() {
  const checkboxes = document.querySelectorAll('input[name="work_type"]:checked');
  const values = Array.from(checkboxes).map(cb => cb.value);
  return values.length > 0 ? values : ['Remote', 'Hybrid', 'On-site'];
}

function getSelectedJobTypes() {
  const checkboxes = document.querySelectorAll('input[name="job_type_options"]:checked');
  const values = Array.from(checkboxes).map(cb => cb.value);
  return values.length > 0 ? values.join(', ') : 'Full-time';
}

// --- SweetAlert2 Configuration & Helper Functions ---
let isLoading = false;
let loadingStartTime = 0;
let tenSecTimer = null;

const swalCustomClass = {
  popup: 'jobfinder-swal-popup',
  title: 'jobfinder-swal-title',
  htmlContainer: 'jobfinder-swal-html',
  confirmButton: 'jobfinder-swal-confirm'
};

function showLoadingAlert() {
  isLoading = true;
  loadingStartTime = Date.now();

  Swal.fire({
    title: 'Saving Your Preferences',
    text: 'Please wait while we update your settings...',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    customClass: swalCustomClass,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  if (tenSecTimer) clearTimeout(tenSecTimer);

  tenSecTimer = setTimeout(() => {
    if (isLoading && Swal.isVisible()) {
      Swal.update({
        title: 'Still working on it...',
        text: "This is taking a bit longer than usual. Please don't close this window."
      });
    }
  }, 10000);
}

async function ensureMinimumLoadingTime() {
  if (tenSecTimer) {
    clearTimeout(tenSecTimer);
    tenSecTimer = null;
  }

  const elapsed = Date.now() - loadingStartTime;
  const remaining = Math.max(0, 500 - elapsed);

  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  isLoading = false;
}

function showSuccessAlert(title = 'Saved Successfully!', text = 'Your settings have been updated.') {
  Swal.fire({
    icon: 'success',
    title,
    text,
    customClass: swalCustomClass,
    confirmButtonText: 'OK'
  });
}

function showWarningAlert(title = 'Validation Warning', text = 'Please fill in all required fields.') {
  Swal.fire({
    icon: 'warning',
    title,
    text,
    customClass: swalCustomClass,
    confirmButtonText: 'OK'
  });
}

function showErrorAlert(title = 'Something Went Wrong!', text = 'Please try again later.') {
  Swal.fire({
    icon: 'error',
    title,
    text,
    customClass: swalCustomClass,
    confirmButtonText: 'OK'
  });
}

function showNetworkErrorAlert(title = 'Connection Failed', text = 'Please check your internet connection.') {
  Swal.fire({
    icon: 'error',
    title,
    text,
    customClass: swalCustomClass,
    confirmButtonText: 'OK'
  });
}

function showRateLimitAlert(title = 'Too Many Requests', text = 'Please wait 5 minutes and try again.') {
  Swal.fire({
    icon: 'warning',
    title,
    text,
    customClass: swalCustomClass,
    confirmButtonText: 'OK'
  });
}

// --- 2. Form Validation & Submission ---
function bindFormEvents() {
  const form = document.getElementById('preference-form');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isLoading) return;

    const job_keywords = document.getElementById('job_keywords').value.trim();
    const telegram_chat_id = document.getElementById('telegram_chat_id').value.trim();
    const locationStr = selectedLocations.length > 0 ? selectedLocations.join(', ') : document.getElementById('location').value.trim();
    const work_type = getSelectedWorkTypes();
    const job_posting_time = document.getElementById('job_posting_time').value;
    const experience_level = document.getElementById('experience_level').value || 'Fresher';
    const job_type = getSelectedJobTypes();
    
    // Sync hidden input value for job_type
    const hiddenJobType = document.getElementById('job_type');
    if (hiddenJobType) hiddenJobType.value = job_type;

    // Input Validation using SweetAlert2
    if (!job_keywords) {
      showWarningAlert('Validation Warning', 'Please enter job keywords.');
      document.getElementById('job_keywords').focus();
      return;
    }

    if (!telegram_chat_id) {
      showWarningAlert('Validation Warning', 'Please enter your Telegram Chat ID.');
      document.getElementById('telegram_chat_id').focus();
      return;
    }

    if (!/^-?\d+$/.test(telegram_chat_id)) {
      showWarningAlert('Validation Warning', 'Please enter a valid numeric Telegram Chat ID.');
      document.getElementById('telegram_chat_id').focus();
      return;
    }

    if (!locationStr) {
      showWarningAlert('Validation Warning', 'Please select at least one location.');
      document.getElementById('location-search-input').focus();
      return;
    }

    showLoadingAlert();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await API.savePreference({
        job_keywords,
        telegram_chat_id,
        location: locationStr,
        work_type: work_type.join(', '),
        job_posting_time,
        experience_level,
        job_type,
        user_id: 'usr_' + telegram_chat_id.replace(/[^0-9]/g, '')
      });

      await ensureMinimumLoadingTime();

      if (res.isNetworkError) {
        showNetworkErrorAlert('Connection Failed', 'Please check your internet connection.');
      } else if (res.isRateLimit) {
        showRateLimitAlert('Too Many Requests', 'Please wait 5 minutes and try again.');
      } else if (res.success) {
        showSuccessAlert('Preferences Saved!', 'Your settings have been updated.');
        loadPreferences();
        loadLatestStatus();
        loadHistoryRuns();
      } else {
        showErrorAlert('Something Went Wrong!', res.error || 'Please try again later.');
      }
    } catch (err) {
      await ensureMinimumLoadingTime();
      if (!navigator.onLine) {
        showNetworkErrorAlert('Connection Failed', 'Please check your internet connection.');
      } else {
        showErrorAlert('Something Went Wrong!', 'Please try again later.');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// 3. Chip Buttons Autofill for Keywords
function bindChipClickEvents() {
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const val = btn.getAttribute('data-value');
      const input = document.getElementById('job_keywords');
      if (input) {
        input.value = val;
        input.focus();
      }
    });
  });
}

// Helper: Alert Display (backwards compatibility)
function showAlert(type, message) {
  if (type === 'success') {
    showSuccessAlert('Preferences Saved!', message || 'Your settings have been updated.');
  } else if (type === 'warning') {
    showWarningAlert('Please fill in all required fields.', message || 'Some fields are missing or invalid.');
  } else if (type === 'network') {
    showNetworkErrorAlert('Connection Failed', message || 'Please check your internet connection.');
  } else if (type === 'ratelimit') {
    showRateLimitAlert('Too Many Requests', message || 'Please wait 5 minutes and try again.');
  } else {
    showErrorAlert('Something Went Wrong!', message || 'Please try again later.');
  }
}

// 4. System Connection Health Check
async function checkSystemStatus() {
  const badge = document.getElementById('system-status');
  const mobileBadge = document.getElementById('system-status-mobile');
  try {
    const res = await API.checkServerHealth();
    if (res.status === 'online') {
      const dbText = res.supabaseConfigured ? 'Supabase Connected' : 'Hybrid Local DB Active';
      const statusHtml = `<span class="status-pulse"></span> ${dbText} • System Online`;
      if (badge) badge.innerHTML = statusHtml;
      if (mobileBadge) mobileBadge.innerHTML = `<span class="status-pulse"></span> Online`;
    }
  } catch (err) {
    if (badge) badge.innerHTML = `<span class="status-pulse" style="background:var(--accent-rose)"></span> Server Disconnected`;
    if (mobileBadge) mobileBadge.innerHTML = `<span class="status-pulse" style="background:var(--accent-rose)"></span> Offline`;
  }
}

const POSTING_TIME_LABELS = {
  'r3600': 'Last 1 hour',
  'r21600': 'Last 6 hours',
  'r43200': 'Last 12 hours',
  'r86400': 'Last 24 hours',
  'any': 'Any time'
};

// 5. Load Saved User Preferences
async function loadPreferences() {
  const container = document.getElementById('preferences-list');
  if (!container) return;

  try {
    const res = await API.fetchPreferences();
    if (!res.success || !res.preferences || res.preferences.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No saved preferences yet. Fill out the form above to add your job search parameters!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = res.preferences.map(pref => {
      const wtStr = pref.work_type || 'Remote, Hybrid, On-site';
      const ptStr = POSTING_TIME_LABELS[pref.job_posting_time] || pref.job_posting_time || 'Any time';

      return `
        <div class="pref-card">
          <div class="pref-title">🎯 ${escapeHtml(pref.job_keywords)}</div>
          <div class="pref-meta">
            <div class="meta-item">📍 <strong>Location:</strong> ${escapeHtml(pref.location)}</div>
            <div class="meta-item">🌐 <strong>Work Type:</strong> ${escapeHtml(wtStr)}</div>
            <div class="meta-item">⏱️ <strong>Posted:</strong> ${escapeHtml(ptStr)}</div>
            <div class="meta-item">🎓 <strong>Experience:</strong> ${escapeHtml(pref.experience_level)}</div>
            <div class="meta-item">💼 <strong>Job Type:</strong> ${escapeHtml(pref.job_type)}</div>
            <div class="meta-item" style="margin-top:0.3rem">
              📲 <strong>Telegram:</strong> <span class="tg-pill">${escapeHtml(pref.telegram_chat_id)}</span>
            </div>
          </div>
          <button class="btn-secondary trigger-btn" data-id="${pref.id}">
            🚀 Run Scrape Now
          </button>
        </div>
      `;
    }).join('');

    // Attach trigger event handlers
    container.querySelectorAll('.trigger-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        btn.innerHTML = '⏳ Triggering...';
        try {
          const res = await API.triggerManualSearch({ preferenceId: id });
          if (res.isNetworkError) {
            showNetworkErrorAlert('Connection Failed', 'Please check your internet connection.');
          } else if (res.isRateLimit) {
            showRateLimitAlert('Too Many Requests', 'Please wait 5 minutes and try again.');
          } else if (res.success) {
            showSuccessAlert('Scrape Triggered!', 'Your workflow run has been started.');
            loadLatestStatus();
            loadHistoryRuns();
          } else {
            showErrorAlert('Something Went Wrong!', res.error || 'Please try again later.');
          }
        } catch (e) {
          showErrorAlert('Something Went Wrong!', 'Please try again later.');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '🚀 Run Scrape Now';
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Failed to load preferences.</div>`;
  }
}

// 6. Load Latest Execution Status
async function loadLatestStatus() {
  const container = document.getElementById('status-widget');
  if (!container) return;

  try {
    const res = await API.fetchLatestStatus();
    const latest = res.latest;

    if (!latest) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No active workflow runs yet. Click "Run Scrape Now" or submit new preferences to start.</p>
        </div>
      `;
      return;
    }

    const statusClass = latest.status || 'Pending';
    const startedTime = new Date(latest.started_at).toLocaleTimeString();
    const wtDisplay = latest.work_type || 'Remote, Hybrid, On-site';
    const ptDisplay = POSTING_TIME_LABELS[latest.job_posting_time] || latest.job_posting_time || 'Last 24 hours';

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <div>
          <span class="status-badge ${statusClass}">${statusClass}</span>
          <span style="font-size:0.85rem; color:var(--text-muted); margin-left:0.5rem;">Started at ${startedTime}</span>
        </div>
        <button class="btn-secondary" id="refresh-status-btn" style="font-size:0.75rem;">🔄 Refresh</button>
      </div>
      <div style="background:rgba(15,23,42,0.6); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-glass);">
        <div style="font-weight:700; font-size:1.05rem; margin-bottom:0.4rem;">
          💼 Keywords: <span style="color:#fff;">${escapeHtml(latest.job_keywords)}</span>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; font-size:0.85rem; color:var(--text-secondary);">
          <div>📍 Location: <strong>${escapeHtml(latest.location)}</strong></div>
          <div>🌐 Work Type: <strong>${escapeHtml(wtDisplay)}</strong></div>
          <div>⏱️ Posting Time: <strong>${escapeHtml(ptDisplay)}</strong></div>
          <div>🎓 Experience: <strong>${escapeHtml(latest.experience_level)}</strong></div>
          <div>💼 Job Type: <strong>${escapeHtml(latest.job_type)}</strong></div>
          <div>📲 Telegram ID: <strong style="color:var(--accent-cyan); font-family:monospace;">${escapeHtml(latest.telegram_chat_id)}</strong></div>
        </div>
        ${latest.search_url ? `
          <div style="margin-top:0.75rem; font-size:0.8rem; word-break:break-all;">
            🌐 <strong>Target LinkedIn Query:</strong><br/>
            <a href="${escapeHtml(latest.search_url)}" target="_blank" class="table-link">${escapeHtml(latest.search_url)}</a>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('refresh-status-btn')?.addEventListener('click', () => {
      loadLatestStatus();
      loadHistoryRuns();
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Failed to fetch workflow status.</div>`;
  }
}

// 7. Load History Runs Table
async function loadHistoryRuns() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  try {
    const res = await API.fetchRunsHistory();
    if (!res.success || !res.runs || res.runs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">No past execution runs recorded yet.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = res.runs.map(run => {
      const dateStr = new Date(run.started_at).toLocaleString();
      const statusBadge = `<span class="status-badge ${run.status}">${run.status}</span>`;
      const wtText = run.work_type ? ` (${run.work_type})` : '';
      return `
        <tr>
          <td><strong style="color:var(--text-primary);">${escapeHtml(run.job_keywords)}</strong></td>
          <td>${escapeHtml(run.location)}${escapeHtml(wtText)}</td>
          <td style="font-family:monospace; color:var(--accent-cyan);">${escapeHtml(run.telegram_chat_id)}</td>
          <td>${statusBadge}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
          <td>
            ${run.search_url ? `<a href="${escapeHtml(run.search_url)}" target="_blank" class="table-link">LinkedIn Query ↗</a>` : '-'}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error loading history.</td></tr>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
