import { S } from './state.js';
import { fmtDate, monthKey, safeNum } from './helpers.js';
import { calcScore, hasDayData, consumedMacros } from './scoring.js';
import { loadMonth } from './data.js';

// ============================================================
// DASHBOARD — Weekly Summary Card
// ============================================================

function getLog(date) {
    const y = date.getFullYear(), m = date.getMonth();
    const mk = monthKey(y, m);
    const dk = String(date.getDate()).padStart(2, '0');
    return S.months[mk] ? S.months[mk][dk] : null;
}

export function calcStreak() {
    const today = new Date();
    const todayStr = fmtDate(today);
    let streak = 0;
    const d = new Date(today);

    // Skip today if no data yet
    const todayLog = getLog(d);
    if (!todayLog || !hasDayData(todayLog)) {
        d.setDate(d.getDate() - 1);
    }

    for (let i = 0; i < 60; i++) {
        const log = getLog(d);
        if (!log || !hasDayData(log)) break;
        const score = calcScore(log);
        if (!score || (score.combined !== 'gold' && score.combined !== 'silver')) break;
        streak++;
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

export async function renderDashboard() {
    // Load previous month for streak spanning month boundaries
    const now = new Date();
    let prevY = now.getFullYear(), prevM = now.getMonth() - 1;
    if (prevM < 0) { prevM = 11; prevY--; }
    await loadMonth(prevY, prevM);

    const streak = calcStreak();

    // Week stats: Mon-Sun of current week
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

    let totalCal = 0, totalPro = 0, daysWithData = 0;
    const weekDots = [];
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const log = getLog(d);
        let dotClass = 'empty';
        if (log && hasDayData(log)) {
            const score = calcScore(log);
            if (score) dotClass = score.combined;
            const consumed = consumedMacros(log);
            totalCal += consumed.calories;
            totalPro += consumed.protein;
            daysWithData++;
        }
        const isToday = fmtDate(d) === fmtDate(today);
        weekDots.push({ label: dayLabels[i], cls: dotClass, isToday });
    }

    const avgCal = daysWithData > 0 ? Math.round(totalCal / daysWithData) : 0;
    const avgPro = daysWithData > 0 ? Math.round(totalPro / daysWithData) : 0;

    // Today's score
    const todayLog = getLog(today);
    const todayScore = todayLog ? calcScore(todayLog) : null;

    let html = `<div class="dashboard-card">`;

    // Row 1: Streak + today's score
    html += `<div class="dash-row">
    <div class="dash-stat">
      <div class="dash-stat-val">${streak}</div>
      <div class="dash-stat-label">Day Streak</div>
    </div>
    <div class="dash-stat">
      <div class="dash-stat-val">${avgCal}</div>
      <div class="dash-stat-label">Avg Cal/Day</div>
    </div>
    <div class="dash-stat">
      <div class="dash-stat-val">${avgPro}g</div>
      <div class="dash-stat-label">Avg Protein</div>
    </div>
    ${todayScore ? `<div class="dash-stat"><span class="score-badge ${todayScore.combined}">${todayScore.combined}</span><div class="dash-stat-label">Today</div></div>` : ''}
  </div>`;

    // Row 2: Week dots
    html += `<div class="dash-week-dots">`;
    for (const dot of weekDots) {
        html += `<div class="dash-dot-col${dot.isToday ? ' dash-today' : ''}">
      <div class="dash-dot ${dot.cls}"></div>
      <span class="dash-dot-label">${dot.label}</span>
    </div>`;
    }
    html += `</div>`;

    html += `</div>`;
    return html;
}
