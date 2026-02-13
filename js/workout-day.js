import { S } from './state.js';
import { escH, safeNum, fmtDate } from './helpers.js';
import { getLastSession, getExercisePR } from './data.js';

// ============================================================
// DAILY WORKOUT TRACKING
// ============================================================

// Module-level state that persists across re-renders
let restTimerInterval = null;
let restTimerSeconds = 0;
let timerActive = false;
let expandedExercise = 0;  // which exercise is expanded (accordion)

function ensureWorkoutLog(log) {
    if (!log.workout) log.workout = { exercises: {} };
    if (!log.workout.exercises) log.workout.exercises = {};
    return log.workout;
}

function getExerciseLog(log, ei) {
    const wl = ensureWorkoutLog(log);
    if (!wl.exercises[ei]) wl.exercises[ei] = { completed: false, sets: [] };
    return wl.exercises[ei];
}

// ── Render ──

export function renderWorkoutSection(log) {
    const wp = S.plan.workout;
    if (!wp || wp.days.length === 0) {
        return `<div class="workout-section card">
      <div class="card-title">Workout</div>
      <div class="empty-msg" style="padding:16px">No workout plan set up yet.<br>Go to the Plan tab to create one.</div>
    </div>`;
    }

    const dayIdx = log.workoutDayIndex != null ? log.workoutDayIndex : 0;
    const day = wp.days[dayIdx];
    if (!day) return '';

    ensureWorkoutLog(log);

    // Day picker
    let dayPickerHtml = '';
    if (wp.type === 'split' && wp.days.length > 1) {
        const options = wp.days.map((d, i) =>
            `<option value="${i}" ${i === dayIdx ? 'selected' : ''}>${escH(d.name || 'Day ' + (i + 1))}</option>`
        ).join('');
        dayPickerHtml = `<div class="wo-day-picker">
      <label>Today's workout:</label>
      <select id="wo-day-select">${options}</select>
    </div>`;
    } else {
        dayPickerHtml = `<div class="wo-day-label">${escH(day.name || 'Workout')}</div>`;
    }

    let html = `<div class="workout-section card">
    <div class="card-title"><span>Workout</span></div>
    ${dayPickerHtml}`;

    // Exercises (accordion)
    day.exercises.forEach((ex, ei) => {
        const exLog = getExerciseLog(log, ei);
        const isExpanded = ei === expandedExercise;
        const setsLogged = (exLog.sets || []).length;
        const targetSets = ex.targetSets || 0;

        html += `<div class="wo-exercise ${exLog.completed ? 'wo-completed' : ''}" data-woei="${ei}">
      <div class="wo-exercise-hdr" data-wo-action="expand" data-woei="${ei}">
        <button class="day-check ${exLog.completed ? 'on' : ''}" data-wo-action="toggle-exercise" data-woei="${ei}"></button>
        <div class="wo-exercise-info">
          <div class="wo-exercise-name">${escH(ex.name || 'Exercise')}</div>
          <div class="wo-exercise-target">${formatTarget(ex)}${ex.type === 'strength' && setsLogged > 0 ? ` · ${setsLogged}/${targetSets} sets` : ''
            }</div>
        </div>
        <span class="wo-chevron ${isExpanded ? 'open' : ''}">▾</span>
      </div>`;

        if (isExpanded) {
            html += `<div class="wo-exercise-body">`;
            if (ex.type === 'strength') {
                html += `<div id="wo-history-${ei}" class="wo-history"></div>`;
                html += renderStrengthSets(ex, exLog, ei);
            } else if (ex.type === 'cardio') {
                html += renderCardioFields(ex, exLog, ei);
            } else {
                html += renderFlexibilityFields(ex, exLog, ei);
            }
            html += `</div>`;
        }

        html += `</div>`;
    });

    // Rest timer (render visible if active)
    const timerDisplay = timerActive ? 'flex' : 'none';
    const timerVal = timerActive ? formatTimer(restTimerSeconds) : '0:00';
    html += `<div id="wo-rest-timer" class="wo-rest-timer" style="display:${timerDisplay}">
    <span class="wo-timer-label">Rest</span>
    <span class="wo-timer-value" id="wo-timer-val">${timerVal}</span>
    <button class="btn btn-sm btn-secondary" id="wo-timer-stop">Skip</button>
  </div>`;

    html += `</div>`;
    return html;
}

