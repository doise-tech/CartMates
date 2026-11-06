import { store } from '../store/supabase.js';
import { mountDrawer } from '../ui/drawer.js';
import { mountPartyBar } from '../ui/party-bar.js';
import { extractProduct, isProductPage } from '../lib/product.js';
import css from '../ui/styles.css';

// Runs on every web page. It adds the Cartmates tab on the right edge, and a Save button when the
// page looks like a product. The page is only read when you press Save. The live-party bar still
// appears while you are in a party.
const isTop = window.top === window;
const isHtml = !document.contentType || document.contentType === 'text/html';
if (isTop && isHtml && !document.getElementById('cartmates-drawer')) start();

function start() {
  const drawer = mountDrawer({ store, css, getProduct: () => extractProduct() });
  // The pull-out Cartmates handle shows on shopping pages and during a live party. Saving and going live
  // happen inside the drawer, so there are no separate Save / Go live buttons. The toolbar icon opens it anywhere.
  let isProduct = false;
  let isLive = false;
  const paint = () => {
    drawer.showTab(isLive || isProduct);
    drawer.showLive(false);
    drawer.showSave(false);
  };
  paint();
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'cm-toggle') drawer.toggle();
  });
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };

  // Product pages: look a few times while the page finishes loading, and again when the address changes.
  let lastHref = '';
  let tries = 0;
  const check = () => {
    if (!alive()) { clearInterval(timer); drawer.destroy(); return; } // extension was reloaded; this tab needs a refresh
    if (location.href !== lastHref) { lastHref = location.href; tries = 0; }
    if (tries++ < 6) { isProduct = isProductPage(document); paint(); }
  };
  const timer = setInterval(check, 2000);
  check();

  // The live-party bar, as before.
  let bar = null;
  let mounting = false;
  const sync = async () => {
    if (mounting) return;
    mounting = true;
    try {
      const active = await store.getActive();
      isLive = !!active;
      paint();
      if (bar && (!active || bar.partyId !== active.partyId)) {
        await bar.destroy();
        bar = null;
      }
      if (active && !bar) {
        bar = await mountPartyBar({
          store, listId: active.listId, partyId: active.partyId, getProduct: () => extractProduct(), onGone: () => { bar = null; },
        });
      }
    } catch {
      isLive = false;
      paint();
      // Signed out, offline, or the party is gone. The bar and tab stay hidden.
    } finally {
      mounting = false;
    }
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ('cm_active' in changes || 'cm_auth' in changes)) sync().catch(() => {});
  });
  sync().catch(() => {});
}
