// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => {
    console.warn('SW registration failed:', err);
  });
}

// ============================================================
// SUPABASE CLIENT
// ============================================================
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// STATE
// ============================================================
const S = {
  userId: null,
  screen: 'calendar',
  plan: { meals: [] },
  settings: { stepTarget: 10000, sleepTarget: 8 },
  selectedDate: new Date(),
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  months: {},
  saveTimer: null,
  savePendingMonth: null,
  extraFormOpen: false
};

// ============================================================
// HELPERS
// ============================================================
function todayStr() { return fmtDate(new Date()); }

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function parseDateParts(s) {
  const p = s.split('-');
  return { year: p[0], month: p[1], day: p[2], mk: p[0] + '-' + p[1] };
}

function parseDate(s) {
  const p = s.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function escH(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ============================================================
// SVG ICONS
// ============================================================
const SVG_CHEVRON_LEFT = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 4 7 10 13 16"/></svg>`;
const SVG_CHEVRON_RIGHT = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 4 13 10 7 16"/></svg>`;
const SVG_X_CIRCLE = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><line x1="7" y1="7" x2="13" y2="13"/><line x1="13" y1="7" x2="7" y2="13"/></svg>`;
const SVG_PLUS = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>`;
const SVG_DUMBBELL = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="10" x2="16" y2="10"/><rect x="2" y="7" width="3" height="6" rx="1"/><rect x="15" y="7" width="3" height="6" rx="1"/></svg>`;

// ============================================================
// DATA ACCESS (Supabase)
// ============================================================
async function loadPlan() {
  const { data, error } = await sb
    .from('plans')
    .select('data')
    .eq('user_id', S.userId)
    .maybeSingle();
  if (data && data.data) S.plan = data.data;
}

async function savePlan() {
  await sb.from('plans').upsert({
    user_id: S.userId,
    data: S.plan,
    updated_at: new Date().toISOString()
  });
}

async function loadSettings() {
  const { data, error } = await sb
    .from('settings')
    .select('data')
    .eq('user_id', S.userId)
    .maybeSingle();
  if (data && data.data) S.settings = { ...S.settings, ...data.data };
}

async function saveSettings() {
  await sb.from('settings').upsert({
    user_id: S.userId,
    data: S.settings,
    updated_at: new Date().toISOString()
  });
}

async function loadMonth(y, m) {
  const k = monthKey(y, m);
  if (S.months[k]) return;
  const { data, error } = await sb
    .from('day_logs')
    .select('data')
    .eq('user_id', S.userId)
    .eq('month_key', k)
    .maybeSingle();
  S.months[k] = (data && data.data) ? data.data : {};
}

function getDayLog(dateStr) {
  const parts = parseDateParts(dateStr);
  if (!S.months[parts.mk]) S.months[parts.mk] = {};
  if (!S.months[parts.mk][parts.day]) {
    S.months[parts.mk][parts.day] = {
      items: {}, extras: [], steps: 0,
      resistanceTraining: false, sleep: 0
    };
  }
  return S.months[parts.mk][parts.day];
}

async function saveMonth(mk) {
  await sb.from('day_logs').upsert({
    user_id: S.userId,
    month_key: mk,
    data: S.months[mk] || {},
    updated_at: new Date().toISOString()
  });
}

// Flush any pending debounced save immediately
function flushSave() {
  if (S.saveTimer) {
    clearTimeout(S.saveTimer);
    S.saveTimer = null;
    if (S.savePendingMonth) {
      const mk = S.savePendingMonth;
      S.savePendingMonth = null;
      saveMonth(mk); // fire-and-forget
    }
  }
}

function scheduleSave(dateStr) {
  const mk = dateStr
    ? dateStr.substring(0, 7)
    : fmtDate(S.selectedDate).substring(0, 7);

  if (S.savePendingMonth && S.savePendingMonth !== mk) {
    flushSave();
  }

  clearTimeout(S.saveTimer);
  S.savePendingMonth = mk;
  S.saveTimer = setTimeout(() => {
    saveMonth(mk); // fire-and-forget
    S.saveTimer = null;
    S.savePendingMonth = null;
  }, 400);
}

// ============================================================
// MACROS & SCORING
// ============================================================
function planTargets() {
  let c = 0, p = 0, cb = 0, f = 0;
  for (const meal of S.plan.meals) {
    for (const it of meal.items) {
      c += safeNum(it.calories);
      p += safeNum(it.protein);
      cb += safeNum(it.carbs);
      f += safeNum(it.fat);
    }
  }
  return { calories: c, protein: p, carbs: cb, fat: f };
}

function consumedMacros(log) {
  let c = 0, p = 0, cb = 0, f = 0;
  for (let mi = 0; mi < S.plan.meals.length; mi++) {
    for (let ii = 0; ii < S.plan.meals[mi].items.length; ii++) {
      const key = mi + '_' + ii;
      const e = log.items && log.items[key];
      if (e && e.checked) {
        const aq = safeNum(e.actualQty);
        if (aq > 0) {
          const it = S.plan.meals[mi].items[ii];
          const qty = safeNum(it.qty);
          const r = qty > 0 ? aq / qty : 0;
          c += safeNum(it.calories) * r;
          p += safeNum(it.protein) * r;
          cb += safeNum(it.carbs) * r;
          f += safeNum(it.fat) * r;
        }
      }
    }
  }
  for (const ex of (log.extras || [])) {
    c += safeNum(ex.calories);
    p += safeNum(ex.protein);
    cb += safeNum(ex.carbs);
    f += safeNum(ex.fat);
  }
  return {
    calories: Math.round(c),
    protein: Math.round(p),
    carbs: Math.round(cb),
    fat: Math.round(f)
  };
}

function calcScore(log) {
  if (!hasDayData(log)) return null;

  const extraCount = (log.extras || []).length;
  let allChecked = true;
  let hasItems = false;
  for (let mi = 0; mi < S.plan.meals.length; mi++) {
    for (let ii = 0; ii < S.plan.meals[mi].items.length; ii++) {
      hasItems = true;
      if (!(log.items && log.items[mi + '_' + ii] && log.items[mi + '_' + ii].checked)) {
        allChecked = false;
      }
    }
  }
  if (!hasItems) allChecked = true;

  let diet;
  if (allChecked && extraCount === 0) diet = 3;
  else if (extraCount <= 1) diet = 2;
  else if (extraCount <= 2) diet = 1;
  else diet = 0;

  const steps = safeNum(log.steps);
  let st;
  if (steps >= 10000) st = 3;
  else if (steps >= 8000) st = 2;
  else if (steps >= 6000) st = 1;
  else st = 0;

  const combined = Math.min(diet, st);
  const names = ['fail', 'bronze', 'silver', 'gold'];
  return { diet: names[diet], steps: names[st], combined: names[combined] };
}

function parsePlanText(text) {
  const lines = text.split('\n');
  const meals = [];
  let currentMeal = null;

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.indexOf(',') === -1) {
      currentMeal = { name: line, items: [] };
      meals.push(currentMeal);
    } else if (currentMeal) {
      const parts = line.split(',').map(s => s.trim());
      const name = parts[0] || '';
      let qty = 1, unit = 'g';
      let calories = 0, protein = 0, carbs = 0, fat = 0;

      if (parts[1]) {
        const qm = parts[1].match(/^([\d.]+)\s*(.*)/);
        if (qm) {
          qty = parseFloat(qm[1]) || 1;
          unit = qm[2].trim() || 'g';
        } else {
          unit = parts[1];
        }
      }

      for (let i = 2; i < parts.length; i++) {
        const p = parts[i];
        const cm = p.match(/([\d.]+)\s*cal/i);
        if (cm) { calories = parseFloat(cm[1]) || 0; continue; }
        const pm = p.match(/([\d.]+)\s*p/i);
        if (pm) { protein = parseFloat(pm[1]) || 0; continue; }
        const cbm = p.match(/([\d.]+)\s*c/i);
        if (cbm) { carbs = parseFloat(cbm[1]) || 0; continue; }
        const fm = p.match(/([\d.]+)\s*f/i);
        if (fm) { fat = parseFloat(fm[1]) || 0; continue; }
      }

      currentMeal.items.push({ name, qty, unit, protein, carbs, fat, calories });
    }
  }
  return { meals };
}

function hasDayData(log) {
  if (!log) return false;
  if (safeNum(log.steps) > 0 || safeNum(log.sleep) > 0 || log.resistanceTraining) return true;
  if (log.extras && log.extras.length > 0) return true;
  if (log.items) {
    for (const k in log.items) {
      if (log.items[k].checked) return true;
    }
  }
  return false;
}

// ============================================================
// CIRCLE SVG
// ============================================================
function circleSVG(val, max, color, size) {
  const v = Math.max(0, safeNum(val));
  const mx = Math.max(0, safeNum(max));
  const r = 40;
  const circ = 2 * Math.PI * r;
  const pct = mx > 0 ? Math.max(0, Math.min(v / mx, 1)) : 0;
  const isOver = v > mx && mx > 0;
  const stroke = isOver ? 'var(--red)' : color;
  const offset = circ * (1 - pct);
  return `<div class="circle-container" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="${r}" class="ring-bg"/>
      <circle cx="50" cy="50" r="${r}" class="ring-fg" stroke="${stroke}"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
    </svg>
    <div class="circle-val" style="color:${color}">${Math.round(v)}<small>/ ${Math.round(mx)}</small></div>
  </div>`;
}

function macroBarPct(val, max) {
  if (max <= 0) return 0;
  return Math.min(Math.round((val / max) * 100), 100);
}

function macroBarColor(val, max, color) {
  return val > max && max > 0 ? 'var(--red)' : color;
}

function renderMacrosCard(consumed, targets) {
  const calPct = macroBarPct(consumed.calories, targets.calories);
  const calColor = macroBarColor(consumed.calories, targets.calories, 'var(--cal-color)');
  const rows = [
    { label: 'Protein', cls: 'pro', val: consumed.protein, max: targets.protein, color: 'var(--pro-color)', unit: 'g' },
    { label: 'Carbs', cls: 'carb', val: consumed.carbs, max: targets.carbs, color: 'var(--carb-color)', unit: 'g' },
    { label: 'Fat', cls: 'fat', val: consumed.fat, max: targets.fat, color: 'var(--fat-color)', unit: 'g' },
  ];

  let html = `<div class="macros-card" id="macros-card">
    <div class="macro-main">
      <span class="macro-main-val">${Math.round(consumed.calories)}</span>
      <span class="macro-main-target">/ ${Math.round(targets.calories)}</span>
      <span class="macro-main-label">Calories</span>
    </div>
    <div class="macro-main-bar">
      <div class="macro-main-bar-fill" style="width:${calPct}%;background:${calColor}"></div>
    </div>
    <div class="macro-rows">`;

  for (const r of rows) {
    const pct = macroBarPct(r.val, r.max);
    const c = macroBarColor(r.val, r.max, r.color);
    html += `<div class="macro-row">
      <span class="macro-row-label ${r.cls}">${r.label}</span>
      <div class="macro-row-bar"><div class="macro-row-bar-fill" style="width:${pct}%;background:${c}"></div></div>
      <span class="macro-row-vals">${Math.round(r.val)} <small>/ ${Math.round(r.max)}${r.unit}</small></span>
    </div>`;
  }

  html += `</div></div>`;
  return html;
}

// ============================================================
// NAVIGATION
// ============================================================
async function showScreen(name) {
  flushSave();
  S.screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('#navbar button').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });
  if (name === 'calendar') await renderCalendar();
  else if (name === 'day') await renderDay();
  else if (name === 'plan') renderPlan();
}

document.querySelectorAll('#navbar button').forEach(btn => {
  btn.onclick = async () => {
    if (btn.dataset.screen === 'day') S.selectedDate = new Date();
    await showScreen(btn.dataset.screen);
  };
});

// ============================================================
// AUTH SCREEN
// ============================================================
function renderAuth(mode) {
  mode = mode || 'login';
  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isMagic = mode === 'magic';

  let html = `<div class="auth-container">
    <div class="auth-card">
      <div class="auth-title">WellTrack</div>
      <div class="auth-subtitle">${isLogin ? 'Sign in to your account' : isSignup ? 'Create a new account' : 'Sign in with magic link'}</div>
      <div class="auth-error" id="auth-error"></div>
      <div class="auth-success" id="auth-success"></div>
      <form id="auth-form">
        <input type="email" id="auth-email" placeholder="Email address" required autocomplete="email">`;

  if (!isMagic) {
    html += `<input type="password" id="auth-password" placeholder="Password" required autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="6">`;
  }

  html += `<button type="submit" class="btn btn-primary">${isLogin ? 'Sign In' : isSignup ? 'Sign Up' : 'Send Magic Link'}</button>
      </form>`;

  if (!isMagic) {
    html += `<div class="auth-divider">or</div>
      <button class="btn btn-secondary" id="auth-magic-btn" style="width:100%">Send Magic Link</button>`;
  }

  if (isLogin) {
    html += `<div class="auth-toggle">Don't have an account? <a id="auth-switch">Sign up</a></div>`;
  } else if (isSignup) {
    html += `<div class="auth-toggle">Already have an account? <a id="auth-switch">Sign in</a></div>`;
  } else {
    html += `<div class="auth-toggle">Back to <a id="auth-switch">Sign in</a></div>`;
  }

  html += `</div></div>`;

  document.getElementById('screen-auth').innerHTML = html;
  attachAuthEvents(mode);
}