function formatTimer(secs) {
    const min = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatTarget(ex) {
    if (ex.type === 'strength') {
        let s = `${ex.targetSets || 0}×${ex.targetReps || 0}`;
        if (ex.targetWeight) s += ` @${ex.targetWeight}lbs`;
        return s;
    } else if (ex.type === 'cardio') {
        let parts = [];
        if (ex.targetDuration) parts.push(ex.targetDuration + 'min');
        if (ex.targetDistance) parts.push(ex.targetDistance + 'mi');
        return parts.join(' / ') || 'Cardio';
    } else {
        return (ex.targetDuration || 0) + 'min';
    }
}

function renderStrengthSets(ex, exLog, ei) {
    let html = '<div class="wo-sets">';

    (exLog.sets || []).forEach((set, si) => {
        html += `<div class="wo-set-row">
      <span class="wo-set-num">Set ${si + 1}:</span>
      <span class="wo-set-val">${set.reps} × ${set.weight}lbs</span>
      <button class="btn-danger btn-xs" data-wo-action="del-set" data-woei="${ei}" data-wosi="${si}">×</button>
    </div>`;
    });

    const setsLogged = (exLog.sets || []).length;
    const setsRemaining = (ex.targetSets || 3) - setsLogged;
    if (setsRemaining > 0 || setsLogged === 0) {
        html += `<div class="wo-add-set">
      <input type="number" id="wo-set-reps-${ei}" value="${ex.targetReps || 10}"
        placeholder="Reps" min="1" inputmode="numeric" class="ex-inp-sm">
      <span class="ex-x">×</span>
      <input type="number" id="wo-set-weight-${ei}" value="${ex.targetWeight || ''}"
        placeholder="lbs" min="0" step="5" inputmode="numeric" class="ex-inp-sm">
      <button class="btn btn-sm btn-primary" data-wo-action="log-set" data-woei="${ei}">+ Set</button>
    </div>`;
    }

    if (setsRemaining > 0) {
        html += `<div class="wo-sets-remaining">${setsRemaining} set${setsRemaining > 1 ? 's' : ''} remaining</div>`;
    }

    html += '</div>';
    return html;
}

function renderCardioFields(ex, exLog, ei) {
    return `<div class="wo-cardio-fields">
    <div class="wo-field-row">
      <label>Duration</label>
      <input type="number" id="wo-duration-${ei}" value="${exLog.duration || ''}"
        placeholder="${ex.targetDuration || 0}" min="0" inputmode="numeric" class="ex-inp-sm">
      <span class="ex-unit">min</span>
    </div>
    <div class="wo-field-row">
      <label>Distance</label>
      <input type="number" id="wo-distance-${ei}" value="${exLog.distance || ''}"
        placeholder="${ex.targetDistance || 0}" min="0" step="0.1" inputmode="decimal" class="ex-inp-sm">
      <span class="ex-unit">mi</span>
    </div>
  </div>`;
}

function renderFlexibilityFields(ex, exLog, ei) {
    return `<div class="wo-cardio-fields">
    <div class="wo-field-row">
      <label>Duration</label>
      <input type="number" id="wo-duration-${ei}" value="${exLog.duration || ''}"
        placeholder="${ex.targetDuration || 0}" min="0" inputmode="numeric" class="ex-inp-sm">
      <span class="ex-unit">min</span>
    </div>
  </div>`;
}

// ── Events ──

export function attachWorkoutDayEvents(ds, log, getDayLogFn, scheduleSaveFn, rerenderFn) {
    const section = document.querySelector('.workout-section');
    if (!section) return;

    const wp = S.plan.workout;
    if (!wp || wp.days.length === 0) return;

    // Day picker
    const daySelect = document.getElementById('wo-day-select');
    if (daySelect) {
        daySelect.onchange = () => {
            log.workoutDayIndex = parseInt(daySelect.value);
            log.workout = { exercises: {} };
            expandedExercise = 0;
            scheduleSaveFn(ds);
            rerenderFn();
        };
    }

    // Delegated click handlers
    section.addEventListener('click', (e) => {
        const action = e.target.closest('[data-wo-action]');
        if (!action) return;

        const act = action.dataset.woAction;
        const ei = action.dataset.woei !== undefined ? +action.dataset.woei : null;

        if (act === 'expand' && ei !== null) {
            // Don't toggle if clicking the checkbox
            if (e.target.closest('[data-wo-action="toggle-exercise"]')) return;

            const isOpening = expandedExercise !== ei;
            expandedExercise = isOpening ? ei : -1;
            rerenderFn();

            if (isOpening) {
                // Lazy load history
                const dayIdx = log.workoutDayIndex != null ? log.workoutDayIndex : 0;
                loadHistoryForExercise(ei, dayIdx);
            }
        } else if (act === 'toggle-exercise' && ei !== null) {
            e.stopPropagation();
            const exLog = getExerciseLog(log, ei);
            exLog.completed = !exLog.completed;
            scheduleSaveFn(ds);
            rerenderFn();
        } else if (act === 'log-set' && ei !== null) {
            const repsInp = document.getElementById('wo-set-reps-' + ei);
            const weightInp = document.getElementById('wo-set-weight-' + ei);
            if (!repsInp) return;

            const reps = parseInt(repsInp.value) || 0;
            const weight = parseFloat(weightInp?.value) || 0;
            if (reps <= 0) return;

            const exLog = getExerciseLog(log, ei);
            if (!exLog.sets) exLog.sets = [];
            exLog.sets.push({ reps, weight });

            // Auto-complete if all target sets done
            const dayIdx = log.workoutDayIndex || 0;
            const day = wp.days[dayIdx];
            if (day && day.exercises[ei]) {
                const targetSets = day.exercises[ei].targetSets || 3;
                if (exLog.sets.length >= targetSets) {
                    exLog.completed = true;
                    // Auto-expand next incomplete exercise
                    const nextIncomplete = day.exercises.findIndex((ex, i) =>
                        i > ei && !getExerciseLog(log, i).completed
                    );
                    if (nextIncomplete !== -1) expandedExercise = nextIncomplete;
                }
            }

            scheduleSaveFn(ds);
            rerenderFn();
            startRestTimer();
        } else if (act === 'del-set' && ei !== null && si !== null) {
            const exLog = getExerciseLog(log, ei);
            if (exLog.sets) exLog.sets.splice(si, 1);
            scheduleSaveFn(ds);
            rerenderFn();
        }
    });

    // Cardio/flexibility inputs
    section.addEventListener('input', (e) => {
        const t = e.target;
        const id = t.id || '';
        if (id.startsWith('wo-duration-')) {
            const ei = parseInt(id.replace('wo-duration-', ''));
            const exLog = getExerciseLog(log, ei);
            exLog.duration = parseFloat(t.value) || 0;
            if (exLog.duration > 0) exLog.completed = true;
            scheduleSaveFn(ds);
        } else if (id.startsWith('wo-distance-')) {
            const ei = parseInt(id.replace('wo-distance-', ''));
            const exLog = getExerciseLog(log, ei);
            exLog.distance = parseFloat(t.value) || 0;
            scheduleSaveFn(ds);
        }
    });

    // Timer stop
    const timerStop = document.getElementById('wo-timer-stop');
    if (timerStop) timerStop.onclick = () => {
        stopRestTimer();
        rerenderFn();
    };
}

// ── Rest Timer ──

function startRestTimer() {
    stopTimerInterval();
    restTimerSeconds = S.settings.restTimerDuration || 90;
    timerActive = true;

    const timerEl = document.getElementById('wo-rest-timer');
    const valEl = document.getElementById('wo-timer-val');
    if (timerEl) timerEl.style.display = 'flex';
    if (valEl) valEl.textContent = formatTimer(restTimerSeconds);

    restTimerInterval = setInterval(() => {
        restTimerSeconds--;
        if (restTimerSeconds <= 0) {
            stopRestTimer();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            return;
        }
        const valEl = document.getElementById('wo-timer-val');
        if (valEl) valEl.textContent = formatTimer(restTimerSeconds);
    }, 1000);
}

function stopTimerInterval() {
    if (restTimerInterval) {
        clearInterval(restTimerInterval);
        restTimerInterval = null;
    }
}

function stopRestTimer() {
    stopTimerInterval();
    timerActive = false;
    const timerEl = document.getElementById('wo-rest-timer');
    if (timerEl) timerEl.style.display = 'none';
}

async function loadHistoryForExercise(ei, dayIdx) {
    const el = document.getElementById(`wo-history-${ei}`);
    if (!el) return;

    // Use current selected date as upper bound (exclusive)
    const beforeDate = fmtDate(S.selectedDate);

    // Get exercise name from plan
    const wp = S.plan.workout;
    const day = wp.days[dayIdx || 0];
    if (!day || !day.exercises[ei]) return;
    const exName = day.exercises[ei].name;

    el.innerHTML = '<span class="wo-hist-loading">Loading...</span>';

    const [history, pr] = await Promise.all([
        getLastSession(exName, beforeDate),
        getExercisePR(exName)
    ]);

    if (!history) {
        el.innerHTML = '<span class="wo-hist-label">No previous history</span>';
        // Still show PR if exists? Probably rare to have PR but no history if we cleared history?
        // But getExercisePR queries ALL history. getLastSession queries BEFORE current date.
        // So PR could exist from a future date (if we went back in time)?
        // Edge case. Let's keep it simple.
        return;
    }

    // Format sets
    const setsStr = history.sets.map(s => {
        return `${s.weight}×${s.reps}`;
    }).join(', ');

    // Format date text
    const [y, m, d] = history.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    let prHtml = '';
    if (pr > 0) prHtml = ` <span class="wo-pr-badge" style="color:var(--primary);margin-left:8px;font-size:0.9em">🏆 PR: ${pr}lbs</span>`;

    el.innerHTML = `<span class="wo-hist-label">Last (${dateStr}):</span> <span class="wo-hist-val">${setsStr}</span>${prHtml}`;
}
