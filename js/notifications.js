import { S } from './state.js';

// ============================================================
// NOTIFICATIONS / REMINDERS (Browser Notification API)
// ============================================================

let scheduledTimers = [];

export async function requestPermission() {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
}

function sendNotification(title, body) {
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(title, { body, icon: 'icons/icon.svg' });
    } catch {
        // Notification constructor can fail in some contexts
    }
}

export function clearReminders() {
    scheduledTimers.forEach(id => clearTimeout(id));
    scheduledTimers = [];
}

export function scheduleReminders() {
    clearReminders();
    const r = S.settings.reminders;
    if (!r || !r.enabled) return;

    const now = new Date();

    // Meal logging reminder
    if (r.mealLogging && r.mealLogging.enabled && r.mealLogging.time) {
        const ms = msUntilTime(now, r.mealLogging.time);
        if (ms > 0) {
            scheduledTimers.push(setTimeout(() => {
                sendNotification('WellTrack', 'Time to log your meals!');
            }, ms));
        }
    }

    // Workout reminder
    if (r.workout && r.workout.enabled && r.workout.time) {
        const ms = msUntilTime(now, r.workout.time);
        if (ms > 0) {
            scheduledTimers.push(setTimeout(() => {
                sendNotification('WellTrack', 'Time for your workout!');
            }, ms));
        }
    }

    // Water intake reminder (interval-based)
    if (r.waterIntake && r.waterIntake.enabled && r.waterIntake.interval > 0) {
        const intervalMs = r.waterIntake.interval * 60 * 1000;
        scheduledTimers.push(setInterval(() => {
            sendNotification('WellTrack', 'Time to drink some water!');
        }, intervalMs));
    }
}

function msUntilTime(now, timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target <= now) return -1; // Already passed today
    return target - now;
}

export function getDefaultReminders() {
    return {
        enabled: false,
        mealLogging: { enabled: false, time: '12:00' },
        waterIntake: { enabled: false, interval: 60 },
        workout: { enabled: false, time: '17:00' }
    };
}
