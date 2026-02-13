import { sb, S } from './state.js';
import { monthKey, fmtDate, parseDateParts } from './helpers.js';

// ============================================================
// DATA ACCESS (Supabase)
// ============================================================

export async function loadPlan() {
    const { data, error } = await sb
        .from('plans')
        .select('data')
        .eq('user_id', S.userId)
        .maybeSingle();
    if (data && data.data) S.plan = data.data;
}

export async function savePlan() {
    await sb.from('plans').upsert({
        user_id: S.userId,
        data: S.plan,
        updated_at: new Date().toISOString()
    });
}

export async function loadSettings() {
    const { data, error } = await sb
        .from('settings')
        .select('data')
        .eq('user_id', S.userId)
        .maybeSingle();
    if (data && data.data) S.settings = { ...S.settings, ...data.data };
}

export async function saveSettings() {
    await sb.from('settings').upsert({
        user_id: S.userId,
        data: S.settings,
        updated_at: new Date().toISOString()
    });
}

export async function loadMonth(y, m) {
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
    await sb.from('day_logs').upsert({
        user_id: S.userId,
        month_key: mk,
        data: S.months[mk] || {},
        updated_at: new Date().toISOString()
    });
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
