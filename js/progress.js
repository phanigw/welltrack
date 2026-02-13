import { sb, S } from './state.js';
import { todayStr, escH, safeNum } from './helpers.js';
import { showToast } from './ui.js';

// ============================================================
// PROGRESS TRACKER
// ============================================================

const FIELDS = [
    { key: 'weight', label: 'Weight', unit: 'lbs', step: '0.1', inputmode: 'decimal' },
    { key: 'chest', label: 'Chest', unit: 'in', step: '0.25', inputmode: 'decimal' },
    { key: 'waist', label: 'Waist', unit: 'in', step: '0.25', inputmode: 'decimal' },
    { key: 'hip', label: 'Hip', unit: 'in', step: '0.25', inputmode: 'decimal' },
];

// For weight & waist, decrease is good (green). For chest & hip, increase is good (green).
const DECREASE_IS_GOOD = { weight: true, chest: false, waist: true, hip: false };

// ── Data Access ──

export async function loadProgress() {
    if (S.progressLogs.length > 0) return;
    const { data, error } = await sb
        .from('progress_logs')
        .select('check_in_date, data, updated_at')
        .eq('user_id', S.userId)
        .order('check_in_date', { ascending: false });
    if (error) {
        console.error('loadProgress error:', error);
        return;
    }
    S.progressLogs = (data || []).map(row => ({
        date: row.check_in_date,
        ...row.data
    }));
}

export async function saveProgressEntry(date, measurements) {
    const { error } = await sb
        .from('progress_logs')
        .upsert({
            user_id: S.userId,
            check_in_date: date,
            data: measurements,
            updated_at: new Date().toISOString()
        });
    if (error) {
        console.error('saveProgressEntry error:', error);
        showToast('Failed to save entry');
        return false;
    }
    // Update local cache
    const idx = S.progressLogs.findIndex(e => e.date === date);
    const entry = { date, ...measurements };
    if (idx >= 0) {
        S.progressLogs[idx] = entry;
    } else {
        S.progressLogs.push(entry);
    }
    // Keep sorted descending by date
    S.progressLogs.sort((a, b) => b.date.localeCompare(a.date));
    return true;
}

export async function deleteProgressEntry(date) {
    const { error } = await sb
        .from('progress_logs')
        .delete()
        .eq('user_id', S.userId)
        .eq('check_in_date', date);
    if (error) {
        console.error('deleteProgressEntry error:', error);
        showToast('Failed to delete entry');
        return false;
    }
    S.progressLogs = S.progressLogs.filter(e => e.date !== date);
    return true;
}

// ── Helpers ──

function calcDelta(current, previous) {
    if (!previous) return null;
    const deltas = {};
    for (const f of FIELDS) {
        const cur = safeNum(current[f.key]);
        const prev = safeNum(previous[f.key]);
        if (prev === 0 && cur === 0) {
            deltas[f.key] = { diff: 0, direction: 'same' };
            continue;
        }
        const diff = cur - prev;
        deltas[f.key] = {
            diff: Math.round(diff * 100) / 100,
            direction: diff < 0 ? 'down' : diff > 0 ? 'up' : 'same'
        };
    }
    return deltas;
}

