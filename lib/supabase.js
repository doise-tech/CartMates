import { createClient } from '@supabase/supabase-js';

// Extensions have no localStorage shared between the popup and content scripts,
// so the sign-in session lives in chrome.storage.local instead.
const storage = {
  async getItem(key) {
    const out = await chrome.storage.local.get(key);
    return out[key] ?? null;
  },
  async setItem(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key) {
    await chrome.storage.local.remove(key);
  },
};

export const supabase = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
  auth: {
    storage,
    storageKey: 'cm_auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});
