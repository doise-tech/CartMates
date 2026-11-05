import { store } from '../store/supabase.js';
import { mountPartyBar } from '../ui/party-bar.js';
import { extractProduct } from '../lib/product.js';

// Runs on every http(s) page. The bar only appears while you are in a live party,
// and the page is only read when you press Save item.
if (window.top === window) start();

function start() {
  let bar = null;
  let mounting = false;

  const sync = async () => {
    if (mounting) return;
    mounting = true;
    try {
      const active = await store.getActive();
      if (bar && (!active || bar.partyId !== active.partyId)) {
        await bar.destroy();
        bar = null;
      }
      if (active && !bar) {
        bar = await mountPartyBar({
          store,
          listId: active.listId,
          partyId: active.partyId,
          getProduct: () => extractProduct(),
          onGone: () => { bar = null; },
        });
      }
    } catch {
      // Signed out, offline, or the party is gone. The bar stays hidden.
    } finally {
      mounting = false;
    }
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ('cm_active' in changes || 'cm_auth' in changes)) sync();
  });
  sync();
}
