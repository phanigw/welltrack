import { S, sb } from './state.js';
import { loadMonth, getExerciseHistoryMax } from './data.js';
import { monthKey, fmtDate } from './helpers.js';
import { consumedMacros, planTargets } from './scoring.js';

let weightChart = null;
let macroChart = null;
let strengthChart = null;

export async function renderAnalytics() {
    // 1. Ensure we have data for the last 3 months
    const today = new Date();
    const curY = today.getFullYear();
    const curM = today.getMonth();

    // Load current + previous 2 months
    const loadPromises = [];
    for (let i = 0; i < 3; i++) {
        let y = curY;
        let m = curM - i;
        if (m < 0) { m += 12; y--; }
        if (!S.months[monthKey(y, m)]) {
            loadPromises.push(loadMonth(y, m));
        }
    }
    await Promise.all(loadPromises);

    // 2. Render Shell
    const html = `
    <div class="analytics-container" style="padding:16px; padding-bottom:80px">
        <div class="card">
            <div class="card-title">Body Weight Trend</div>
            <div class="chart-container" style="position: relative; height:200px; width:100%">
                <canvas id="weightChart"></canvas>
            </div>
            <div class="chart-stat" id="weightStat"></div>
        </div>

        <div class="card" style="margin-top:16px">
            <div class="card-title">Nutrition (Last 14 Days)</div>
            <div class="chart-container" style="position: relative; height:200px; width:100%">
                <canvas id="macroChart"></canvas>
            </div>
        </div>

        <div class="card" style="margin-top:16px">
            <div class="card-title">Strength Progress</div>
            <div style="margin-bottom:12px">
                <select id="strength-ex-select" class="form-select" style="width:100%"></select>
            </div>
            <div class="chart-container" style="position: relative; height:200px; width:100%">
                <canvas id="strengthChart"></canvas>
            </div>
        </div>
    </div>`;

    document.getElementById('screen-analytics').innerHTML = html;

    // 3. Render Charts
    renderWeightChart();
    renderMacroChart();
    populateStrengthSelect();
}

function renderWeightChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;

    // Aggregate data from all loaded months
    const dataPoints = [];
    Object.keys(S.months).sort().forEach(mk => {
        const monthData = S.months[mk];
        Object.keys(monthData).sort((a, b) => parseInt(a) - parseInt(b)).forEach(dayNum => {
            const entry = monthData[dayNum];
            if (entry.bodyWeight && entry.bodyWeight > 0) {
                // Construct date string YYYY-MM-DD
                const [y, m] = mk.split('-').map(Number);
                const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                dataPoints.push({ x: dateStr, y: entry.bodyWeight });
            }
        });
    });

    // Destroy old if exists
    if (weightChart) weightChart.destroy();

    if (dataPoints.length === 0) {
        document.getElementById('weightStat').innerHTML = '<div style="text-align:center;color:var(--text-muted)">No weight data recorded recently.</div>';
        return;
    }

    const labels = dataPoints.map(d => {
        const date = new Date(d.x);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
    const values = dataPoints.map(d => d.y);

    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (lbs)',
                data: values,
                borderColor: '#FFC107', // var(--primary)
                backgroundColor: 'rgba(255, 193, 7, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(128,128,128,0.1)' }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderMacroChart() {
    const ctx = document.getElementById('macroChart');
    if (!ctx) return;

    // Get last 14 days
    const dates = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d);
    }

    const cals = [];
    const targets = planTargets(); // Note: this uses current plan targets, which might vary from past history if plan changed. Accepted limitation.
    const goalLine = [];

    dates.forEach(date => {
        const y = date.getFullYear();
        const m = date.getMonth();
        const d = date.getDate();
        const mk = monthKey(y, m);

        let cal = 0;
        if (S.months[mk] && S.months[mk][d]) {
            const log = S.months[mk][d];
            const cons = consumedMacros(log);
            cal = cons.calories;
        }
        cals.push(cal);
        goalLine.push(targets.calories);
    });

    if (macroChart) macroChart.destroy();

    const labels = dates.map(d => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }));

    macroChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Target',
                    data: goalLine,
                    type: 'line',
                    borderColor: '#9E9E9E',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    borderWidth: 2,
                    order: 0
                },
                {
                    label: 'Calories',
                    data: cals,
                    backgroundColor: cals.map((c, i) => c > goalLine[i] * 1.1 ? '#F44336' : '#2196F3'), // Red if over +10%, Blue otherwise
                    borderRadius: 4,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    grid: { color: 'rgba(128,128,128,0.1)' },
                    beginAtZero: true
                },
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 7 }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

async function populateStrengthSelect() {
    const sel = document.getElementById('strength-ex-select');
    if (!sel) return;

    // Flatten exercises from Plan
    const exercises = new Set();
    const wp = S.plan.workout;
    if (wp && wp.days) {
        wp.days.forEach(day => {
            if (day.exercises) {
                day.exercises.forEach(ex => {
                    if (ex.name) exercises.add(ex.name);
                });
            }
        });
    }

    if (exercises.size === 0) {
        sel.innerHTML = '<option>No exercises found in Plan</option>';
        sel.disabled = true;
        return;
    }

    const sorted = Array.from(exercises).sort();
    sel.innerHTML = sorted.map(ex => `<option value="${ex}">${ex}</option>`).join('');

    // Listen for change
    sel.onchange = () => {
        renderStrengthChart(sel.value);
    };

    // Initial render
    if (sorted.length > 0) {
        renderStrengthChart(sorted[0]);
    }
}

async function renderStrengthChart(exerciseName) {
    const ctx = document.getElementById('strengthChart');
    if (!ctx) return;

    if (strengthChart) strengthChart.destroy();

    // Show loading? Chart.js clears canvas usually.

    const history = await getExerciseHistoryMax(exerciseName);

    if (!history || history.length === 0) {
        // Render empty chart
        // Or text? Canvas is hard to put text on easily without plugin.
        // We'll just leave it empty.
        return;
    }

    const labels = history.map(h => {
        const [y, m, d] = h.date.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });
    const values = history.map(h => h.weight);

    strengthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Max Weight (lbs)',
                data: values,
                borderColor: '#4CAF50', // Success green? Or stick to primary?
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                tension: 0.1,
                fill: true,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    grid: { color: 'rgba(128,128,128,0.1)' }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}