function attachAuthEvents(mode) {
  const form = document.getElementById('auth-form');
  const errorEl = document.getElementById('auth-error');
  const successEl = document.getElementById('auth-success');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add('visible');
    successEl.classList.remove('visible');
  }

  function showSuccess(msg) {
    successEl.textContent = msg;
    successEl.classList.add('visible');
    errorEl.classList.remove('visible');
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const submitBtn = form.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    errorEl.classList.remove('visible');
    successEl.classList.remove('visible');

    try {
      if (mode === 'magic') {
        const { error } = await sb.auth.signInWithOtp({ email });
        if (error) throw error;
        showSuccess('Check your email for the magic link!');
      } else if (mode === 'signup') {
        const password = document.getElementById('auth-password').value;
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        showSuccess('Account created! Check your email to confirm, then sign in.');
      } else {
        const password = document.getElementById('auth-password').value;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange will handle navigation
      }
    } catch (err) {
      showError(err.message || 'An error occurred');
    } finally {
      submitBtn.disabled = false;
    }
  };

  const switchLink = document.getElementById('auth-switch');
  if (switchLink) {
    switchLink.onclick = () => {
      if (mode === 'login') renderAuth('signup');
      else renderAuth('login');
    };
  }

  const magicBtn = document.getElementById('auth-magic-btn');
  if (magicBtn) {
    magicBtn.onclick = () => renderAuth('magic');
  }
}

