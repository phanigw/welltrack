import { S } from './state.js';
import { escH, SVG_X_CIRCLE, SVG_PLUS } from './helpers.js';

// ============================================================
// WORKOUT PLAN EDITOR
// ============================================================

const EXERCISE_TYPES = ['strength', 'cardio', 'flexibility'];

function newExercise() {
  return {
    name: '', type: 'strength',
    targetSets: 3, targetReps: 10, targetWeight: 0,
    targetDuration: null, targetDistance: null
  };
}

function newWorkoutDay(name) {
  return { name: name || '', exercises: [] };
}

function ensureWorkout() {
  if (!S.plan.workout) S.plan.workout = { type: 'split', days: [] };
}

// ── Render ──

export function renderWorkoutPlan() {
  ensureWorkout();
  const w = S.plan.workout;
  const isSplit = w.type === 'split';

  let html = `<div class="card workout-plan-card" id="workout-plan-card">
    <div class="card-title"><span>Workout Plan</span></div>

    <div class="wp-type-row">
      <label class="wp-type-label">Plan Type</label>
      <div class="wp-type-toggle">
        <button class="btn btn-sm ${!isSplit ? 'btn-primary' : 'btn-secondary'}" id="wp-type-fixed">Daily Fixed</button>
        <button class="btn btn-sm ${isSplit ? 'btn-primary' : 'btn-secondary'}" id="wp-type-split">Weekly Split</button>
      </div>
    </div>`;

  if (!isSplit) {
    if (w.days.length === 0) w.days.push(newWorkoutDay('Daily Workout'));
    html += renderWorkoutDayEditor(w.days[0], 0);
  } else {
    w.days.forEach((day, di) => {
      html += renderWorkoutDayEditor(day, di);
    });
    html += `<button class="btn-add" id="wp-add-day">${SVG_PLUS} Add Workout Day</button>`;
  }

  // Import from text
  html += `<div class="wp-import" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
    <div class="card-title">
      <span>Import Workout from Text</span>
      <button class="btn btn-sm btn-secondary" id="wp-toggle-import">Show</button>
    </div>
    <div id="wp-import-body" style="display:none">
      <textarea id="wp-import-text" rows="6" placeholder="Push Day\nBench Press, strength, 3x10, 135\nShoulder Press, strength, 3x12, 65\n\nPull Day\nBarbell Row, strength, 4x8, 95\nBicep Curls, strength, 3x12, 30\n\nLeg Day\nSquats, strength, 4x8, 185\nTreadmill, cardio, 30min, 2mi"></textarea>
      <button class="btn btn-sm btn-primary" id="wp-import-btn" style="margin-top:8px">Import</button>
    </div>
  </div>`;

  // Save button
  html += `<div style="margin-top:12px">
    <button class="btn btn-sm btn-primary" id="wp-save-btn" style="width:100%">Save Workout Plan</button>
  </div>`;

  html += `</div>`;
  return html;
}

function renderWorkoutDayEditor(day, di) {
  const isSplit = S.plan.workout.type === 'split';
  let html = `<div class="workout-day-editor" data-wdi="${di}">
    <div class="wd-hdr">
      <input type="text" value="${escH(day.name)}" data-wp-field="dayname" data-wdi="${di}" placeholder="Day name (e.g. Push Day)">
      ${isSplit ? `<button class="btn-danger" data-wp-action="del-day" data-wdi="${di}">${SVG_X_CIRCLE}</button>` : ''}
    </div>`;

  if (day.exercises.length > 0) {
    html += `<div class="wd-exercise-labels">
      <span>Exercise</span><span>Type</span><span>Details</span><span></span>
    </div>`;
  }

  day.exercises.forEach((ex, ei) => {
    html += renderExerciseRow(ex, di, ei);
  });

  html += `<button class="btn-add btn-add-sm" data-wp-action="add-exercise" data-wdi="${di}">${SVG_PLUS} Add Exercise</button>`;
  html += `</div>`;
  return html;
}

