// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => {
    console.warn('SW registration failed:', err);
  });
}

// ============================================================
// STORAGE (localStorage — device-local)
// ============================================================
const store = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) { console.error('store.get', key, e); return null; }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { console.error('store.set', key, e); }
  }
};

// ============================================================
// STATE
// ============================================================
const S = {
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
// DATA ACCESS
// ============================================================
function loadPlan() {
  const p = store.get('plan');
  if (p) S.plan = p;
}

function savePlan() {
  store.set('plan', S.plan);
}

function loadSettings() {
  const s = store.get('settings');
  if (s) S.settings = { ...S.settings, ...s };
}

function saveSettings() {
  store.set('settings', S.settings);
}

function loadMonth(y, m) {
  const k = monthKey(y, m);
  if (S.months[k]) return;
  const d = store.get('log_' + k);
  S.months[k] = d || {};
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

// Flush any pending debounced save immediately
function flushSave() {
  if (S.saveTimer) {
    clearTimeout(S.saveTimer);
    S.saveTimer = null;
    if (S.savePendingMonth) {
      store.set('log_' + S.savePendingMonth, S.months[S.savePendingMonth] || {});
      S.savePendingMonth = null;
    }
  }
}

function scheduleSave(dateStr) {
  // Flush any previous pending save for a different month first
  const mk = dateStr
    ? dateStr.substring(0, 7)
    : fmtDate(S.selectedDate).substring(0, 7);

  if (S.savePendingMonth && S.savePendingMonth !== mk) {
    flushSave();
  }

  clearTimeout(S.saveTimer);
  S.savePendingMonth = mk;
  S.saveTimer = setTimeout(() => {
    store.set('log_' + mk, S.months[mk] || {});
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
    <div class="circle-val">${Math.round(v)}<small>/ ${Math.round(mx)}</small></div>
  </div>`;
}

// ============================================================
// NAVIGATION
// ============================================================
function showScreen(name) {
  flushSave();
  S.screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('#navbar button').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });
  if (name === 'calendar') renderCalendar();
  else if (name === 'day') renderDay();
  else if (name === 'plan') renderPlan();
}

document.querySelectorAll('#navbar button').forEach(btn => {
  btn.onclick = () => {
    if (btn.dataset.screen === 'day') S.selectedDate = new Date();
    showScreen(btn.dataset.screen);
  };
});

// ============================================================
// CALENDAR
// ============================================================
function renderCalendar() {
  loadMonth(S.calYear, S.calMonth);
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
      <button class="nav-btn" id="cal-prev">&lsaquo;</button>
      <div class="nav-label">${monthNames[S.calMonth]} ${S.calYear}</div>
      <button class="nav-btn" id="cal-next">&rsaquo;</button>
    </div>
    <div class="cal-weekdays">
      <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
    </div>
    <div class="cal-grid">`;

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
    if (score) cls.push(score.combined);

    let icons = '';
    if (log) {
      if (log.resistanceTraining) icons += '<span title="Training">&#x1F4AA;</span>';
      if (safeNum(log.sleep) > 0) icons += `<span>${log.sleep}h</span>`;
    }

    html += `<div class="${cls.join(' ')}" data-date="${ds}">
      <span class="cal-num">${d}</span>
      ${icons ? `<span class="cal-icons">${icons}</span>` : ''}
    </div>`;
  }

  // Trailing empty cells to fill last row
  const totalCells = firstDay + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailing; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  html += '</div>';
  document.getElementById('screen-calendar').innerHTML = html;

  document.getElementById('cal-prev').onclick = () => {
    S.calMonth--;
    if (S.calMonth < 0) { S.calMonth = 11; S.calYear--; }
    renderCalendar();
  };
  document.getElementById('cal-next').onclick = () => {
    S.calMonth++;
    if (S.calMonth > 11) { S.calMonth = 0; S.calYear++; }
    renderCalendar();
  };
  document.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.onclick = () => {
      S.selectedDate = parseDate(el.dataset.date);
      showScreen('day');
    };
  });
}

// ============================================================
// DAY VIEW
// ============================================================
function renderDay() {
  const ds = fmtDate(S.selectedDate);
  loadMonth(S.selectedDate.getFullYear(), S.selectedDate.getMonth());
  const log = getDayLog(ds);
  const targets = planTargets();
  const consumed = consumedMacros(log);
  const score = calcScore(log);

  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dtLabel = `${weekdays[S.selectedDate.getDay()]}, ${monthNames[S.selectedDate.getMonth()]} ${S.selectedDate.getDate()}, ${S.selectedDate.getFullYear()}`;

  let html = `
    <div class="nav-bar">
      <button class="nav-btn" id="day-prev">&lsaquo;</button>
      <div style="text-align:center">
        <div class="nav-label">${dtLabel}</div>
        ${score
          ? `<div style="margin-top:4px"><span class="score-badge ${score.combined}">${score.combined}</span></div>
             <div class="score-detail">Diet: ${score.diet} &middot; Steps: ${score.steps}</div>`
          : ''}
      </div>
      <button class="nav-btn" id="day-next">&rsaquo;</button>
    </div>`;

  // Macro circles
  if (S.plan.meals.length > 0) {
    html += `<div class="circles-grid">
      <div class="circle-wrap">${circleSVG(consumed.calories, targets.calories, 'var(--orange)', 90)}<div class="circle-label">Calories</div></div>
      <div class="circle-wrap">${circleSVG(consumed.protein, targets.protein, 'var(--primary)', 90)}<div class="circle-label">Protein</div></div>
      <div class="circle-wrap">${circleSVG(consumed.carbs, targets.carbs, 'var(--green)', 90)}<div class="circle-label">Carbs</div></div>
      <div class="circle-wrap">${circleSVG(consumed.fat, targets.fat, 'var(--purple)', 90)}<div class="circle-label">Fat</div></div>
    </div>`;
  }

  // Steps + Wellness
  html += `<div class="card">
    <div class="steps-row">
      ${circleSVG(log.steps || 0, S.settings.stepTarget, 'var(--teal)', 70)}
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

  // Meals
  if (S.plan.meals.length === 0) {
    html += '<div class="empty-msg">No diet plan set up yet.<br>Go to the Plan tab to create one.</div>';
  } else {
    S.plan.meals.forEach((meal, mi) => {
      html += `<div class="meal-section"><div class="meal-section-hdr">${escH(meal.name)}</div>`;
      meal.items.forEach((item, ii) => {
        const key = mi + '_' + ii;
        const e = (log.items && log.items[key]) || { checked: false, actualQty: 0 };
        const aq = safeNum(e.actualQty);
        const qty = safeNum(item.qty);
        const ratio = (e.checked && qty > 0 && aq > 0) ? aq / qty : 0;
        const itemCal = e.checked ? Math.round(safeNum(item.calories) * ratio) : 0;

        html += `<div class="day-item ${e.checked ? 'checked' : ''}" data-key="${key}">
          <button class="day-check ${e.checked ? 'on' : ''}" data-mi="${mi}" data-ii="${ii}"></button>
          <div class="day-item-body">
            <div class="day-item-name">${escH(item.name)}</div>
            <div class="day-item-qty">
              <input type="number" value="${e.checked ? aq : ''}" min="0" step="0.5"
                data-mi="${mi}" data-ii="${ii}" class="inp-qty"
                ${!e.checked ? 'disabled' : ''} inputmode="decimal">
              <span>/ ${qty} ${escH(item.unit)}</span>
            </div>
          </div>
          <div class="day-item-cal">${itemCal} cal</div>
        </div>`;
      });
      html += '</div>';
    });
  }

  // Extra items
  html += `<div class="extras-hdr">
    <span>Extra Items (${(log.extras || []).length})</span>
    <button class="btn btn-sm btn-primary" id="btn-add-extra">+ Add</button>
  </div>`;
  html += '<div id="extra-form-area"></div>';

  (log.extras || []).forEach((ex, ei) => {
    html += `<div class="extra-item">
      <div class="extra-item-info">
        <div class="extra-item-name">${escH(ex.name)}${ex.qty > 1 ? ' (x' + ex.qty + ')' : ''}</div>
        <div class="extra-item-macros">${ex.calories} cal &middot; ${ex.protein}g P &middot; ${ex.carbs}g C &middot; ${ex.fat}g F</div>
      </div>
      <button class="extra-del" data-ei="${ei}">&times;</button>
    </div>`;
  });

  document.getElementById('screen-day').innerHTML = html;
  S.extraFormOpen = false;
  attachDayEvents(ds);
}

function attachDayEvents(ds) {
  const el = document.getElementById('screen-day');

  // Day navigation — flush pending save before changing day
  document.getElementById('day-prev').onclick = () => {
    flushSave();
    S.selectedDate.setDate(S.selectedDate.getDate() - 1);
    renderDay();
  };
  document.getElementById('day-next').onclick = () => {
    flushSave();
    S.selectedDate.setDate(S.selectedDate.getDate() + 1);
    renderDay();
  };

  // Checkboxes
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

  // Qty inputs
  el.querySelectorAll('.inp-qty').forEach(inp => {
    inp.addEventListener('input', () => {
      const mi = +inp.dataset.mi, ii = +inp.dataset.ii, key = mi + '_' + ii;
      const log = getDayLog(ds);
      if (!log.items) log.items = {};
      if (!log.items[key]) log.items[key] = { checked: true, actualQty: 0 };
      log.items[key].actualQty = Math.max(0, parseFloat(inp.value) || 0);
      scheduleSave(ds);
      updateDayCircles(ds);
      const item = S.plan.meals[mi].items[ii];
      const qty = safeNum(item.qty);
      const ratio = qty > 0 ? (log.items[key].actualQty / qty) : 0;
      const calEl = inp.closest('.day-item').querySelector('.day-item-cal');
      if (calEl) calEl.textContent = Math.round(safeNum(item.calories) * ratio) + ' cal';
    });
  });

  // Steps
  const stepsInp = document.getElementById('inp-steps');
  if (stepsInp) stepsInp.addEventListener('input', () => {
    getDayLog(ds).steps = Math.max(0, parseInt(stepsInp.value) || 0);
    scheduleSave(ds);
    updateDayCircles(ds);
  });

  // Resistance training
  const rtInp = document.getElementById('inp-rt');
  if (rtInp) rtInp.addEventListener('change', () => {
    getDayLog(ds).resistanceTraining = rtInp.checked;
    scheduleSave(ds);
  });

  // Sleep
  const sleepInp = document.getElementById('inp-sleep');
  if (sleepInp) sleepInp.addEventListener('input', () => {
    getDayLog(ds).sleep = Math.max(0, parseFloat(sleepInp.value) || 0);
    scheduleSave(ds);
  });

  // Add extra
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

  // Delete extra
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

  const circlesGrid = document.querySelector('#screen-day .circles-grid');
  if (circlesGrid) {
    const wraps = circlesGrid.querySelectorAll('.circle-wrap');
    const data = [
      [consumed.calories, targets.calories, 'var(--orange)', 'Calories'],
      [consumed.protein, targets.protein, 'var(--primary)', 'Protein'],
      [consumed.carbs, targets.carbs, 'var(--green)', 'Carbs'],
      [consumed.fat, targets.fat, 'var(--purple)', 'Fat']
    ];
    wraps.forEach((w, i) => {
      w.innerHTML = circleSVG(data[i][0], data[i][1], data[i][2], 90) +
        `<div class="circle-label">${data[i][3]}</div>`;
    });
  }

  const stepsRow = document.querySelector('#screen-day .steps-row');
  if (stepsRow) {
    const cc = stepsRow.querySelector('.circle-container');
    if (cc) {
      const tmp = document.createElement('div');
      tmp.innerHTML = circleSVG(log.steps || 0, S.settings.stepTarget, 'var(--teal)', 70);
      cc.replaceWith(tmp.firstElementChild);
    }
  }

  const nb = document.querySelector('#screen-day .nav-bar > div');
  if (nb) {
    let badgeEl = nb.querySelector('.score-badge');
    let detailEl = nb.querySelector('.score-detail');
    if (score) {
      if (!badgeEl) {
        const d = document.createElement('div');
        d.style.marginTop = '4px';
        d.innerHTML = `<span class="score-badge ${score.combined}">${score.combined}</span>`;
        nb.appendChild(d);
        const sd = document.createElement('div');
        sd.className = 'score-detail';
        sd.innerHTML = `Diet: ${score.diet} &middot; Steps: ${score.steps}`;
        nb.appendChild(sd);
      } else {
        badgeEl.className = 'score-badge ' + score.combined;
        badgeEl.textContent = score.combined;
        if (detailEl) detailEl.innerHTML = `Diet: ${score.diet} &middot; Steps: ${score.steps}`;
      }
    }
  }
}

// ============================================================
// PLAN EDITOR
// ============================================================
function renderPlan() {
  let html = '<div class="screen-title">Diet Plan</div>';

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
        <button class="btn-danger" data-action="del-meal" data-mi="${mi}">&times;</button>
      </div>
      <div class="plan-items">`;

    meal.items.forEach((item, ii) => {
      html += `<div class="plan-item" data-mi="${mi}" data-ii="${ii}">
        <div class="plan-item-row">
          <input type="text" value="${escH(item.name)}" data-field="name" data-mi="${mi}" data-ii="${ii}" placeholder="Food item">
          <button class="btn-danger" data-action="del-item" data-mi="${mi}" data-ii="${ii}">&times;</button>
        </div>
        <div class="plan-item-row pi-qty">
          <input type="number" value="${item.qty}" data-field="qty" data-mi="${mi}" data-ii="${ii}" min="0" step="0.5" placeholder="Qty" inputmode="decimal">
          <input type="text" value="${escH(item.unit)}" data-field="unit" data-mi="${mi}" data-ii="${ii}" placeholder="Unit (g, cup, slice...)">
        </div>
        <div class="pi-macros">
          <div><label>Protein (g)</label><input type="number" value="${item.protein}" data-field="protein" data-mi="${mi}" data-ii="${ii}" min="0" step="0.1" inputmode="decimal"></div>
          <div><label>Carbs (g)</label><input type="number" value="${item.carbs}" data-field="carbs" data-mi="${mi}" data-ii="${ii}" min="0" step="0.1" inputmode="decimal"></div>
          <div><label>Fat (g)</label><input type="number" value="${item.fat}" data-field="fat" data-mi="${mi}" data-ii="${ii}" min="0" step="0.1" inputmode="decimal"></div>
          <div><label>Calories</label><input type="number" value="${item.calories}" data-field="calories" data-mi="${mi}" data-ii="${ii}" min="0" step="1" inputmode="numeric"></div>
        </div>
      </div>`;
    });

    html += `<button class="btn-add" data-action="add-item" data-mi="${mi}">+ Add Food Item</button>
      </div></div>`;
  });

  html += `<button class="btn-add" id="btn-add-meal" style="margin-bottom:12px">+ Add Meal</button>
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

  document.getElementById('screen-plan').innerHTML = html;
  attachPlanEvents();
}

function attachPlanEvents() {
  const el = document.getElementById('screen-plan');

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

  document.getElementById('btn-save-plan').onclick = () => {
    savePlan();
    saveSettings();
    const btn = document.getElementById('btn-save-plan');
    btn.textContent = 'Saved!';
    btn.style.background = 'var(--green)';
    setTimeout(() => { btn.textContent = 'Save Plan'; btn.style.background = ''; }, 1500);
  };

  // Export
  document.getElementById('btn-export').onclick = () => {
    const data = { plan: S.plan, settings: S.settings, months: S.months };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.plan) { S.plan = data.plan; savePlan(); }
        if (data.settings) { S.settings = { ...S.settings, ...data.settings }; saveSettings(); }
        if (data.months) {
          for (const mk in data.months) {
            S.months[mk] = data.months[mk];
            store.set('log_' + mk, data.months[mk]);
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
}

// ============================================================
// INIT
// ============================================================
function init() {
  loadPlan();
  loadSettings();
  const now = new Date();
  S.calYear = now.getFullYear();
  S.calMonth = now.getMonth();
  S.selectedDate = new Date(now);
  loadMonth(S.calYear, S.calMonth);
  renderCalendar();
}

// Flush save before the user leaves the page
window.addEventListener('beforeunload', flushSave);

init();
