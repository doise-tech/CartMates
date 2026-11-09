import { h } from '../lib/dom.js';
import { createApp } from './app.js';
import { createSaveCard } from './save.js';

// The side drawer that sits on every web page: a tab on the right edge that slides out the full
// Cartmates app, can grow to a full-page view, and a Save button on product pages.
// It lives in a shadow root so the shop's own CSS can't touch it (and ours can't touch the shop).

// ui/styles.css is written for a page (:root). Inside a shadow root the same tokens hang off :host.
export function toShadowCss(css) {
  return String(css || '')
    .replace(/:root\[data-theme="dark"\]/g, ':host([data-theme="dark"])')
    .replace(/:root:not\(\[data-theme="light"\]\)/g, ':host(:not([data-theme="light"]))')
    .replace(/:root/g, ':host');
}

const DRAWER_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font: 14px/1.45 var(--body, system-ui, sans-serif); color: var(--ink, #2b231d); }
.root.abs { position: absolute; }
.root > * { pointer-events: auto; }
.dock { position: absolute; right: 0; top: 38%; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.root.open .dock, .root.saving .dock { display: none; }
.edge { display: inline-flex; align-items: center; gap: 10px; writing-mode: vertical-rl; padding: 16px 9px 16px 8px; border: 0; border-radius: 14px 0 0 14px; background: var(--accent, #93643a); color: var(--accent-ink, #fff); font: 600 14px var(--display, Georgia, serif); letter-spacing: 0.08em; cursor: pointer; box-shadow: -3px 6px 18px rgba(43,35,29,.26); transition: padding .15s ease; }
.edge i { width: 14px; height: 14px; background: currentColor; display: inline-block; clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); }
.edge:hover { padding-right: 14px; }
@media (prefers-reduced-motion: reduce) { .edge { transition: none; } }
.pill-save { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px 9px 16px; border: 1px solid var(--line, #e9ddcf); border-right: 0; border-radius: 999px 0 0 999px; background: var(--surface, #fffdf9); color: var(--ink, #2b231d); font: 600 13px var(--body, system-ui, sans-serif); cursor: pointer; box-shadow: -3px 6px 18px rgba(43,35,29,.2); }
.pill-save:hover { border-color: var(--accent, #93643a); color: var(--accent, #93643a); }
.drawer { position: absolute; top: 0; right: 0; height: 100%; width: min(400px, 100%); display: flex; flex-direction: column; background: var(--bg, #faf6f0); border-left: 1px solid var(--line, #e9ddcf); box-shadow: -8px 0 30px rgba(43,35,29,.2); transform: translateX(104%); visibility: hidden; transition: transform .22s ease, width .22s ease, visibility 0s .22s; }
.root.open .drawer { transform: none; visibility: visible; transition: transform .22s ease, width .22s ease; }
.drawer.full { width: 100%; border-left: 0; }
.dhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 6px 14px; background: var(--surface, #fff); border-bottom: 1px solid var(--line, #e9ddcf); }
.dhead b { font: 600 16px var(--display, Georgia, serif); color: var(--ink, #2b231d); letter-spacing: 0.01em; }
.dhead .acts { display: flex; gap: 4px; }
.dhead button, .pop .cm .iconbtn { cursor: pointer; }
.dhead button { padding: 5px 10px; border: 1px solid var(--line, #e9ddcf); border-radius: 10px; background: var(--surface, #fffdf9); color: var(--ink, #2b231d); font: 13px var(--body, system-ui, sans-serif); }
.dhead button:hover { border-color: var(--accent, #93643a); color: var(--accent, #93643a); }
.dhead button:focus-visible, .edge:focus-visible, .pill-save:focus-visible { outline: 2px solid var(--accent, #93643a); outline-offset: 2px; }
.drawer > .cm { flex: 1; width: 100%; min-height: 0; overflow-y: auto; }
.pop { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); width: min(350px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow-y: auto; border-radius: 20px; background: var(--bg, #faf6f0); border: 1px solid var(--line, #e9ddcf); box-shadow: 0 14px 44px rgba(43,35,29,.28); }
.pill-live { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px 9px 14px; border: 0; border-radius: 999px 0 0 999px; background: var(--accent, #93643a); color: var(--accent-ink, #fff); font: 600 13px var(--body, system-ui, sans-serif); cursor: pointer; box-shadow: -3px 6px 18px rgba(43,35,29,.26); }
.pill-live i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; display: inline-block; opacity: .9; }
.pill-live:focus-visible { outline: 2px solid var(--accent, #93643a); outline-offset: 2px; }
.pop[hidden], .pill-save[hidden], .edge[hidden], .pill-live[hidden] { display: none; }
.pop .cm { width: 100%; min-height: 0; }
@media (prefers-reduced-motion: reduce) { .drawer { transition: none; } }
`;

export function mountDrawer({ store, getProduct, css = '', parent = document.documentElement, position = 'fixed', shadowMode = 'closed', installUrl, appOpts = {} }) {
  const host = document.createElement('div');
  host.id = 'cartmates-drawer';
  const shadow = host.attachShadow({ mode: shadowMode });
  shadow.append(h('style', null, toShadowCss(css) + DRAWER_CSS));

  let app = null;
  let full = false;
  let destroyed = false;

  const appRoot = h('div', { class: 'cm' });
  const expandBtn = h('button', { type: 'button', 'aria-pressed': 'false', onClick: () => setFull(!full) }, 'Full view');
  const closeBtn = h('button', { type: 'button', 'aria-label': 'Close Cartmates', onClick: () => close() }, 'Close');
  const drawer = h('aside', { class: 'drawer', 'aria-label': 'Cartmates' },
    h('div', { class: 'dhead' }, h('b', null, 'Cartmates'), h('span', { class: 'acts' }, expandBtn, closeBtn)),
    appRoot);

  const card = createSaveCard({
    store, getProduct, installUrl,
    onClose: () => closeSave(),
    onView: async (list) => { closeSave(); open(); await ensureApp().openList(list.id); ensureApp().go('list', {}, 'root'); },
  });
  const pop = h('div', { class: 'pop', hidden: true }, card.el);

  const saveBtn = h('button', { class: 'pill-save', type: 'button', hidden: true, 'aria-label': 'Save this product to a Cartmates list', onClick: () => openSave() }, 'Save');
  const liveBtn = h('button', { class: 'pill-live', type: 'button', hidden: true, 'aria-label': 'Go live: start a shopping party', onClick: () => goLive() }, h('i'), 'Go live');
  const tab = h('button', { class: 'edge', type: 'button', 'aria-label': 'Open Cartmates', onClick: () => open() }, h('i'), 'Cartmates');
  const root = h('div', { class: `root ${position === 'absolute' ? 'abs' : ''}`.trim() }, h('div', { class: 'dock' }, liveBtn, saveBtn, tab), drawer, pop);
  shadow.append(root);
  parent.append(host);

  function ensureApp() {
    if (!app) app = createApp(appRoot, store, { ...appOpts, installUrl, onSavePage: (listId) => openSave(listId) });
    return app;
  }

  // The "Go live" button: open the drawer straight on the start-a-party screen (if you are signed in).
  async function goLive() {
    open();
    try { if (await store.getUser()) ensureApp().go('startParty', {}, 'root'); } catch { /* the drawer stays on its first screen */ }
  }

  function open() {
    ensureApp();
    closeSave();
    root.classList.add('open');
    // Come back the way you left it: side view or full view.
    Promise.resolve(store.getFlag?.('drawerFull')).then((was) => { if (was && root.classList.contains('open')) setFull(true, false); }).catch(() => {});
    drawer.querySelector('button')?.focus?.({ preventScroll: true });
  }
  function close() {
    root.classList.remove('open');
    setFull(false, false);
  }
  function setFull(next, remember = true) {
    full = next;
    if (remember) store.setFlag?.('drawerFull', next)?.catch?.(() => {});
    drawer.classList.toggle('full', full);
    appRoot.classList.toggle('wide', full);
    expandBtn.textContent = full ? 'Side view' : 'Full view';
    expandBtn.setAttribute('aria-pressed', String(full));
  }
  async function openSave(listId) {
    root.classList.remove('open');
    setFull(false, false);
    root.classList.add('saving');
    pop.hidden = false;
    await card.open(typeof listId === 'string' ? { listId } : {});
    pop.querySelector('input, button')?.focus?.({ preventScroll: true });
  }
  function closeSave() {
    pop.hidden = true;
    root.classList.remove('saving');
  }

  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!pop.hidden) closeSave();
    else if (root.classList.contains('open')) close();
  };
  document.addEventListener('keydown', onKey);

  return {
    host, shadow, root,
    open, close, toggle: () => (root.classList.contains('open') ? close() : open()), openSave, closeSave,
    setFull, isOpen: () => root.classList.contains('open'), isFull: () => full,
    app: ensureApp,
    saveCard: card,
    showSave: (on) => { saveBtn.hidden = !on; },
    showTab: (on) => { const was = !tab.hidden; tab.hidden = !on; if (was && !on) { close(); closeSave(); } },
    showLive: (on) => { liveBtn.hidden = !on; },
    setTheme: (mode) => { if (mode) host.setAttribute('data-theme', mode); else host.removeAttribute('data-theme'); },
    destroy: async () => {
      if (destroyed) return;
      destroyed = true;
      document.removeEventListener('keydown', onKey);
      await app?.destroy();
      host.remove();
    },
  };
}
