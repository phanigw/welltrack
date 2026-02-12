export function todayStr() { return fmtDate(new Date()); }

export function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function monthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function parseDateParts(s) {
  const p = s.split('-');
  return { year: p[0], month: p[1], day: p[2], mk: p[0] + '-' + p[1] };
}

export function parseDate(s) {
  const p = s.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

export function escH(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// SVG Icons
export const SVG_CHEVRON_LEFT = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 4 7 10 13 16"/></svg>`;
export const SVG_CHEVRON_RIGHT = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 4 13 10 7 16"/></svg>`;
export const SVG_X_CIRCLE = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><line x1="7" y1="7" x2="13" y2="13"/><line x1="13" y1="7" x2="7" y2="13"/></svg>`;
export const SVG_PLUS = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>`;
export const SVG_DUMBBELL = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="10" x2="16" y2="10"/><rect x="2" y="7" width="3" height="6" rx="1"/><rect x="15" y="7" width="3" height="6" rx="1"/></svg>`;
