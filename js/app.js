import { sb, S } from './state.js';
import { monthKey } from './helpers.js';
import { loadPlan, loadSettings, loadMonth, flushSave, hasPendingRetries } from './data.js';
import { renderAuth } from './auth.js';
import { renderCalendar } from './calendar.js';
import { renderDay } from './day.js';
import { renderPlan, applyTheme } from './plan.js';
// progress.js and analytics.js are lazy-loaded on first navigation
let progressModule = null;
let analyticsModule = null;

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => {
    console.warn('SW registration failed:', err);
  });
}

// ============================================================
// NAVIGATION
// ============================================================
async function showScreen(name) {
  flushSave();
  if (S.screen !== 'progress' && name !== 'progress' && progressModule) {
    progressModule.resetProgressState();
  }
  S.screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('#navbar button').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });
  if (name === 'calendar') await renderCalendar(showScreen);
  else if (name === 'day') await renderDay();
  else if (name === 'plan') renderPlan();
  else if (name === 'progress') {
    if (!progressModule) progressModule = await import('./progress.js');
    await progressModule.loadProgress();
    progressModule.renderProgress();
  }
  else if (name === 'analytics') {
    if (!analyticsModule) analyticsModule = await import('./analytics.js');
    analyticsModule.renderAnalytics();
  }
}

document.querySelectorAll('#navbar button').forEach(btn => {
  btn.onclick = async () => {
    if (btn.dataset.screen === 'day') S.selectedDate = new Date();
    await showScreen(btn.dataset.screen);
  };
});

// ============================================================
// INIT & AUTH FLOW
// ============================================================
function showLoadingOverlay(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
}

async function initApp(userId) {
  S.userId = userId;
  S.months = {};
  const now = new Date();
  S.calYear = now.getFullYear();
  S.calMonth = now.getMonth();
  S.selectedDate = new Date(now);

  showLoadingOverlay(true);
  try {
    await Promise.all([
      loadPlan(),
      loadSettings(),
      loadMonth(S.calYear, S.calMonth)
    ]);
    applyTheme(); // Apply saved theme preference
  } catch (err) {
    console.error('initApp error:', err);
  }

  // Check if onboarding needed
  const { shouldShowOnboarding, startOnboarding } = await import('./onboarding.js');
  if (shouldShowOnboarding()) {
    showLoadingOverlay(false);
    document.getElementById('navbar').style.display = 'none';
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-onboarding').classList.add('active');
    startOnboarding(async () => {
      document.getElementById('navbar').style.display = '';
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      await showScreen('calendar');
    });
    return;
  }

  // Show navbar, hide auth
  document.getElementById('navbar').style.display = '';
  showLoadingOverlay(false);
  await showScreen('calendar');

  // Init reminders if enabled
  if (S.settings.reminders && S.settings.reminders.enabled) {
    import('./notifications.js').then(m => m.scheduleReminders());
  }
}

function showAuthScreen() {
  S.userId = null;
  S.months = {};
  document.getElementById('navbar').style.display = 'none';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-auth').classList.add('active');
  renderAuth('login');
  showLoadingOverlay(false);
}

// Listen for auth state changes
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    initApp(session.user.id);
  } else if (event === 'SIGNED_OUT') {
    showAuthScreen();
  }
});

// Initial session check
(async () => {
  showLoadingOverlay(true);
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await initApp(session.user.id);
  } else {
    showAuthScreen();
  }
})();

// Flush save before the user leaves the page; warn if retries pending
window.addEventListener('beforeunload', (e) => {
  flushSave();
  if (hasPendingRetries()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
