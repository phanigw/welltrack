import { S } from './state.js';
import {
    fmtDate, escH, safeNum, clampNum,
    SVG_CHEVRON_LEFT, SVG_CHEVRON_RIGHT, SVG_X_CIRCLE, SVG_PLUS
} from './helpers.js';
import { circleSVG, renderMacrosCard } from './ui.js';
import { renderWorkoutSection, attachWorkoutDayEvents } from './workout-day.js';
import { getDayLog, loadMonth, flushSave, scheduleSave, saveSettings } from './data.js';
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

    // Auto-apply workout schedule for fresh days
    const schedule = S.plan.workout?.schedule;
    if (schedule && log.workoutDayIndex == null && !log.resistanceTraining) {
        const dow = S.selectedDate.getDay();
        const scheduledIdx = schedule[dow];
        if (scheduledIdx != null) {
            log.workoutDayIndex = scheduledIdx;
            log.resistanceTraining = true;
            scheduleSave(ds);
        }
    }

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
        // Quick-log shortcut buttons
        html += `<div class="quick-log-bar">
      <button class="btn btn-sm btn-secondary" id="btn-repeat-yesterday">📋 Repeat Yesterday</button>
      <button class="btn btn-sm btn-secondary" id="btn-save-fav">⭐ Save Fav</button>
      <button class="btn btn-sm btn-secondary" id="btn-load-fav">📂 Load Fav</button>
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
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-secondary" id="btn-food-search">🔍 Search</button>
        <button class="btn btn-sm btn-primary" id="btn-add-extra">${SVG_PLUS} Add</button>
      </div>
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
        getDayLog(ds).steps = clampNum(parseInt(stepsInp.value) || 0, 0, 999999);
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
        getDayLog(ds).sleep = clampNum(parseFloat(sleepInp.value) || 0, 0, 24);
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
        log.water = clampNum(safeNum(log.water) + 1, 0, 99);
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

    // ── Food Search ──
    const foodSearchBtn = document.getElementById('btn-food-search');
    if (foodSearchBtn) foodSearchBtn.onclick = async () => {
        const { openFoodSearch } = await import('./food-search.js');
        openFoodSearch((result) => {
            const log = getDayLog(ds);
            if (!log.extras) log.extras = [];
            log.extras.push({
                name: result.name,
                calories: result.calories,
                protein: result.protein,
                carbs: result.carbs,
                fat: result.fat,
                qty: result.qty
            });
            scheduleSave(ds);
            renderDay();
        });
    };

    // ── Quick-Log: Repeat Yesterday ──
    const repeatBtn = document.getElementById('btn-repeat-yesterday');
    if (repeatBtn) repeatBtn.onclick = async () => {
        const yesterday = new Date(S.selectedDate);
        yesterday.setDate(yesterday.getDate() - 1);
        await loadMonth(yesterday.getFullYear(), yesterday.getMonth());
        const yd = fmtDate(yesterday);
        const yParts = yd.split('-');
        const yMk = yParts[0] + '-' + yParts[1];
        const yDay = yParts[2];
        const yData = S.months[yMk] && S.months[yMk][yDay];
        if (!yData || (!yData.items && !(yData.extras && yData.extras.length))) {
            import('./ui.js').then(m => m.showToast('No food data from yesterday'));
            return;
        }
        const log = getDayLog(ds);
        if (yData.items) log.items = JSON.parse(JSON.stringify(yData.items));
        if (yData.extras) log.extras = JSON.parse(JSON.stringify(yData.extras));
        scheduleSave(ds);
        renderDay();
    };

    // ── Quick-Log: Save Favorite ──
    const saveFavBtn = document.getElementById('btn-save-fav');
    if (saveFavBtn) saveFavBtn.onclick = () => {
        const name = prompt('Name this favorite:');
        if (!name) return;
        const log = getDayLog(ds);
        if (!S.settings.favorites) S.settings.favorites = [];
        S.settings.favorites.push({
            name,
            items: JSON.parse(JSON.stringify(log.items || {})),
            extras: JSON.parse(JSON.stringify(log.extras || []))
        });
        saveSettings();
        import('./ui.js').then(m => m.showToast('Favorite saved!', 'success'));
    };

    // ── Quick-Log: Load Favorite ──
    const loadFavBtn = document.getElementById('btn-load-fav');
    if (loadFavBtn) loadFavBtn.onclick = () => {
        const favs = S.settings.favorites || [];
        if (favs.length === 0) {
            import('./ui.js').then(m => m.showToast('No favorites saved yet'));
            return;
        }
        const area = document.getElementById('extra-form-area');
        let html = '<div class="fav-overlay">';
        html += '<div class="fav-overlay-title">Load Favorite</div>';
        favs.forEach((fav, fi) => {
            html += `<div class="fav-item" data-fav-idx="${fi}">
              <span class="fav-item-name">${escH(fav.name)}</span>
              <button class="btn-danger btn-xs" data-fav-del="${fi}" title="Delete">×</button>
            </div>`;
        });
        html += '<button class="btn btn-sm btn-secondary" id="fav-close" style="width:100%;margin-top:8px">Cancel</button>';
        html += '</div>';
        area.innerHTML = html;

        area.querySelectorAll('[data-fav-idx]').forEach(el => {
            el.onclick = (e) => {
                if (e.target.closest('[data-fav-del]')) return;
                const fav = favs[+el.dataset.favIdx];
                const log = getDayLog(ds);
                log.items = JSON.parse(JSON.stringify(fav.items));
                log.extras = JSON.parse(JSON.stringify(fav.extras));
                scheduleSave(ds);
                renderDay();
            };
        });
        area.querySelectorAll('[data-fav-del]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                S.settings.favorites.splice(+btn.dataset.favDel, 1);
                saveSettings();
                loadFavBtn.click(); // re-render list
            };
        });
        const closeBtn = document.getElementById('fav-close');
        if (closeBtn) closeBtn.onclick = () => { area.innerHTML = ''; };
    };

    // ── Swipe Gestures ──
    let touchStartX = 0;
    el.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].screenX - touchStartX;
        if (Math.abs(dx) < 80) return;
        flushSave();
        if (dx > 0) {
            S.selectedDate.setDate(S.selectedDate.getDate() - 1);
        } else {
            S.selectedDate.setDate(S.selectedDate.getDate() + 1);
        }
        renderDay();
    }, { passive: true });
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
