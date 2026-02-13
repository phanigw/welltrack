import { sb, S } from './state.js';
import { todayStr, escH, safeNum, SVG_X_CIRCLE, SVG_PLUS } from './helpers.js';
import { savePlan, saveSettings } from './data.js';
import { parsePlanText } from './scoring.js';
import { renderWorkoutPlan, attachWorkoutPlanEvents } from './workout-plan.js';

// ============================================================
// PLAN EDITOR
// ============================================================

export function renderPlan() {
    let html = '<div class="screen-title">Plan</div>';

    // Settings (always visible)
    html += `<div class="card settings-card"><div class="card-title">Settings</div>
    <div class="setting-row"><label>Step Target</label>
      <input type="number" id="set-steps" value="${S.settings.stepTarget}" min="0" step="500" inputmode="numeric">
    </div>
    <div class="setting-row"><label>Sleep Target (hrs)</label>
      <input type="number" id="set-sleep" value="${S.settings.sleepTarget}" min="0" max="24" step="0.5" inputmode="decimal">
    </div>
    <div class="setting-row"><label>Water Target (glasses)</label>
      <input type="number" id="set-water" value="${S.settings.waterTarget}" min="1" max="20" step="1" inputmode="numeric">
    </div>
    <div class="setting-row"><label>Rest Timer (sec)</label>
      <input type="number" id="set-rest" value="${S.settings.restTimerDuration}" min="10" max="300" step="5" inputmode="numeric">
    </div>
  </div>`;

    // Pill tabs
    html += `<div class="pill-tabs">
    <button class="pill-tab ${S.planTab === 'diet' ? 'active' : ''}" data-plan-tab="diet">🍽 Diet</button>
    <button class="pill-tab ${S.planTab === 'workout' ? 'active' : ''}" data-plan-tab="workout">💪 Workout</button>
  </div>`;

    if (S.planTab === 'diet') {
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
    } else {
        // Workout tab
        html += renderWorkoutPlan();
    }

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

    // Pill tab switching
    el.querySelectorAll('[data-plan-tab]').forEach(btn => {
        btn.onclick = () => {
            S.planTab = btn.dataset.planTab;
            renderPlan();
        };
    });

    // Import toggle (only on diet tab)
    const importToggle = document.getElementById('btn-toggle-import');
    if (importToggle) {
        importToggle.onclick = () => {
            const body = document.getElementById('import-body');
            const visible = body.style.display !== 'none';
            body.style.display = visible ? 'none' : 'block';
            importToggle.textContent = visible ? 'Show' : 'Hide';
        };
    }

    // Import action (only on diet tab)
    const importBtn = document.getElementById('btn-import-text');
    if (importBtn) {
        importBtn.onclick = async () => {
            const text = document.getElementById('import-text').value;
            const result = parsePlanText(text);
            const hasItems = result.meals.some(m => m.items.length > 0);
            if (!hasItems) {
                alert('No meals with items found.\n\nExpected format:\nMeal Name\nFood, 50g, 180cal, 6p, 27c, 4f');
                return;
            }
            S.plan = { ...result, workout: S.plan.workout || { type: 'split', days: [] } };
            await savePlan();
            renderPlan();
        };
    }

    const stInp = document.getElementById('set-steps');
    if (stInp) stInp.addEventListener('input', () => {
        S.settings.stepTarget = Math.max(0, parseInt(stInp.value) || 10000);
    });
    const slInp = document.getElementById('set-sleep');
    if (slInp) slInp.addEventListener('input', () => {
        S.settings.sleepTarget = Math.max(0, parseFloat(slInp.value) || 8);
    });
    const wtInp = document.getElementById('set-water');
    if (wtInp) wtInp.addEventListener('input', () => {
        S.settings.waterTarget = Math.max(1, parseInt(wtInp.value) || 8);
    });
    const rtDurInp = document.getElementById('set-rest');
    if (rtDurInp) rtDurInp.addEventListener('input', () => {
        S.settings.restTimerDuration = Math.max(10, parseInt(rtDurInp.value) || 90);
    });

    // Workout plan editor events (only on workout tab)
    if (S.planTab === 'workout') {
        attachWorkoutPlanEvents(el, savePlan);
    }

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
        // Fetch all progress logs
        const { data: progRows } = await sb
            .from('progress_logs')
            .select('check_in_date, data')
            .eq('user_id', S.userId);
        const progressEntries = (progRows || []).map(r => ({ date: r.check_in_date, ...r.data }));
        const exportData = { plan: S.plan, settings: S.settings, months: allMonths, progress: progressEntries };
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
                if (data.progress && Array.isArray(data.progress)) {
                    const progUpserts = data.progress.map(e => ({
                        user_id: S.userId,
                        check_in_date: e.date,
                        data: { weight: e.weight || 0, chest: e.chest || 0, waist: e.waist || 0, hip: e.hip || 0 },
                        updated_at: new Date().toISOString()
                    }));
                    if (progUpserts.length > 0) {
                        await sb.from('progress_logs').upsert(progUpserts);
                    }
                    S.progressLogs = data.progress;
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
