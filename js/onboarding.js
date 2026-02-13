import { S } from './state.js';
import { escH } from './helpers.js';
import { savePlan, saveSettings } from './data.js';
import { parsePlanText } from './scoring.js';

// ============================================================
// ONBOARDING — 4-Step Wizard
// ============================================================

let step = 0;
let onCompleteFn = null;

export function shouldShowOnboarding() {
    return !S.settings.onboardingCompleted &&
        S.plan.meals.length === 0 &&
        (!S.plan.workout || !S.plan.workout.days || S.plan.workout.days.length === 0);
}

export function startOnboarding(onComplete) {
    step = 0;
    onCompleteFn = onComplete;
    renderStep();
}

function renderStep() {
    const el = document.getElementById('screen-onboarding');
    const steps = [renderWelcome, renderDiet, renderWorkout, renderDone];
    const dots = Array.from({ length: 4 }, (_, i) =>
        `<div class="onboard-dot ${i === step ? 'active' : i < step ? 'done' : ''}"></div>`
    ).join('');

    let html = `<div class="onboard-card">
    <div class="onboard-dots">${dots}</div>
    ${steps[step]()}
  </div>`;
    el.innerHTML = html;
    attachStepEvents();
}

function renderWelcome() {
    return `
    <div class="onboard-title">Welcome to WellTrack</div>
    <div class="onboard-subtitle">Let's set up your targets to get started.</div>
    <div class="onboard-fields">
      <div class="setting-row">
        <label>Daily Step Target</label>
        <input type="number" id="ob-steps" value="${S.settings.stepTarget}" min="0" step="500" inputmode="numeric">
      </div>
      <div class="setting-row">
        <label>Sleep Target (hrs)</label>
        <input type="number" id="ob-sleep" value="${S.settings.sleepTarget}" min="0" max="24" step="0.5" inputmode="decimal">
      </div>
      <div class="setting-row">
        <label>Water Target (glasses)</label>
        <input type="number" id="ob-water" value="${S.settings.waterTarget}" min="1" max="20" step="1" inputmode="numeric">
      </div>
    </div>
    <div class="onboard-nav">
      <div></div>
      <button class="btn btn-primary" id="ob-next">Next</button>
    </div>`;
}

function renderDiet() {
    return `
    <div class="onboard-title">Diet Plan</div>
    <div class="onboard-subtitle">Paste your meal plan or skip for now.</div>
    <textarea id="ob-diet-text" rows="8" placeholder="Breakfast\nOatmeal, 50g, 180cal, 6p, 27c, 4f\nBanana, 1 medium, 105cal, 1.3p, 27c, 0.4f\n\nLunch\nChicken, 150g, 165cal, 35p, 0c, 5f"></textarea>
    <div class="onboard-nav">
      <button class="btn btn-secondary" id="ob-back">Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" id="ob-skip">Skip</button>
        <button class="btn btn-primary" id="ob-next">Import & Next</button>
      </div>
    </div>`;
}

function renderWorkout() {
    return `
    <div class="onboard-title">Workout Plan</div>
    <div class="onboard-subtitle">Paste your workout plan or skip for now.</div>
    <textarea id="ob-workout-text" rows="8" placeholder="Push Day\nBench Press, strength, 3x10, 135\nShoulder Press, strength, 3x12, 65\n\nPull Day\nBarbell Row, strength, 4x8, 95"></textarea>
    <div class="onboard-nav">
      <button class="btn btn-secondary" id="ob-back">Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" id="ob-skip">Skip</button>
        <button class="btn btn-primary" id="ob-next">Import & Next</button>
      </div>
    </div>`;
}

function renderDone() {
    const hasDiet = S.plan.meals.length > 0;
    const hasWorkout = S.plan.workout && S.plan.workout.days.length > 0;
    return `
    <div class="onboard-title">You're All Set!</div>
    <div class="onboard-subtitle">Here's what we configured:</div>
    <div class="onboard-summary">
      <div class="onboard-summary-item">Steps: ${S.settings.stepTarget.toLocaleString()}/day</div>
      <div class="onboard-summary-item">Sleep: ${S.settings.sleepTarget}h</div>
      <div class="onboard-summary-item">Water: ${S.settings.waterTarget} glasses</div>
      <div class="onboard-summary-item">Diet Plan: ${hasDiet ? S.plan.meals.length + ' meals' : 'Not set'}</div>
      <div class="onboard-summary-item">Workout: ${hasWorkout ? S.plan.workout.days.length + ' days' : 'Not set'}</div>
    </div>
    <div class="onboard-nav">
      <button class="btn btn-secondary" id="ob-back">Back</button>
      <button class="btn btn-primary" id="ob-finish">Get Started</button>
    </div>`;
}

function parseWorkoutTextOnboarding(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const days = [];
    let currentDay = null;
    const TYPES = ['strength', 'cardio', 'flexibility'];

    for (const line of lines) {
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
        const type = TYPES.includes(typeRaw) ? typeRaw : 'strength';
        const ex = { name, type, targetSets: null, targetReps: null, targetWeight: null, targetDuration: null, targetDistance: null };

        if (type === 'strength') {
            const match = (parts[2] || '').match(/(\d+)\s*[x×]\s*(\d+)/i);
            if (match) { ex.targetSets = parseInt(match[1]); ex.targetReps = parseInt(match[2]); }
            ex.targetWeight = parseFloat(parts[3]) || 0;
        } else if (type === 'cardio') {
            ex.targetDuration = parseFloat(parts[2]) || 0;
            ex.targetDistance = parseFloat(parts[3]) || 0;
        } else {
            ex.targetDuration = parseFloat(parts[2]) || 0;
        }
        currentDay.exercises.push(ex);
    }
    return days;
}

function attachStepEvents() {
    const nextBtn = document.getElementById('ob-next');
    const backBtn = document.getElementById('ob-back');
    const skipBtn = document.getElementById('ob-skip');
    const finishBtn = document.getElementById('ob-finish');

    if (backBtn) backBtn.onclick = () => { step--; renderStep(); };
    if (skipBtn) skipBtn.onclick = () => { step++; renderStep(); };

    if (nextBtn) nextBtn.onclick = () => {
        if (step === 0) {
            // Save settings
            const stepsInp = document.getElementById('ob-steps');
            const sleepInp = document.getElementById('ob-sleep');
            const waterInp = document.getElementById('ob-water');
            if (stepsInp) S.settings.stepTarget = Math.max(0, parseInt(stepsInp.value) || 10000);
            if (sleepInp) S.settings.sleepTarget = Math.max(0, parseFloat(sleepInp.value) || 8);
            if (waterInp) S.settings.waterTarget = Math.max(1, parseInt(waterInp.value) || 8);
        } else if (step === 1) {
            // Import diet
            const text = document.getElementById('ob-diet-text')?.value;
            if (text && text.trim()) {
                const result = parsePlanText(text);
                if (result.meals.some(m => m.items.length > 0)) {
                    S.plan = { ...S.plan, meals: result.meals };
                }
            }
        } else if (step === 2) {
            // Import workout
            const text = document.getElementById('ob-workout-text')?.value;
            if (text && text.trim()) {
                const days = parseWorkoutTextOnboarding(text);
                if (days.length > 0 && days.some(d => d.exercises.length > 0)) {
                    S.plan.workout = { type: days.length > 1 ? 'split' : 'fixed', days };
                }
            }
        }
        step++;
        renderStep();
    };

    if (finishBtn) finishBtn.onclick = async () => {
        S.settings.onboardingCompleted = true;
        await Promise.all([savePlan(), saveSettings()]);
        if (onCompleteFn) onCompleteFn();
    };
}
