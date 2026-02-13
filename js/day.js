import { S } from './state.js';
import {
    fmtDate, escH, safeNum,
    SVG_CHEVRON_LEFT, SVG_CHEVRON_RIGHT, SVG_X_CIRCLE, SVG_PLUS
} from './helpers.js';
import { circleSVG, renderMacrosCard } from './ui.js';
import { renderWorkoutSection, attachWorkoutDayEvents } from './workout-day.js';
import { getDayLog, loadMonth, flushSave, scheduleSave } from './data.js';
import { planTargets, consumedMacros, calcScore } from './scoring.js';

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

export async function renderDay() {
    const ds = fmtDate(S.selectedDate);
    await loadMonth(S.selectedDate.getFullYear(), S.selectedDate.getMonth());
    const log = getDayLog(ds);
    const targets = planTargets();
    const consumed = consumedMacros(log);
    const score = calcScore(log);

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

    // Macros summary (always visible)
    if (S.plan.meals.length > 0) {
        html += renderMacrosCard(consumed, targets);
    }

    // Wellness card (always visible) — compact layout
    const stepPct = Math.min(100, Math.round(((log.steps || 0) / S.settings.stepTarget) * 100));
    const stepBarColor = stepPct >= 100 ? 'var(--green)' : stepPct >= 60 ? 'var(--steps-color)' : '#ccc';
    html += `<div class="card wellness-compact">
    <div class="wellness-row-inline">
      <div class="wc-item">
        <span class="wc-label">Workout?</span>
        <label class="toggle">
          <input type="checkbox" id="inp-rt" ${log.resistanceTraining ? 'checked' : ''}>
          <span class="toggle-track"></span><span class="toggle-knob"></span>
        </label>
      </div>
      <div class="wc-item">
        <span class="wc-label">😴</span>
        <input type="number" class="wc-input" id="inp-sleep" value="${log.sleep || ''}"
          placeholder="0" min="0" max="24" step="0.5" inputmode="decimal">
        <span class="wc-unit">/ ${S.settings.sleepTarget}h</span>
      </div>
      <div class="wc-item">
        <span class="wc-label">💧</span>
        <span class="wc-water-count">${log.water || 0} / ${S.settings.waterTarget} oz</span>
        <div class="wc-water-btns">
          <button class="wc-qty-btn" id="water-minus">&minus;</button>
          <button class="wc-qty-btn" id="water-plus">+</button>
        </div>
      </div>
    </div>
    <div class="wc-steps-bar">
      <div class="wc-steps-top">
        <span class="wc-steps-icon">🏃</span>
        <input type="number" class="wc-input wc-steps-input" id="inp-steps" value="${log.steps || ''}"
          placeholder="Steps" min="0" step="100" inputmode="numeric">
        <span class="wc-unit">/ ${S.settings.stepTarget.toLocaleString()}</span>
      </div>
      <div class="macro-main-bar">
        <div class="macro-main-bar-fill" style="width:${stepPct}%;background:${stepBarColor}"></div>
      </div>
    </div>
  </div>`;


    // Pill tabs
    html += `<div class="pill-tabs">
    <button class="pill-tab ${S.dayTab === 'food' ? 'active' : ''}" data-day-tab="food">🍽 Food</button>
    <button class="pill-tab ${S.dayTab === 'workout' ? 'active' : ''}" data-day-tab="workout">💪 Workout</button>
  </div>`;

    // Tab content
    if (S.dayTab === 'food') {
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
      <div class="scoring-section"><div class="scoring-label">Workout</div><span class="score-badge ${score.workout}">${score.workout}</span></div>
      <div class="scoring-divider"></div>
        <div class="scoring-section"><div class="scoring-label">Overall</div><span class="score-badge ${score.combined}">${score.combined}</span></div>
      </div>`;
        }
    } else {
        // Workout tab
        if (log.resistanceTraining && S.plan.workout && S.plan.workout.days.length > 0) {
            html += renderWorkoutSection(log);
        } else if (!log.resistanceTraining) {
            html += `<div class="card" style="padding:24px;text-align:center">
        <div style="font-size:40px;margin-bottom:8px">💪</div>
        <div style="font-weight:500;margin-bottom:4px">No workout today</div>
        <div style="font-size:13px;color:var(--text2)">Toggle Resistance Training above to start logging</div>
      </div>`;
        } else {
            html += `<div class="card" style="padding:24px;text-align:center">
        <div style="font-size:40px;margin-bottom:8px">🏋️</div>
        <div style="font-weight:500;margin-bottom:4px">No workout plan</div>
        <div style="font-size:13px;color:var(--text2)">Go to the Plan tab to set one up</div>
      </div>`;
        }
    }

    document.getElementById('screen-day').innerHTML = html;
    S.extraFormOpen = false;
    attachDayEvents(ds);
}

function attachDayEvents(ds) {
    const el = document.getElementById('screen-day');

    // Pill tab switching
    el.querySelectorAll('[data-day-tab]').forEach(btn => {
        btn.onclick = () => {
            S.dayTab = btn.dataset.dayTab;
            renderDay();
        };
    });

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
        const log = getDayLog(ds);
        log.resistanceTraining = rtInp.checked;
        if (!rtInp.checked) {
            log.workoutDayIndex = null;
            log.workout = null;
        }
        scheduleSave(ds);
        renderDay();
    });

    // Workout section events
    if (getDayLog(ds).resistanceTraining) {
        attachWorkoutDayEvents(ds, getDayLog(ds), getDayLog, scheduleSave, () => renderDay());
    }

    const sleepInp = document.getElementById('inp-sleep');
    if (sleepInp) sleepInp.addEventListener('input', () => {
        getDayLog(ds).sleep = Math.max(0, parseFloat(sleepInp.value) || 0);
        scheduleSave(ds);
    });

    const waterMinus = document.getElementById('water-minus');
    const waterPlus = document.getElementById('water-plus');
    if (waterMinus) waterMinus.onclick = () => {
        const log = getDayLog(ds);
        log.water = Math.max(0, safeNum(log.water) - 1);
        scheduleSave(ds);
        updateDayCircles(ds);
    };
    if (waterPlus) waterPlus.onclick = () => {
        const log = getDayLog(ds);
        log.water = safeNum(log.water) + 1;
        scheduleSave(ds);
        updateDayCircles(ds);
    };

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

    const waterItem = document.querySelector('#screen-day .water-item');
    if (waterItem) {
        const cc = waterItem.querySelector('.circle-container');
        if (cc) {
            const tmp = document.createElement('div');
            tmp.innerHTML = circleSVG(log.water || 0, S.settings.waterTarget, 'var(--water-color)', 56);
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