function deltaHTML(fieldKey, delta) {
    if (!delta || delta.direction === 'same') {
        return '<span class="prog-delta neutral">—</span>';
    }
    const decreaseGood = DECREASE_IS_GOOD[fieldKey];
    const isGood = (delta.direction === 'down' && decreaseGood) ||
        (delta.direction === 'up' && !decreaseGood);
    const arrow = delta.direction === 'down' ? '↓' : '↑';
    const cls = isGood ? 'good' : 'bad';
    return `<span class="prog-delta ${cls}">${arrow}${Math.abs(delta.diff)}</span>`;
}

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(+y, +m - 1, +d);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${weekdays[dt.getDay()]}, ${months[dt.getMonth()]} ${dt.getDate()}`;
}

// ── Render ──

let editingDate = null;

export function renderProgress() {
    const logs = S.progressLogs;

    let html = '<div class="screen-title">Progress</div>';

    // Input card
    const defaultDate = editingDate || todayStr();
    const editEntry = editingDate ? logs.find(e => e.date === editingDate) : null;

    html += `<div class="card prog-input-card">
    <div class="card-title">${editingDate ? 'Edit Check-in' : 'New Check-in'}</div>
    <div class="prog-date-row">
      <label>Date</label>
      <input type="date" id="prog-date" value="${defaultDate}">
    </div>
    <div class="prog-fields">`;

    for (const f of FIELDS) {
        const val = editEntry ? (editEntry[f.key] || '') : '';
        html += `<div class="prog-field">
      <label>${f.label} <small>(${f.unit})</small></label>
      <input type="number" id="prog-${f.key}" value="${val}"
        min="0" step="${f.step}" inputmode="${f.inputmode}" placeholder="0">
    </div>`;
    }

    html += `</div>
    <div class="prog-form-btns">
      ${editingDate ? '<button class="btn btn-sm btn-secondary" id="prog-cancel-edit">Cancel</button>' : ''}
      <button class="btn btn-sm btn-primary" id="prog-save">${editingDate ? 'Update' : 'Save'}</button>
    </div>
  </div>`;

    // History
    if (logs.length === 0) {
        html += '<div class="empty-msg">No check-ins yet.<br>Log your first measurements above!</div>';
    } else {
        html += '<div class="prog-history">';
        html += '<div class="card-title" style="padding:0 4px 8px">History</div>';

        logs.forEach((entry, i) => {
            const prev = i < logs.length - 1 ? logs[i + 1] : null;
            const deltas = calcDelta(entry, prev);

            html += `<div class="prog-row card">
        <div class="prog-row-header">
          <span class="prog-row-date">${formatDate(entry.date)}</span>
          <div class="prog-row-actions">
            <button class="prog-edit-btn" data-date="${entry.date}" title="Edit">✏️</button>
            <button class="prog-del-btn" data-date="${entry.date}" title="Delete">🗑️</button>
          </div>
        </div>
        <div class="prog-row-metrics">`;

            for (const f of FIELDS) {
                const val = safeNum(entry[f.key]);
                html += `<div class="prog-metric">
          <div class="prog-metric-label">${f.label}</div>
          <div class="prog-metric-val">${val > 0 ? val : '—'}<small>${val > 0 ? f.unit : ''}</small></div>
          ${deltas ? deltaHTML(f.key, deltas[f.key]) : ''}
        </div>`;
            }

            html += `</div></div>`;
        });
        html += '</div>';
    }

    document.getElementById('screen-progress').innerHTML = html;
    attachProgressEvents();
}

// ── Events ──

function attachProgressEvents() {
    const el = document.getElementById('screen-progress');

    // Save / Update
    const saveBtn = document.getElementById('prog-save');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const date = document.getElementById('prog-date').value;
            if (!date) { showToast('Please select a date'); return; }

            const measurements = {};
            let hasValue = false;
            for (const f of FIELDS) {
                const val = safeNum(document.getElementById('prog-' + f.key).value);
                measurements[f.key] = val;
                if (val > 0) hasValue = true;
            }
            if (!hasValue) { showToast('Enter at least one measurement'); return; }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
            const ok = await saveProgressEntry(date, measurements);
            if (ok) {
                editingDate = null;
                showToast('Check-in saved!', 'success');
                renderProgress();
            } else {
                saveBtn.disabled = false;
                saveBtn.textContent = editingDate ? 'Update' : 'Save';
            }
        };
    }

    // Cancel edit
    const cancelBtn = document.getElementById('prog-cancel-edit');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            editingDate = null;
            renderProgress();
        };
    }

    // Edit buttons
    el.querySelectorAll('.prog-edit-btn').forEach(btn => {
        btn.onclick = () => {
            editingDate = btn.dataset.date;
            renderProgress();
            document.getElementById('screen-progress').scrollTo({ top: 0, behavior: 'smooth' });
        };
    });

    // Delete buttons
    el.querySelectorAll('.prog-del-btn').forEach(btn => {
        btn.onclick = async () => {
            if (!confirm('Delete this check-in?')) return;
            const ok = await deleteProgressEntry(btn.dataset.date);
            if (ok) {
                if (editingDate === btn.dataset.date) editingDate = null;
                renderProgress();
            }
        };
    });
}

// Reset editing state when navigating away
export function resetProgressState() {
    editingDate = null;
}
