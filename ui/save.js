import { h, thumb } from '../lib/dom.js';
import { money } from '../lib/split.js';
import { shareBlock } from './share.js';

// The Pinterest-style card: you are on a product page, pick a list (or make one right here),
// and it is saved. Then you can share that list. Works any time, with or without a live party.
export function createSaveCard({ store, getProduct, installUrl, onClose, onView }) {
  const st = { view: 'pick', user: null, product: null, lists: [], saved: new Set(), picked: null, busy: false, msg: null, err: false };
  const el = h('div', { class: 'cm savecard', role: 'dialog', 'aria-label': 'Save to a list' });
  let nameBox = null;

  const say = (text, err = false) => { st.msg = text; st.err = err; draw(); };
  const run = async (fn) => {
    if (st.busy) return;
    st.busy = true;
    try { await fn(); } catch (e) { say(e?.message || String(e), true); } finally { st.busy = false; }
  };
  const btn = (label, onClick, cls = '') => h('button', { class: `btn ${cls}`.trim(), type: 'button', onClick }, label);
  const copy = async (text, done) => {
    try { await navigator.clipboard.writeText(text); say(done); } catch { say(`Copy this: ${text}`); }
  };

  async function open() {
    st.view = 'pick'; st.msg = null; st.picked = null;
    st.user = await store.getUser();
    st.product = getProduct();
    if (st.user) {
      st.lists = (await store.loadHome()).lists;
      st.saved = new Set(st.product ? await store.savedIn(st.product.url).catch(() => []) : []);
    }
    draw();
  }

  async function saveTo(list) {
    await run(async () => {
      const active = await store.getActive();
      const partyId = active?.listId === list.id ? active.partyId : null;
      try { await store.saveItem(list.id, partyId, st.product); } catch (e) {
        if (!partyId) throw e;
        await store.saveItem(list.id, null, st.product); // that party ended; the list still takes it
      }
      st.saved.add(list.id);
      st.picked = list;
      st.view = 'done';
      st.msg = null;
      draw();
    });
  }

  function showDone(list) { st.picked = list; st.view = 'done'; st.msg = null; draw(); }

  async function createAndSave() {
    const name = nameBox?.value.trim();
    if (!name) return say('Give your list a name.', true);
    let made = null;
    await run(async () => {
      made = await store.createList(name);
      st.lists = (await store.loadHome()).lists;
    });
    if (made) await saveTo(st.lists.find((l) => l.id === made.id) || made);
  }

  const header = (title, back) => h('div', { class: 'row sp' },
    back ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Back', onClick: back }, '←') : null,
    h('b', { class: 'grow0' }, title),
    h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onClick: () => onClose?.() }, '✕'));

  function draw() {
    const prev = nameBox?.value;
    const p = st.product;
    const banner = st.msg ? h('div', { class: `msg ${st.err ? 'err' : ''}`, role: st.err ? 'alert' : 'status' }, st.msg) : null;
    let body;

    if (!st.user) {
      body = [header('Save to a list'), h('div', { class: 'empty' }, h('h3', null, 'Sign in first'), h('p', null, 'Open Cartmates from the tab on the right edge, sign in, and come back to save.'))];
    } else if (st.view === 'share' && st.picked) {
      const list = st.lists.find((l) => l.id === st.picked.id) || st.picked;
      body = [header(`Share ${list.name}`, () => { st.view = 'done'; draw(); }), banner,
        shareBlock({ list, installUrl, canReset: list.role === 'owner', onCopy: copy,
          onReset: () => run(async () => { await store.resetInvite(list.id); st.lists = (await store.loadHome()).lists; say('New code made. The old one no longer works.'); }) })];
    } else if (st.view === 'done' && st.picked) {
      body = [header('Saved'), h('div', { class: 'col center' },
        h('div', { class: 'check-badge' }, '✓'),
        h('h2', null, `Saved to ${st.picked.name}`),
        p ? h('p', { class: 'sub clip2' }, p.title) : null),
        h('div', { class: 'row' }, btn('Share this list', () => { st.view = 'share'; draw(); }, 'primary grow'), btn('View list', () => onView?.(st.picked), 'grow')),
        link('Save to another list', () => { st.view = 'pick'; st.picked = null; draw(); })];
    } else {
      body = [header('Save to a list'), banner,
        p ? h('div', { class: 'row' }, thumb(p, 'mini'), h('span', { class: 'col tight grow0' }, h('span', { class: 'clip2' }, p.title), p.price != null ? h('span', { class: 'price' }, money(p.price, p.currency || st.user.preferred_currency || 'INR')) : h('span', { class: 'sub' }, 'No price found'))) : null,
        st.lists.length ? h('div', { class: 'col' }, st.lists.map((l) => {
          const has = st.saved.has(l.id);
          return h('button', { class: 'card rowcard', type: 'button', disabled: st.busy, 'aria-label': has ? `${l.name}, already saved. Share or view it` : `Save to ${l.name}`, onClick: () => (has ? showDone(l) : saveTo(l)) },
            h('span', { class: 'col tight grow0' }, h('b', { class: 'clip' }, l.name), h('span', { class: 'sub' }, l.role === 'owner' ? 'Your list' : 'Shared with you')),
            has ? h('span', { class: 'pill bought' }, 'Saved') : h('span', { class: 'pill' }, 'Save'));
        })) : h('p', { class: 'sub' }, 'You have no lists yet. Make your first one below.'),
        h('form', { class: 'col', onSubmit: (e) => { e.preventDefault(); createAndSave(); } },
          h('span', { class: 'label' }, 'Or start a new list'),
          h('div', { class: 'row' }, nameBox = h('input', { class: 'field', name: 'listName', placeholder: 'e.g. Goa trip, Kitchen, Gifts', 'aria-label': 'New list name', maxlength: '80', autocomplete: 'off' }),
            h('button', { class: 'btn primary', type: 'submit', disabled: st.busy }, 'Create and save')))];
    }
    el.replaceChildren(h('div', { class: 'body' }, ...body.filter(Boolean)));
    if (prev && nameBox && el.contains(nameBox)) nameBox.value = prev;
  }

  function link(label, onClick) { return h('button', { class: 'link', type: 'button', onClick }, label); }

  return { el, open, refresh: draw, state: st };
}
