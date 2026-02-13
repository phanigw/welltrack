import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const S = {
  userId: null,
  screen: 'calendar',
  plan: { meals: [], workout: { type: 'split', days: [] } },
  settings: { stepTarget: 10000, sleepTarget: 8, waterTarget: 8, restTimerDuration: 90, theme: 'auto', favorites: [] },
  selectedDate: new Date(),
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  months: {},
  saveTimer: null,
  savePendingMonth: null,
  savePendingDates: new Set(),
  extraFormOpen: false,
  dayTab: 'food',
  planTab: 'diet',
  progressLogs: []
};
