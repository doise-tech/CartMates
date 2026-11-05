import { createClient } from '@supabase/supabase-js';

// Extensions have no localStorage shared between the popup and content scripts,
// so the sign-in session lives in chrome.storage.local instead.
// After you reload the extension, tabs that were already open keep an orphaned copy of this script.
// Its calls to chrome.storage throw "Extension context invalidated", so every call here is guarded.
const alive = () => {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

const storage = {
  async getItem(key) {
    if (!alive()) return null;
    try {
      const out = await chrome.storage.local.get(key);
      return out[key] ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    if (!alive()) return;
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch {
      // Orphaned tab. The new copy of the extension will pick the session up.
    }
  },
  async removeItem(key) {
    if (!alive()) return;
    try {
      await chrome.storage.local.remove(key);
    } catch {
      // Same as above.
    }
  },
};

// Many tabs run a copy of this on web pages. Only the popup and the extension's own pages refresh the
// token in the background; tabs refresh it on demand, so they don't race each other.
const inWebPage = /^https?:$/.test(globalThis.location?.protocol || '');

export const supabase = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
  auth: {
    storage,
    storageKey: 'cm_auth',
    persistSession: true,
    autoRefreshToken: !inWebPage,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});