function renderExerciseRow(ex, di, ei) {
  const typeOptions = EXERCISE_TYPES.map(t =>
    `<option value="${t}" ${t === ex.type ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
  ).join('');

  let detailsHtml = '';
  if (ex.type === 'strength') {
    detailsHtml = `<div class="ex-detail-group">
      <input type="number" value="${ex.targetSets || ''}" data-wp-field="targetSets" data-wdi="${di}" data-wei="${ei}"
        placeholder="3" min="1" max="20" inputmode="numeric" class="ex-inp-sm">
      <span class="ex-x">×</span>
      <input type="number" value="${ex.targetReps || ''}" data-wp-field="targetReps" data-wdi="${di}" data-wei="${ei}"
        placeholder="10" min="1" max="100" inputmode="numeric" class="ex-inp-sm">
      <span class="ex-at">@</span>
      <input type="number" value="${ex.targetWeight || ''}" data-wp-field="targetWeight" data-wdi="${di}" data-wei="${ei}"
        placeholder="lbs" min="0" step="5" inputmode="numeric" class="ex-inp-sm">
    </div>`;
  } else if (ex.type === 'cardio') {
    detailsHtml = `<div class="ex-detail-group">
      <input type="number" value="${ex.targetDuration || ''}" data-wp-field="targetDuration" data-wdi="${di}" data-wei="${ei}"
        placeholder="min" min="0" inputmode="numeric" class="ex-inp-sm">
      <span class="ex-unit">min</span>
      <input type="number" value="${ex.targetDistance || ''}" data-wp-field="targetDistance" data-wdi="${di}" data-wei="${ei}"
        placeholder="mi" min="0" step="0.1" inputmode="decimal" class="ex-inp-sm">
      <span class="ex-unit">mi</span>
    </div>`;
  } else {
    detailsHtml = `<div class="ex-detail-group">
      <input type="number" value="${ex.targetDuration || ''}" data-wp-field="targetDuration" data-wdi="${di}" data-wei="${ei}"
        placeholder="min" min="0" inputmode="numeric" class="ex-inp-sm">
      <span class="ex-unit">min</span>
    </div>`;
  }

  return `<div class="exercise-row" data-wdi="${di}" data-wei="${ei}">
    <input type="text" value="${escH(ex.name)}" data-wp-field="exname" data-wdi="${di}" data-wei="${ei}" placeholder="Exercise name" class="ex-name-inp">
    <select data-wp-field="extype" data-wdi="${di}" data-wei="${ei}" class="ex-type-sel">${typeOptions}</select>
    ${detailsHtml}
    <button class="btn-danger" data-wp-action="del-exercise" data-wdi="${di}" data-wei="${ei}">${SVG_X_CIRCLE}</button>
  </div>`;
}

// ── Import Parser ──

function parseWorkoutText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const days = [];
  let currentDay = null;

  for (const line of lines) {
    // Check if it's a day header (no comma = day name)
    if (!line.includes(',')) {
      currentDay = { name: line, exercises: [] };
      days.push(currentDay);
      continue;
    }

    if (!currentDay) {
      currentDay = { name: 'Workout', exercises: [] };
      days.push(currentDay);
    }

    const parts = line.split(',').map(p => p.trim());
    const name = parts[0] || '';
    const typeRaw = (parts[1] || 'strength').toLowerCase();
    let type = EXERCISE_TYPES.includes(typeRaw) ? typeRaw : 'strength';

    const ex = {
      name, type,
      targetSets: null, targetReps: null, targetWeight: null,
      targetDuration: null, targetDistance: null
    };

    if (type === 'strength') {
      // Expect "3x10" or "3×10" format
      const setsReps = parts[2] || '';
      const match = setsReps.match(/(\d+)\s*[x×]\s*(\d+)/i);
      if (match) {
        ex.targetSets = parseInt(match[1]);
        ex.targetReps = parseInt(match[2]);
      }
      ex.targetWeight = parseFloat(parts[3]) || 0;
    } else if (type === 'cardio') {
      // Expect "30min" and "2mi"
      const durStr = parts[2] || '';
      const distStr = parts[3] || '';
      ex.targetDuration = parseFloat(durStr) || 0;
      ex.targetDistance = parseFloat(distStr) || 0;
    } else {
      const durStr = parts[2] || '';
      ex.targetDuration = parseFloat(durStr) || 0;
    }

    currentDay.exercises.push(ex);
  }

  return days;
}

// ── Events ──
// Attach to the card element (recreated each render) to avoid stacking handlers

export function attachWorkoutPlanEvents(parentEl, savePlanFn) {
  ensureWorkout();

  const card = document.getElementById('workout-plan-card');
  if (!card) return;

  // Rerender helper — only re-renders the card area, not the full plan
  const rerender = () => {
    const container = document.getElementById('workout-plan-card');
    if (container) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderWorkoutPlan();
      container.replaceWith(tmp.firstElementChild);
      attachWorkoutPlanEvents(parentEl, savePlanFn);
    }
  };

  // Plan type
  const fixedBtn = card.querySelector('#wp-type-fixed');
  const splitBtn = card.querySelector('#wp-type-split');
  if (fixedBtn) fixedBtn.onclick = () => {
    S.plan.workout.type = 'fixed';
    if (S.plan.workout.days.length === 0) S.plan.workout.days.push(newWorkoutDay('Daily Workout'));
    rerender();
  };
  if (splitBtn) splitBtn.onclick = () => {
    S.plan.workout.type = 'split';
    rerender();
  };

  // Add day
  const addDayBtn = card.querySelector('#wp-add-day');
  if (addDayBtn) addDayBtn.onclick = () => {
    S.plan.workout.days.push(newWorkoutDay('Day ' + (S.plan.workout.days.length + 1)));
    rerender();
  };

  // Save
  const saveBtn = card.querySelector('#wp-save-btn');
  if (saveBtn) saveBtn.onclick = async () => {
    await savePlanFn();
    saveBtn.textContent = '✓ Saved';
    saveBtn.classList.replace('btn-primary', 'btn-secondary');
    setTimeout(() => {
      saveBtn.textContent = 'Save Workout Plan';
      saveBtn.classList.replace('btn-secondary', 'btn-primary');
    }, 1500);
  };

  // Import toggle
  const toggleImport = card.querySelector('#wp-toggle-import');
  if (toggleImport) toggleImport.onclick = () => {
    const body = card.querySelector('#wp-import-body');
    const visible = body.style.display !== 'none';
    body.style.display = visible ? 'none' : 'block';
    toggleImport.textContent = visible ? 'Show' : 'Hide';
  };

  // Import action
  const importBtn = card.querySelector('#wp-import-btn');
  if (importBtn) importBtn.onclick = async () => {
    const text = card.querySelector('#wp-import-text').value;
    const days = parseWorkoutText(text);
    if (days.length === 0 || days.every(d => d.exercises.length === 0)) {
      alert('No exercises found.\n\nExpected format:\nDay Name\nExercise, strength, 3x10, 135\nTreadmill, cardio, 30min, 2mi');
      return;
    }
    S.plan.workout.type = days.length > 1 ? 'split' : 'fixed';
    S.plan.workout.days = days;
    await savePlanFn();
    rerender();
  };

  // Click delegation — add/delete exercises and days
  card.addEventListener('click', (e) => {
    const action = e.target.closest('[data-wp-action]');
    if (!action) return;
    e.stopPropagation();

    const act = action.dataset.wpAction;
    const di = action.dataset.wdi !== undefined ? +action.dataset.wdi : null;
    const ei = action.dataset.wei !== undefined ? +action.dataset.wei : null;

    if (act === 'add-exercise' && di !== null) {
      S.plan.workout.days[di].exercises.push(newExercise());
      rerender();
    } else if (act === 'del-exercise' && di !== null && ei !== null) {
      S.plan.workout.days[di].exercises.splice(ei, 1);
      rerender();
    } else if (act === 'del-day' && di !== null) {
      S.plan.workout.days.splice(di, 1);
      rerender();
    }
  });

  // Input delegation — update exercise fields without re-render
  card.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset.wpField) return;
    const di = t.dataset.wdi !== undefined ? +t.dataset.wdi : null;
    const ei = t.dataset.wei !== undefined ? +t.dataset.wei : null;

    if (t.dataset.wpField === 'dayname' && di !== null) {
      S.plan.workout.days[di].name = t.value;
    } else if (di !== null && ei !== null) {
      const ex = S.plan.workout.days[di].exercises[ei];
      const field = t.dataset.wpField;
      if (field === 'exname') ex.name = t.value;
      else if (field === 'targetSets') ex.targetSets = parseInt(t.value) || 0;
      else if (field === 'targetReps') ex.targetReps = parseInt(t.value) || 0;
      else if (field === 'targetWeight') ex.targetWeight = parseFloat(t.value) || 0;
      else if (field === 'targetDuration') ex.targetDuration = parseFloat(t.value) || 0;
      else if (field === 'targetDistance') ex.targetDistance = parseFloat(t.value) || 0;
    }
  });

  // Type change — re-render to swap detail fields
  card.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.wpField !== 'extype') return;
    const di = +t.dataset.wdi;
    const ei = +t.dataset.wei;
    const ex = S.plan.workout.days[di].exercises[ei];
    ex.type = t.value;
    if (t.value === 'strength') {
      ex.targetSets = ex.targetSets || 3;
      ex.targetReps = ex.targetReps || 10;
      ex.targetDuration = null;
      ex.targetDistance = null;
    } else if (t.value === 'cardio') {
      ex.targetDuration = ex.targetDuration || 30;
      ex.targetDistance = ex.targetDistance || 0;
      ex.targetSets = null; ex.targetReps = null; ex.targetWeight = null;
    } else {
      ex.targetDuration = ex.targetDuration || 15;
      ex.targetSets = null; ex.targetReps = null; ex.targetWeight = null;
      ex.targetDistance = null;
    }
    rerender();
  });
}
