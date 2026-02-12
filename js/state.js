import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const S = {
  userId: null,
  screen: 'calendar',
  plan: { meals: [] },
  settings: { stepTarget: 10000, sleepTarget: 8, waterTarget: 8 },
  selectedDate: new Date(),
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  months: {},
  saveTimer: null,
  savePendingMonth: null,
  extraFormOpen: false
};
