import { S } from './state.js';
import {
    todayStr, fmtDate, monthKey, escH, safeNum, parseDate,
    SVG_CHEVRON_LEFT, SVG_CHEVRON_RIGHT
} from './helpers.js';
import { loadMonth } from './data.js';
import { calcScore, consumedMacros, hasDayData } from './scoring.js';

// ============================================================
// CALENDAR
// ============================================================

export async function renderCalendar(showScreenFn) {
    await loadMonth(S.calYear, S.calMonth);
    const mk = monthKey(S.calYear, S.calMonth);
    const logs = S.months[mk] || {};
    const today = todayStr();
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const firstDay = new Date(S.calYear, S.calMonth, 1).getDay();
    const daysInMonth = new Date(S.calYear, S.calMonth + 1, 0).getDate();

    let html = `
    <div class="screen-title">Calendar</div>
    <div class="nav-bar">
      <button class="nav-btn" id="cal-prev">${SVG_CHEVRON_LEFT}</button>
      <div style="text-align:center">
        <div class="nav-label">${monthNames[S.calMonth]} ${S.calYear}</div>
        <button class="btn-today" id="cal-today">Today</button>
      </div>
      <button class="nav-btn" id="cal-next">${SVG_CHEVRON_RIGHT}</button>
    </div>
    <div class="cal-weekdays">
      <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
    </div>
    <div class="cal-grid">`;

    let tierCounts = { gold: 0, silver: 0, bronze: 0, fail: 0 };
    let trackedDays = 0;

    for (let i = 0; i < firstDay; i++) {
        html += '<div class="cal-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const ds = fmtDate(new Date(S.calYear, S.calMonth, d));
        const dk = String(d).padStart(2, '0');
        const log = logs[dk];
        const score = log ? calcScore(log) : null;
        const cls = ['cal-day'];
        if (ds === today) cls.push('today');
        if (score) {
            cls.push(score.combined);
            tierCounts[score.combined]++;
            trackedDays++;
        }

        let icons = '';
        let tooltip = '';
        if (log && hasDayData(log)) {
            // Build hover tooltip
            const tipParts = [];
            const cals = consumedMacros(log);
            if (cals.calories > 0) tipParts.push(`${cals.calories} cal`);
            const steps = safeNum(log.steps);
            if (steps > 0) tipParts.push(`${steps.toLocaleString()} steps`);
            if (log.resistanceTraining) {
                const dayIdx = log.workoutDayIndex || 0;
                const dayName = S.plan.workout?.days?.[dayIdx]?.name;
                tipParts.push(dayName ? `Workout: ${dayName}` : 'Workout');
            }
            tooltip = tipParts.join(' · ');

            // Cell icons: only steps + workout
            if (steps > 0) {
                const stepsK = steps >= 1000 ? (steps / 1000).toFixed(steps >= 10000 ? 0 : 1) + 'k' : steps;
                icons += `<span class="cal-chip">🏃${stepsK}</span>`;
            }
            if (log.resistanceTraining) {
                icons += `<span class="cal-chip">🏋️</span>`;
            }
        }

        html += `<div class="${cls.join(' ')}" data-date="${ds}" ${tooltip ? `title="${escH(tooltip)}"` : ''}>
      <span class="cal-num">${d}</span>
      ${icons ? `<span class="cal-icons">${icons}</span>` : ''}
    </div>`;
    }

    const totalCells = firstDay + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i++) {
        html += '<div class="cal-day empty"></div>';
    }

    html += '</div>';

    html += `<div class="cal-legend">
    <span><span class="dot dot-gold"></span> Gold</span>
    <span><span class="dot dot-silver"></span> Silver</span>
    <span><span class="dot dot-bronze"></span> Bronze</span>
    <span><span class="dot dot-fail"></span> Fail</span>
  </div>`;

    if (trackedDays > 0) {
        html += `<div class="month-summary">
      <div class="month-summary-title">Month Summary &mdash; ${trackedDays} day${trackedDays !== 1 ? 's' : ''} tracked</div>
      <div class="month-summary-counts">
        <div class="ms-item"><div class="ms-val gold">${tierCounts.gold}</div><div class="ms-label">Gold</div></div>
        <div class="ms-item"><div class="ms-val silver">${tierCounts.silver}</div><div class="ms-label">Silver</div></div>
        <div class="ms-item"><div class="ms-val bronze">${tierCounts.bronze}</div><div class="ms-label">Bronze</div></div>
        <div class="ms-item"><div class="ms-val fail">${tierCounts.fail}</div><div class="ms-label">Fail</div></div>
      </div>
    </div>`;
    }

    document.getElementById('screen-calendar').innerHTML = html;

    document.getElementById('cal-prev').onclick = async () => {
        S.calMonth--;
        if (S.calMonth < 0) { S.calMonth = 11; S.calYear--; }
        await renderCalendar(showScreenFn);
    };
    document.getElementById('cal-next').onclick = async () => {
        S.calMonth++;
        if (S.calMonth > 11) { S.calMonth = 0; S.calYear++; }
        await renderCalendar(showScreenFn);
    };
    document.getElementById('cal-today').onclick = async () => {
        const now = new Date();
        S.calYear = now.getFullYear();
        S.calMonth = now.getMonth();
        await renderCalendar(showScreenFn);
    };
    document.querySelectorAll('.cal-day[data-date]').forEach(el => {
        el.onclick = async () => {
            S.selectedDate = parseDate(el.dataset.date);
            await showScreenFn('day');
        };
    });
}
