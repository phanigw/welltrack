import { safeNum } from './helpers.js';

// ── Toast Notifications ──
let toastContainer = null;

export function showToast(message, type = 'error') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // Trigger reflow for animation
  toast.offsetHeight;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}

// ── Circle SVG ──
export function circleSVG(val, max, color, size) {
  const v = Math.max(0, safeNum(val));
  const mx = Math.max(0, safeNum(max));
  const r = 40;
  const circ = 2 * Math.PI * r;
  const pct = mx > 0 ? Math.max(0, Math.min(v / mx, 1)) : 0;
  const isOver = v > mx && mx > 0;
  const stroke = isOver ? 'var(--red)' : color;
  const offset = circ * (1 - pct);
  return `<div class="circle-container" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="${r}" class="ring-bg"/>
      <circle cx="50" cy="50" r="${r}" class="ring-fg" stroke="${stroke}"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
    </svg>
    <div class="circle-val" style="color:${color}">${Math.round(v)}<small>/ ${Math.round(mx)}</small></div>
  </div>`;
}

// ── Macro Bar Helpers ──
export function macroBarPct(val, max) {
  if (max <= 0) return 0;
  return Math.min(Math.round((val / max) * 100), 100);
}

export function macroBarColor(val, max, color) {
  return val > max && max > 0 ? 'var(--red)' : color;
}

// ── Macros Card ──
export function renderMacrosCard(consumed, targets) {
  const calPct = macroBarPct(consumed.calories, targets.calories);
  const calColor = macroBarColor(consumed.calories, targets.calories, 'var(--cal-color)');
  const rows = [
    { label: 'Protein', cls: 'pro', val: consumed.protein, max: targets.protein, color: 'var(--pro-color)', unit: 'g' },
    { label: 'Carbs', cls: 'carb', val: consumed.carbs, max: targets.carbs, color: 'var(--carb-color)', unit: 'g' },
    { label: 'Fat', cls: 'fat', val: consumed.fat, max: targets.fat, color: 'var(--fat-color)', unit: 'g' },
  ];

  let html = `<div class="macros-card" id="macros-card">
    <div class="macro-main">
      <span class="macro-main-val">${Math.round(consumed.calories)}</span>
      <span class="macro-main-target">/ ${Math.round(targets.calories)}</span>
      <span class="macro-main-label">Calories</span>
    </div>
    <div class="macro-main-bar">
      <div class="macro-main-bar-fill" style="width:${calPct}%;background:${calColor}"></div>
    </div>
    <div class="macro-rows">`;

  for (const r of rows) {
    const pct = macroBarPct(r.val, r.max);
    const c = macroBarColor(r.val, r.max, r.color);
    html += `<div class="macro-row">
      <span class="macro-row-label ${r.cls}">${r.label}</span>
      <div class="macro-row-bar"><div class="macro-row-bar-fill" style="width:${pct}%;background:${c}"></div></div>
      <span class="macro-row-vals">${Math.round(r.val)} <small>/ ${Math.round(r.max)}${r.unit}</small></span>
    </div>`;
  }

  html += `</div></div>`;
  return html;
}
