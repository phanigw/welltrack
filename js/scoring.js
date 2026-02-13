import { S } from './state.js';
import { safeNum } from './helpers.js';

// ============================================================
// MACROS & SCORING
// ============================================================

export function planTargets() {
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

export function consumedMacros(log) {
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

export function calcScore(log) {
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

    let workout = 3; // Default to max score (rest day)
    if (log.resistanceTraining) {
        // If RT is on, score based on completion of planned exercises
        if (!log.workout || !log.workout.exercises) {
            workout = 0;
        } else {
            const dayIdx = log.workoutDayIndex || 0;
            const plannedDay = S.plan.workout?.days?.[dayIdx];
            if (!plannedDay || plannedDay.exercises.length === 0) {
                workout = 3; // No planned exercises
            } else {
                const total = plannedDay.exercises.length;
                let completed = 0;
                for (let i = 0; i < total; i++) {
                    if (log.workout.exercises[i]?.completed) completed++;
                }
                const pct = completed / total;
                if (pct >= 1) workout = 3;
                else if (pct >= 0.5) workout = 2;
                else if (pct > 0) workout = 1;
                else workout = 0;
            }
        }
    }

    const combined = Math.min(diet, steps, workout);
    const names = ['fail', 'bronze', 'silver', 'gold'];
    return { diet: names[diet], steps: names[st], workout: names[workout], combined: names[combined] };
}

export function parsePlanText(text) {
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

export function hasDayData(log) {
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
