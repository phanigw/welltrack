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
        if (S.savePendingDates.size > 0) {
            for (const date of S.savePendingDates) {
                saveWorkoutForDate(date);
            }
            S.savePendingDates.clear();
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

    if (dateStr) S.savePendingDates.add(dateStr);

    clearTimeout(S.saveTimer);
    S.savePendingMonth = mk;
    S.saveTimer = setTimeout(() => {
        flushSave();
    }, 400);
}

export async function saveWorkoutForDate(date) {
    // 1. Delete existing sets for this date
    try {
        const { error: delErr } = await sb
            .from('workout_sets')
            .delete()
            .eq('user_id', S.userId)
            .eq('date', date);
        if (delErr) throw delErr;

        // 2. If no resistance training, we are done (date was cleared)
        const log = getDayLog(date);
        if (!log.resistanceTraining || !log.workout || !log.workout.exercises) return;

        // 3. Extract sets from log
        // We need to resolve exercise names from S.plan
        const wp = S.plan.workout;
        if (!wp || !wp.days) return;

        const dayIdx = log.workoutDayIndex != null ? log.workoutDayIndex : 0;
        const dayPlan = wp.days[dayIdx];
        if (!dayPlan || !dayPlan.exercises) return;

        const rows = [];
        Object.entries(log.workout.exercises).forEach(([eiStr, exLog]) => {
            const ei = parseInt(eiStr);
            const exPlan = dayPlan.exercises[ei];
            if (!exPlan || !exLog.sets || exLog.sets.length === 0) return;

            exLog.sets.forEach((set, si) => {
                rows.push({
                    user_id: S.userId,
                    date: date,
                    exercise: exPlan.name || 'Unknown',
                    set_index: si,
                    weight: set.weight || 0,
                    reps: set.reps || 0,
                    updated_at: new Date().toISOString()
                });
            });
        });

        if (rows.length === 0) return;

        // 4. Insert new sets
        const { error: insErr } = await sb
            .from('workout_sets')
            .insert(rows);
        if (insErr) throw insErr;

    } catch (err) {
        console.error('saveWorkoutForDate error:', err);
        // We don't showToast here to avoid spamming user on every autosave,
        // unless it's a critical failure pattern.
    }
}

export async function getLastSession(exerciseName, beforeDate) {
    try {
        // 1. Find the most recent date before 'beforeDate'
        const { data: dateData, error: dateErr } = await sb
            .from('workout_sets')
            .select('date')
            .eq('user_id', S.userId)
            .eq('exercise', exerciseName)
            .lt('date', beforeDate)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (dateErr || !dateData) return null;

        const lastDate = dateData.date;

        // 2. Get all sets for that date
        const { data: setsData, error: setsErr } = await sb
            .from('workout_sets')
            .select('weight, reps')
            .eq('user_id', S.userId)
            .eq('exercise', exerciseName)
            .eq('date', lastDate)
            .order('set_index', { ascending: true });

        if (setsErr || !setsData) return null;

        return { date: lastDate, sets: setsData };
    } catch (err) {
        console.error('getLastSession error:', err);
        return null;
    }
}

export async function getExercisePR(exerciseName) {
    try {
        const { data, error } = await sb
            .from('workout_sets')
            .select('weight')
            .eq('user_id', S.userId)
            .eq('exercise', exerciseName)
            .order('weight', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) return 0;
        return data.weight || 0;
    } catch (err) {
        console.error('getExercisePR error:', err);
        return 0;
    }
}
