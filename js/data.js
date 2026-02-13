import { sb, S } from './state.js';
import { monthKey, fmtDate, parseDateParts } from './helpers.js';
import { showToast } from './ui.js';

// ============================================================
// DATA ACCESS (Supabase)
// ============================================================

export async function loadPlan() {
    try {
        const { data, error } = await sb
            .from('plans')
            .select('data')
            .eq('user_id', S.userId)
            .maybeSingle();
        if (error) throw error;
        if (data && data.data) S.plan = data.data;
    } catch (err) {
        console.error('loadPlan error:', err);
        showToast('Failed to load plan', 'error');
    }
}

export async function savePlan() {
    try {
        const { error } = await sb.from('plans').upsert({
            user_id: S.userId,
            data: S.plan,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
    } catch (err) {
        console.error('savePlan error:', err);
        showToast('Failed to save plan', 'error');
    }
}

export async function loadSettings() {
    try {
        const { data, error } = await sb
            .from('settings')
            .select('data')
            .eq('user_id', S.userId)
            .maybeSingle();
        if (error) throw error;
        if (data && data.data) S.settings = { ...S.settings, ...data.data };
    } catch (err) {
        console.error('loadSettings error:', err);
        showToast('Failed to load settings', 'error');
    }
}

export async function saveSettings() {
    try {
        const { error } = await sb.from('settings').upsert({
            user_id: S.userId,
            data: S.settings,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
    } catch (err) {
        console.error('saveSettings error:', err);
        showToast('Failed to save settings', 'error');
    }
}

export async function loadMonth(y, m) {
    const k = monthKey(y, m);
    if (S.months[k]) return;
    try {
        const { data, error } = await sb
            .from('day_logs')
            .select('data')
            .eq('user_id', S.userId)
            .eq('month_key', k)
            .maybeSingle();
        if (error) throw error;
        S.months[k] = (data && data.data) ? data.data : {};
    } catch (err) {
        console.error('loadMonth error:', err);
        showToast('Failed to load month data', 'error');
        S.months[k] = {}; // Fallback to empty so app doesn't crash
    }
}

export function getDayLog(dateStr) {
    const parts = parseDateParts(dateStr);
    if (!S.months[parts.mk]) S.months[parts.mk] = {};
    if (!S.months[parts.mk][parts.day]) {
        S.months[parts.mk][parts.day] = {
            items: {}, extras: [], steps: 0,
            resistanceTraining: false, sleep: 0, water: 0,
            workoutDayIndex: null, workout: null
        };
    }
    return S.months[parts.mk][parts.day];
}

export async function saveMonth(mk) {
    try {
        const { error } = await sb.from('day_logs').upsert({
            user_id: S.userId,
            month_key: mk,
            data: S.months[mk] || {},
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
    } catch (err) {
        console.error('saveMonth error:', err);
        showToast('Failed to save data. Check connection.', 'error');
    }
}

// Flush any pending debounced save immediately
export function flushSave() {
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

export function scheduleSave(dateStr) {
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