// ============================================================
// CALENDAR
// ============================================================
async function renderCalendar() {
  await loadMonth(S.calYear, S.calMonth);
  const mk = monthKey(S.calYear, S.calMonth);
  const logs = S.months[mk] || {};
  const today = todayStr();
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  const firstDay = new Date(S.calYear, S.calMonth, 1).getDay();
  const daysInMonth = new Date(S.calYear, S.calMonth + 1, 0).getDate();

  let html = `
    <div class="screen-title">Calendar</div>
    <div class="nav-bar">
      <button class="nav-btn" id="cal-prev">${SVG_CHEVRON_LEFT}</button>
      <div style="text-align:center">
        <div class="nav-label">${monthNames[S.calMonth]} ${S.calYear}</div>
        <button class="btn-today" id="cal-today">Today</button>
      </div>
      <button class="nav-btn" id="cal-next">${SVG_CHEVRON_RIGHT}</button>
    </div>
    <div class="cal-weekdays">
      <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
    </div>
    <div class="cal-grid">`;

  let tierCounts = { gold: 0, silver: 0, bronze: 0, fail: 0 };
  let trackedDays = 0;

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = fmtDate(new Date(S.calYear, S.calMonth, d));
    const dk = String(d).padStart(2, '0');
    const log = logs[dk];
    const score = log ? calcScore(log) : null;
    const cls = ['cal-day'];
    if (ds === today) cls.push('today');
    if (score) {
      cls.push(score.combined);
      tierCounts[score.combined]++;
      trackedDays++;
    }

    let icons = '';
    if (log) {
      if (log.resistanceTraining) icons += `<span class="cal-icon-rt" title="Training">${SVG_DUMBBELL}</span>`;
      if (safeNum(log.sleep) > 0) icons += `<span>${log.sleep}h</span>`;
    }

    html += `<div class="${cls.join(' ')}" data-date="${ds}">
      <span class="cal-num">${d}</span>
      ${icons ? `<span class="cal-icons">${icons}</span>` : ''}
    </div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailing; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  html += '</div>';

  html += `<div class="cal-legend">
    <span><span class="dot dot-gold"></span> Gold</span>
    <span><span class="dot dot-silver"></span> Silver</span>
    <span><span class="dot dot-bronze"></span> Bronze</span>
    <span><span class="dot dot-fail"></span> Fail</span>
  </div>`;

  if (trackedDays > 0) {
    html += `<div class="month-summary">
      <div class="month-summary-title">Month Summary &mdash; ${trackedDays} day${trackedDays !== 1 ? 's' : ''} tracked</div>
      <div class="month-summary-counts">
        <div class="ms-item"><div class="ms-val gold">${tierCounts.gold}</div><div class="ms-label">Gold</div></div>
        <div class="ms-item"><div class="ms-val silver">${tierCounts.silver}</div><div class="ms-label">Silver</div></div>
        <div class="ms-item"><div class="ms-val bronze">${tierCounts.bronze}</div><div class="ms-label">Bronze</div></div>
        <div class="ms-item"><div class="ms-val fail">${tierCounts.fail}</div><div class="ms-label">Fail</div></div>
      </div>
    </div>`;
  }

  document.getElementById('screen-calendar').innerHTML = html;

  document.getElementById('cal-prev').onclick = async () => {
    S.calMonth--;
    if (S.calMonth < 0) { S.calMonth = 11; S.calYear--; }
    await renderCalendar();
  };
  document.getElementById('cal-next').onclick = async () => {
    S.calMonth++;
    if (S.calMonth > 11) { S.calMonth = 0; S.calYear++; }
    await renderCalendar();
  };
  document.getElementById('cal-today').onclick = async () => {
    const now = new Date();
    S.calYear = now.getFullYear();
    S.calMonth = now.getMonth();
    await renderCalendar();
  };
  document.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.onclick = async () => {
      S.selectedDate = parseDate(el.dataset.date);
      await showScreen('day');
    };
  });
}

// ============================================================
// DAY VIEW
// ============================================================
function itemMacroLine(item, ratio) {
  const cal = Math.round(safeNum(item.calories) * ratio);
  const pro = Math.round(safeNum(item.protein) * ratio * 10) / 10;
  const carb = Math.round(safeNum(item.carbs) * ratio * 10) / 10;
  const fat = Math.round(safeNum(item.fat) * ratio * 10) / 10;
  return `<div class="macro-line"><span class="mc-cal">${cal}cal</span><span class="mc-pro">${pro}p</span><span class="mc-carb">${carb}c</span><span class="mc-fat">${fat}f</span></div>`;
}

async function renderDay() {
  const ds = fmtDate(S.selectedDate);
  await loadMonth(S.selectedDate.getFullYear(), S.selectedDate.getMonth());
  const log = getDayLog(ds);
  const targets = planTargets();
  const consumed = consumedMacros(log);
  const score = calcScore(log);

  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dtLabel = `${weekdays[S.selectedDate.getDay()]}, ${monthNames[S.selectedDate.getMonth()]} ${S.selectedDate.getDate()}, ${S.selectedDate.getFullYear()}`;

  let html = `
    <div class="nav-bar">
      <button class="nav-btn" id="day-prev">${SVG_CHEVRON_LEFT}</button>
      <div style="text-align:center">
        <div class="nav-label">${dtLabel}</div>
        ${score
          ? `<div style="margin-top:4px"><span class="score-badge ${score.combined}">${score.combined}</span></div>`
          : ''}
      </div>
      <button class="nav-btn" id="day-next">${SVG_CHEVRON_RIGHT}</button>
    </div>`;

  if (S.plan.meals.length > 0) {
    html += renderMacrosCard(consumed, targets);
  }

  html += `<div class="card">
    <div class="steps-row">
      ${circleSVG(log.steps || 0, S.settings.stepTarget, 'var(--steps-color)', 70)}
      <div class="steps-input-wrap">
        <input type="number" id="inp-steps" value="${log.steps || ''}"
          placeholder="Steps walked" min="0" step="100" inputmode="numeric">
        <div class="steps-target">Target: ${S.settings.stepTarget.toLocaleString()} steps</div>
      </div>
    </div>
    <div class="wellness-row">
      <div class="wellness-item">
        <label>Resistance Training</label>
        <label class="toggle">
          <input type="checkbox" id="inp-rt" ${log.resistanceTraining ? 'checked' : ''}>
          <span class="toggle-track"></span><span class="toggle-knob"></span>
        </label>
      </div>
      <div class="wellness-item">
        <label>Sleep</label>
        <div class="sleep-input">
          <input type="number" id="inp-sleep" value="${log.sleep || ''}"
            placeholder="0" min="0" max="24" step="0.5" inputmode="decimal">
          <span>/ ${S.settings.sleepTarget} hrs</span>
        </div>
      </div>
    </div>
  </div>`;

  if (S.plan.meals.length === 0) {
    html += '<div class="empty-msg">No diet plan set up yet.<br>Go to the Plan tab to create one.</div>';
  } else {
    S.plan.meals.forEach((meal, mi) => {
      html += `<div class="meal-section card"><div class="meal-section-hdr">${escH(meal.name)}</div>`;
      meal.items.forEach((item, ii) => {
        const key = mi + '_' + ii;
        const e = (log.items && log.items[key]) || { checked: false, actualQty: 0 };
        const aq = safeNum(e.actualQty);
        const qty = safeNum(item.qty);
        const ratio = (e.checked && qty > 0 && aq > 0) ? aq / qty : 0;
        const isModified = e.checked && aq !== qty;

        html += `<div class="day-item ${e.checked ? 'checked' : ''}" data-key="${key}">
          <button class="day-check ${e.checked ? 'on' : ''}" data-mi="${mi}" data-ii="${ii}"></button>
          <div class="day-item-body">
            <div class="day-item-name">${escH(item.name)}</div>
            ${e.checked
              ? `${itemMacroLine(item, ratio)}
                 <div class="qty-ctrl">
                   <button class="qty-btn" data-mi="${mi}" data-ii="${ii}" data-dir="-1">&minus;</button>
                   <span class="qty-val${isModified ? ' modified' : ''}">${aq} ${escH(item.unit)}</span>
                   <button class="qty-btn" data-mi="${mi}" data-ii="${ii}" data-dir="1">+</button>
                 </div>`
              : `<div class="macro-line-muted">${qty} ${escH(item.unit)}</div>`}
          </div>
        </div>`;
      });
      html += '</div>';
    });
  }

  html += `<div class="extras-hdr">
    <span>Extra Items (${(log.extras || []).length})</span>
    <button class="btn btn-sm btn-primary" id="btn-add-extra">${SVG_PLUS} Add</button>
  </div>`;
  html += '<div id="extra-form-area"></div>';

  (log.extras || []).forEach((ex, ei) => {
    html += `<div class="extra-item">
      <div class="extra-item-info">
        <div class="extra-item-name">${escH(ex.name)}${ex.qty > 1 ? ' (x' + ex.qty + ')' : ''}</div>
        <div class="extra-item-macros"><span class="mc-cal">${ex.calories}cal</span> <span class="mc-pro">${ex.protein}p</span> <span class="mc-carb">${ex.carbs}c</span> <span class="mc-fat">${ex.fat}f</span></div>
      </div>
      <button class="extra-del" data-ei="${ei}">${SVG_X_CIRCLE}</button>
    </div>`;
  });

  if (score) {
    html += `<div class="scoring-card">
      <div class="scoring-section"><div class="scoring-label">Diet</div><span class="score-badge ${score.diet}">${score.diet}</span></div>
      <div class="scoring-section"><div class="scoring-label">Steps</div><span class="score-badge ${score.steps}">${score.steps}</span></div>
      <div class="scoring-divider"></div>
      <div class="scoring-section"><div class="scoring-label">Overall</div><span class="score-badge ${score.combined}">${score.combined}</span></div>
    </div>`;
  }

  document.getElementById('screen-day').innerHTML = html;
  S.extraFormOpen = false;
  attachDayEvents(ds);
}

function attachDayEvents(ds) {
  const el = document.getElementById('screen-day');

  document.getElementById('day-prev').onclick = async () => {
    flushSave();
    S.selectedDate.setDate(S.selectedDate.getDate() - 1);
    await renderDay();
  };
  document.getElementById('day-next').onclick = async () => {
    flushSave();
    S.selectedDate.setDate(S.selectedDate.getDate() + 1);
    await renderDay();
  };

  el.querySelectorAll('.day-check').forEach(btn => {
    btn.onclick = () => {
      const mi = +btn.dataset.mi, ii = +btn.dataset.ii, key = mi + '_' + ii;
      const log = getDayLog(ds);
      if (!log.items) log.items = {};
      if (!log.items[key]) log.items[key] = { checked: false, actualQty: 0 };
      const wasChecked = log.items[key].checked;
      log.items[key].checked = !wasChecked;
      if (!wasChecked) {
        log.items[key].actualQty = log.items[key].actualQty || S.plan.meals[mi].items[ii].qty;
      }
      scheduleSave(ds);
      renderDay();
    };
  });

  el.querySelectorAll('.qty-btn').forEach(btn => {
    btn.onclick = () => {
      const mi = +btn.dataset.mi, ii = +btn.dataset.ii, key = mi + '_' + ii;
      const dir = +btn.dataset.dir;
      const log = getDayLog(ds);
      if (!log.items || !log.items[key]) return;
      const item = S.plan.meals[mi].items[ii];
      const step = item.unit === 'g' ? 10 : 0.5;
      log.items[key].actualQty = Math.max(0, safeNum(log.items[key].actualQty) + dir * step);
      scheduleSave(ds);
      renderDay();
    };
  });

  const stepsInp = document.getElementById('inp-steps');
  if (stepsInp) stepsInp.addEventListener('input', () => {
    getDayLog(ds).steps = Math.max(0, parseInt(stepsInp.value) || 0);
    scheduleSave(ds);
    updateDayCircles(ds);
  });

  const rtInp = document.getElementById('inp-rt');
  if (rtInp) rtInp.addEventListener('change', () => {
    getDayLog(ds).resistanceTraining = rtInp.checked;
    scheduleSave(ds);
  });

  const sleepInp = document.getElementById('inp-sleep');
  if (sleepInp) sleepInp.addEventListener('input', () => {
    getDayLog(ds).sleep = Math.max(0, parseFloat(sleepInp.value) || 0);
    scheduleSave(ds);
  });

  document.getElementById('btn-add-extra').onclick = () => {
    if (S.extraFormOpen) return;
    S.extraFormOpen = true;
    const area = document.getElementById('extra-form-area');
    area.innerHTML = `<div class="extra-form">
      <input type="text" id="ef-name" placeholder="Item name">
      <div class="ef-grid">
        <div><label>Calories</label><input type="number" id="ef-cal" min="0" inputmode="numeric"></div>
        <div><label>Protein (g)</label><input type="number" id="ef-pro" min="0" step="0.1" inputmode="decimal"></div>
        <div><label>Carbs (g)</label><input type="number" id="ef-carb" min="0" step="0.1" inputmode="decimal"></div>
        <div><label>Fat (g)</label><input type="number" id="ef-fat" min="0" step="0.1" inputmode="decimal"></div>
      </div>
      <div class="ef-btns">
        <button class="btn btn-sm btn-secondary" id="ef-cancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="ef-save">Add</button>
      </div>
    </div>`;
    document.getElementById('ef-cancel').onclick = () => {
      area.innerHTML = '';
      S.extraFormOpen = false;
    };
    document.getElementById('ef-save').onclick = () => {
      const name = document.getElementById('ef-name').value.trim();
      if (!name) { document.getElementById('ef-name').focus(); return; }
      const log = getDayLog(ds);
      if (!log.extras) log.extras = [];
      log.extras.push({
        name,
        calories: Math.max(0, parseInt(document.getElementById('ef-cal').value) || 0),
        protein: Math.max(0, parseFloat(document.getElementById('ef-pro').value) || 0),
        carbs: Math.max(0, parseFloat(document.getElementById('ef-carb').value) || 0),
        fat: Math.max(0, parseFloat(document.getElementById('ef-fat').value) || 0),
        qty: 1
      });
      scheduleSave(ds);
      renderDay();
    };
  };

  el.querySelectorAll('.extra-del').forEach(btn => {
    btn.onclick = () => {
      const log = getDayLog(ds);
      log.extras.splice(+btn.dataset.ei, 1);
      scheduleSave(ds);
      renderDay();
    };
  });
}

function updateDayCircles(ds) {
  const log = getDayLog(ds);
  const targets = planTargets();
  const consumed = consumedMacros(log);
  const score = calcScore(log);

  const macrosCard = document.getElementById('macros-card');
  if (macrosCard) {
    const tmp = document.createElement('div');
    tmp.innerHTML = renderMacrosCard(consumed, targets);
    macrosCard.replaceWith(tmp.firstElementChild);
  }

  const stepsRow = document.querySelector('#screen-day .steps-row');
  if (stepsRow) {
    const cc = stepsRow.querySelector('.circle-container');
    if (cc) {
      const tmp = document.createElement('div');
      tmp.innerHTML = circleSVG(log.steps || 0, S.settings.stepTarget, 'var(--steps-color)', 70);
      cc.replaceWith(tmp.firstElementChild);
    }
  }

  const nb = document.querySelector('#screen-day .nav-bar > div');
  if (nb) {
    let badgeEl = nb.querySelector('.score-badge');
    if (score) {
      if (!badgeEl) {
        const d = document.createElement('div');
        d.style.marginTop = '4px';
        d.innerHTML = `<span class="score-badge ${score.combined}">${score.combined}</span>`;
        nb.appendChild(d);
      } else {
        badgeEl.className = 'score-badge ' + score.combined;
        badgeEl.textContent = score.combined;
      }
    }
  }

  const scoringCard = document.querySelector('#screen-day .scoring-card');
  if (scoringCard && score) {
    const sections = scoringCard.querySelectorAll('.scoring-section');
    if (sections.length >= 3) {
      sections[0].querySelector('.score-badge').className = 'score-badge ' + score.diet;
      sections[0].querySelector('.score-badge').textContent = score.diet;
      sections[1].querySelector('.score-badge').className = 'score-badge ' + score.steps;
      sections[1].querySelector('.score-badge').textContent = score.steps;
      sections[2].querySelector('.score-badge').className = 'score-badge ' + score.combined;
      sections[2].querySelector('.score-badge').textContent = score.combined;
    }
  }
}

// ============================================================
// PLAN EDITOR
// ============================================================
function renderPlan() {
  let html = '<div class="screen-title">Diet Plan</div>';

  html += `<div class="card import-card">
    <div class="card-title">
      <span>Import Plan from Text</span>
      <button class="btn btn-sm btn-secondary" id="btn-toggle-import">Show</button>
    </div>
    <div id="import-body" style="display:none">
      <textarea id="import-text" rows="8" placeholder="Breakfast\nOatmeal, 50g, 180cal, 6p, 27c, 4f\nBanana, 1 medium, 105cal, 1.3p, 27c, 0.4f\n\nLunch\nChicken Breast, 150g, 165cal, 35p, 0c, 5f\nRice, 100g, 120cal, 2p, 28c, 0f"></textarea>
      <button class="btn btn-sm btn-primary" id="btn-import-text" style="margin-top:8px">Import</button>
    </div>
  </div>`;

  html += `<div class="card settings-card"><div class="card-title">Settings</div>
    <div class="setting-row"><label>Step Target</label>
      <input type="number" id="set-steps" value="${S.settings.stepTarget}" min="0" step="500" inputmode="numeric">
    </div>
    <div class="setting-row"><label>Sleep Target (hrs)</label>
      <input type="number" id="set-sleep" value="${S.settings.sleepTarget}" min="0" max="24" step="0.5" inputmode="decimal">
    </div>
  </div>`;

  S.plan.meals.forEach((meal, mi) => {
    html += `<div class="plan-meal" data-mi="${mi}">
      <div class="plan-meal-hdr">
        <input type="text" value="${escH(meal.name)}" data-field="mealname" data-mi="${mi}" placeholder="Meal name">
        <button class="btn-danger" data-action="del-meal" data-mi="${mi}">${SVG_X_CIRCLE}</button>
      </div>
      <div class="plan-items">`;

    if (meal.items.length > 0) {
      html += `<div class="plan-item-labels">
        <span>Item</span><span>Qty</span><span>Cal</span><span>P</span><span>C</span><span>F</span><span></span>
      </div>`;
    }

    meal.items.forEach((item, ii) => {
      html += `<div class="plan-item" data-mi="${mi}" data-ii="${ii}">
        <div class="plan-item-grid">
          <input type="text" value="${escH(item.name)}" data-field="name" data-mi="${mi}" data-ii="${ii}" placeholder="Food item">
          <div class="pi-qty-wrap">
            <input type="number" value="${item.qty}" data-field="qty" data-mi="${mi}" data-ii="${ii}" min="0" step="0.5" placeholder="Qty" inputmode="decimal">
            <input type="text" value="${escH(item.unit)}" data-field="unit" data-mi="${mi}" data-ii="${ii}" placeholder="unit">
          </div>
          <input type="number" class="pi-cal" value="${item.calories}" data-field="calories" data-mi="${mi}" data-ii="${ii}" min="0" step="1" inputmode="numeric" placeholder="0">
          <input type="number" class="pi-pro" value="${item.protein}" data-field="protein" data-mi="${mi}" data-ii="${ii}" min="0" step="0.1" inputmode="decimal" placeholder="0">
          <input type="number" class="pi-carb" value="${item.carbs}" data-field="carbs" data-mi="${mi}" data-ii="${ii}" min="0" step="0.1" inputmode="decimal" placeholder="0">
          <input type="number" class="pi-fat" value="${item.fat}" data-field="fat" data-mi="${mi}" data-ii="${ii}" min="0" step="0.1" inputmode="decimal" placeholder="0">
          <button class="btn-danger" data-action="del-item" data-mi="${mi}" data-ii="${ii}" style="min-width:32px;min-height:32px">${SVG_X_CIRCLE}</button>
        </div>
      </div>`;
    });

    html += `<button class="btn-add" data-action="add-item" data-mi="${mi}">${SVG_PLUS} Add Food Item</button>
      </div></div>`;
  });

  html += `<button class="btn-add" id="btn-add-meal" style="margin-bottom:12px">${SVG_PLUS} Add Meal</button>
    <div class="plan-actions">
      <button class="btn btn-primary" id="btn-save-plan">Save Plan</button>
    </div>`;

  // Data management
  html += `<div class="card" style="margin-top:16px">
    <div class="card-title">Data</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm btn-secondary" id="btn-export">Export JSON</button>
      <label class="btn btn-sm btn-secondary" style="cursor:pointer">
        Import JSON<input type="file" id="btn-import" accept=".json" style="display:none">
      </label>
    </div>
  </div>`;

  // Logout
  html += `<div class="card" style="margin-top:4px">
    <button class="btn-logout" id="btn-logout">Sign Out</button>
  </div>`;

  document.getElementById('screen-plan').innerHTML = html;
  attachPlanEvents();
}

function attachPlanEvents() {
  const el = document.getElementById('screen-plan');

  // Import toggle
  document.getElementById('btn-toggle-import').onclick = () => {
    const body = document.getElementById('import-body');
    const btn = document.getElementById('btn-toggle-import');
    const visible = body.style.display !== 'none';
    body.style.display = visible ? 'none' : 'block';
    btn.textContent = visible ? 'Show' : 'Hide';
  };

  // Import action
  document.getElementById('btn-import-text').onclick = async () => {
    const text = document.getElementById('import-text').value;
    const result = parsePlanText(text);
    const hasItems = result.meals.some(m => m.items.length > 0);
    if (!hasItems) {
      alert('No meals with items found.\n\nExpected format:\nMeal Name\nFood, 50g, 180cal, 6p, 27c, 4f');
      return;
    }
    S.plan = result;
    await savePlan();
    renderPlan();
  };

  const stInp = document.getElementById('set-steps');
  if (stInp) stInp.addEventListener('input', () => {
    S.settings.stepTarget = Math.max(0, parseInt(stInp.value) || 10000);
  });
  const slInp = document.getElementById('set-sleep');
  if (slInp) slInp.addEventListener('input', () => {
    S.settings.sleepTarget = Math.max(0, parseFloat(slInp.value) || 8);
  });

  el.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset.field) return;
    const mi = t.dataset.mi !== undefined ? +t.dataset.mi : null;
    const ii = t.dataset.ii !== undefined ? +t.dataset.ii : null;

    if (t.dataset.field === 'mealname' && mi !== null) {
      S.plan.meals[mi].name = t.value;
    } else if (mi !== null && ii !== null) {
      const numFields = ['qty', 'protein', 'carbs', 'fat', 'calories'];
      if (numFields.includes(t.dataset.field)) {
        S.plan.meals[mi].items[ii][t.dataset.field] = Math.max(0, parseFloat(t.value) || 0);
      } else {
        S.plan.meals[mi].items[ii][t.dataset.field] = t.value;
      }
    }
  });

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const mi = +btn.dataset.mi;

    if (action === 'del-meal') {
      if (confirm('Delete this meal?')) { S.plan.meals.splice(mi, 1); renderPlan(); }
    } else if (action === 'del-item') {
      S.plan.meals[mi].items.splice(+btn.dataset.ii, 1);
      renderPlan();
    } else if (action === 'add-item') {
      S.plan.meals[mi].items.push({
        name: '', qty: 1, unit: 'g', protein: 0, carbs: 0, fat: 0, calories: 0
      });
      renderPlan();
      const items = el.querySelectorAll(`.plan-item[data-mi="${mi}"]`);
      const last = items[items.length - 1];
      if (last) last.querySelector('input[data-field="name"]').focus();
    }
  });

  document.getElementById('btn-add-meal').onclick = () => {
    S.plan.meals.push({ name: 'Meal ' + (S.plan.meals.length + 1), items: [] });
    renderPlan();
  };

  document.getElementById('btn-save-plan').onclick = async () => {
    await Promise.all([savePlan(), saveSettings()]);
    const btn = document.getElementById('btn-save-plan');
    btn.textContent = 'Saved!';
    btn.style.background = 'var(--green)';
    setTimeout(() => { btn.textContent = 'Save Plan'; btn.style.background = ''; }, 1500);
  };

  // Export — fetch ALL months from Supabase
  document.getElementById('btn-export').onclick = async () => {
    const { data: rows } = await sb
      .from('day_logs')
      .select('month_key, data')
      .eq('user_id', S.userId);
    const allMonths = {};
    if (rows) {
      for (const row of rows) {
        allMonths[row.month_key] = row.data;
      }
    }
    const exportData = { plan: S.plan, settings: S.settings, months: allMonths };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wellness-tracker-backup-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  document.getElementById('btn-import').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.plan) { S.plan = data.plan; await savePlan(); }
        if (data.settings) { S.settings = { ...S.settings, ...data.settings }; await saveSettings(); }
        if (data.months) {
          const upserts = [];
          for (const mk in data.months) {
            S.months[mk] = data.months[mk];
            upserts.push({
              user_id: S.userId,
              month_key: mk,
              data: data.months[mk],
              updated_at: new Date().toISOString()
            });
          }
          if (upserts.length > 0) {
            await sb.from('day_logs').upsert(upserts);
          }
        }
        alert('Data imported successfully.');
        renderPlan();
      } catch (err) {
        alert('Invalid file. Please select a valid JSON backup.');
      }
    };
    reader.readAsText(file);
  };

  // Logout
  document.getElementById('btn-logout').onclick = async () => {
    await sb.auth.signOut();
  };
}

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
    const mk = monthKey(S.calYear, S.calMonth);
    await Promise.all([
      loadPlan(),
      loadSettings(),
      loadMonth(S.calYear, S.calMonth)
    ]);
  } catch (err) {
    console.error('initApp error:', err);
  }

  // Show navbar, hide auth
  document.getElementById('navbar').style.display = '';
  showLoadingOverlay(false);
  await showScreen('calendar');
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

// Flush save before the user leaves the page
window.addEventListener('beforeunload', flushSave);
