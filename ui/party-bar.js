import { h, avatar, ago, thumb, arrow, bubbleIcon } from '../lib/dom.js';
import { money } from '../lib/split.js';

// The bar that sits at the bottom of a shopping page while you are in a live party:
// who is here, chat, and a Save item button. It lives in a shadow root so the shop's
// CSS can't touch it. Colours come from --cm-* variables when the host page sets them
// (the web preview does) and fall back to fixed values everywhere else.

const CSS = `
:host { all: initial;
  --b-bg: var(--cm-surface, #fffdf9); --b-ink: var(--cm-ink, #2b231d); --b-ink2: var(--cm-ink-2, #5a4d42);
  --b-line: var(--cm-line, #e9ddcf); --b-accent: var(--cm-accent, #93643a); --b-accent-ink: var(--cm-accent-ink, #ffffff);
  --b-soft: var(--cm-accent-soft, #f3e8da); --b-live: var(--cm-live, #3e7d4f); --b-danger: var(--cm-danger, #b73a34);
  --b-toast: var(--cm-toast, #2b231d); --b-toast-ink: var(--cm-toast-ink, #fffdf9); }
* { box-sizing: border-box; }
.bar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483647; width: min(580px, calc(100vw - 24px));
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--b-ink); }
.bar.abs { position: absolute; bottom: 12px; width: calc(100% - 24px); max-width: 580px; }
.dock, .panel { background: var(--b-bg); border: 1px solid var(--b-line); border-radius: 18px; box-shadow: 0 10px 32px rgba(43,35,29,.22); }
.dock { display: flex; align-items: center; gap: 10px; padding: 8px 10px; flex-wrap: wrap; }
.name { font: 600 15px Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.live { display: inline-flex; align-items: center; gap: 6px; color: var(--b-ink2); font-size: 12px; white-space: nowrap; }
.live::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--b-live); animation: pulse 2s infinite; }
@keyframes pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .live::before { animation: none; } }
.stack { display: flex; }
.avatar { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 700; flex: none; border: 2px solid var(--b-bg); overflow: hidden; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.stack .avatar + .avatar { margin-left: -6px; }
.avatar.here { box-shadow: 0 0 0 2px var(--b-live); }
.avatar.away { opacity: .45; }
.end { margin-left: auto; display: flex; gap: 8px; align-items: center; }
button { font: inherit; cursor: pointer; border-radius: 10px; border: 1px solid var(--b-accent); background: var(--b-bg); color: var(--b-ink); padding: 6px 11px; position: relative; }
button:hover { background: var(--b-soft); }
button.primary { background: var(--b-accent); border-color: var(--b-accent); color: var(--b-accent-ink); font-weight: 600; }
button.primary:hover { background: var(--b-accent); filter: brightness(1.06); }
button:focus-visible, input:focus-visible { outline: 2px solid var(--b-accent); outline-offset: 2px; }
.badge { position: absolute; top: -7px; right: -7px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9px; background: var(--b-danger); color: #fff; font-size: 10px; line-height: 17px; text-align: center; font-weight: 700; }
.panel { margin-bottom: 8px; overflow: hidden; }
.log { height: 320px; max-height: 55vh; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.msg { max-width: 85%; padding: 6px 11px; border-radius: 14px; background: var(--b-soft); overflow-wrap: anywhere; }
.msg.me { align-self: flex-end; }
.msg small { display: block; color: var(--b-ink2); font-size: 11px; }
.entry-item { align-self: stretch; padding: 10px; border: 1px solid var(--b-line); border-radius: 14px; background: var(--b-bg); display: flex; flex-direction: column; gap: 8px; }
.entry-item small { color: var(--b-ink2); font-size: 11px; }
.crow { display: flex; gap: 10px; align-items: center; min-width: 0; }
.crow .mini { width: 56px; height: 56px; border-radius: 10px; object-fit: contain; background: var(--b-soft); flex: none; }
.crow .tile { width: 56px; height: 56px; border-radius: 10px; flex: none; }
.ctext { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ctitle { font: 600 14px Georgia, "Iowan Old Style", Palatino, serif; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.cacts { display: flex; align-items: center; gap: 8px; }
.votes { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--b-line); border-radius: 999px; padding: 1px 4px; }
button.vote, button.ctoggle { border: 0; background: transparent; padding: 0; color: var(--b-ink2); display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; }
button.vote:hover, button.ctoggle:hover { background: var(--b-soft); color: var(--b-accent); }
button.vote[aria-pressed="true"] { color: var(--b-accent); background: var(--b-soft); }
button.vote.down[aria-pressed="true"] { color: var(--b-danger); background: transparent; }
button.ctoggle { width: auto; padding: 0 9px; gap: 5px; grid-auto-flow: column; font-size: 12px; }
.score { min-width: 18px; text-align: center; font-weight: 600; font-size: 12px; }
.cthread { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--b-line); padding-top: 8px; }
.cthread .c { overflow-wrap: anywhere; }
.cthread form { display: flex; gap: 6px; }
.compose { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--b-line); }
input { flex: 1; min-width: 0; font: inherit; padding: 7px 11px; border: 1px solid var(--b-line); border-radius: 10px; color: var(--b-ink); background: var(--b-bg); }
.toast { width: fit-content; max-width: 100%; margin: 0 auto 8px; padding: 7px 12px; border-radius: 10px; background: var(--b-toast); color: var(--b-toast-ink); }
[hidden] { display: none !important; }
`;

const sameProduct = (a, b) => {
  const norm = (u) => {
    try { const x = new URL(u); return x.origin + x.pathname.replace(/\/$/, ''); } catch { return u; }
  };
  return norm(a) === norm(b);
};

export async function mountPartyBar({ store, listId, partyId, getProduct, parent = document.documentElement, position = 'fixed', shadowMode = 'closed', onGone }) {
  const user = await store.getUser();
  if (!user) return null;
  let ctx = await store.loadContext(listId, partyId);
  if (ctx.party?.status !== 'live') return null;

  const host = document.createElement('div');
  host.id = 'cartmates-root';
  const shadow = host.attachShadow({ mode: shadowMode });
  shadow.append(h('style', null, CSS));

  const st = { open: false, readAt: Date.now(), online: [], known: new Set(ctx.items.map((i) => i.id)), busy: false, drafts: new Map(), threads: new Set() };
  let toastTimer;
  let reloadTimer;
  let unsub = null;
  let gone = false;

  // Built once and updated in place, so typing in the chat box survives live updates.
  const nameEl = h('span', { class: 'name' });
  const liveEl = h('span', { class: 'live' });
  const stackEl = h('span', { class: 'stack' });
  const badge = h('span', { class: 'badge', hidden: true });
  const chatBtn = h('button', { type: 'button', 'aria-expanded': 'false', onClick: () => { st.open = !st.open; if (st.open) st.readAt = Date.now(); update(); if (st.open) input.focus(); } }, 'Chat', badge);
  const saveBtn = h('button', { class: 'primary', type: 'button', onClick: () => save() }, 'Save item');
  const log = h('div', { class: 'log', role: 'log', 'aria-label': 'Party chat' });
  const input = h('input', { type: 'text', placeholder: 'Message your cartmates', 'aria-label': 'Message', maxlength: '1000' });
  const form = h('form', { class: 'compose', onSubmit: (e) => { e.preventDefault(); send(); } }, input, h('button', { class: 'primary', type: 'submit' }, 'Send'));
  const panel = h('div', { class: 'panel', hidden: true }, log, form);
  const toastEl = h('div', { class: 'toast', role: 'status', hidden: true });
  const dock = h('div', { class: 'dock' }, nameEl, liveEl, stackEl, h('span', { class: 'end' }, chatBtn, saveBtn));
  const bar = h('div', { class: `bar ${position === 'absolute' ? 'abs' : ''}`.trim() }, toastEl, panel, dock);
  bar.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.open) { st.open = false; update(); } });
  shadow.append(bar);
  parent.append(host);

  const nameOf = (id) => (id === user.id ? 'You' : ctx.members.find((m) => m.user_id === id)?.profile.display_name || 'Someone');

  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
  }

  const partyItems = () => {
    const since = Date.parse(ctx.party.started_at) - 1500;
    return ctx.items.filter((i) => Date.parse(i.created_at) >= since);
  };
  const timeline = () => [
    ...ctx.messages.map((m) => ({ at: Date.parse(m.created_at), m })),
    ...partyItems().map((i) => ({ at: Date.parse(i.created_at), item: i })),
  ].sort((a, b) => a.at - b.at);

  const voteOf = (i) => { const r = i.reactions.find((x) => x.user_id === user.id); return r ? (r.type === 'down' ? 'down' : 'up') : null; };
  const scoreOf = (i) => i.reactions.reduce((n, r) => n + (r.type === 'down' ? -1 : 1), 0);
  const act = async (fn) => { try { await fn(); await reload(); } catch (e) { toast(`Didn't work. ${e.message}`); } };

  // A saved item shows up in the chat as a card the whole party can vote on and comment on.
  // Votes and comments belong to the item itself, so they are already on the list when the party ends.
  function itemCard(i) {
    const mine = voteOf(i);
    const open = st.threads.has(i.id);
    const comments = i.comments || [];
    const price = i.price_at_save ?? i.product.price;
    const card = h('div', { class: 'entry-item', 'data-item': i.id },
      h('small', null, `${nameOf(i.added_by)} saved this · ${ago(i.created_at)}`),
      h('div', { class: 'crow' }, thumb(i.product, 'mini'), h('div', { class: 'ctext' }, h('span', { class: 'ctitle' }, i.product.title), price != null ? h('small', null, money(price, i.currency_at_save || i.product.currency || 'INR')) : null, i.variant ? h('small', null, i.variant) : null)),
      h('div', { class: 'cacts' },
        h('span', { class: 'votes', role: 'group', 'aria-label': 'Vote' },
          h('button', { class: 'vote up', type: 'button', 'aria-pressed': String(mine === 'up'), 'aria-label': 'Upvote', onClick: () => act(() => store.vote(i.id, 'up')) }, arrow(true, mine === 'up')),
          h('span', { class: 'score' }, String(scoreOf(i))),
          h('button', { class: 'vote down', type: 'button', 'aria-pressed': String(mine === 'down'), 'aria-label': 'Downvote', onClick: () => act(() => store.vote(i.id, 'down')) }, arrow(false, mine === 'down'))),
        h('button', { class: 'ctoggle', type: 'button', 'aria-expanded': String(open), 'aria-label': `${comments.length} comments`, onClick: () => { if (open) st.threads.delete(i.id); else st.threads.add(i.id); update(); } }, bubbleIcon(), String(comments.length))),
      open ? h('div', { class: 'cthread' },
        ...comments.map((c) => h('div', { class: 'c' }, h('b', null, nameOf(c.user_id)), ` ${c.body}`)),
        h('form', { onSubmit: (e) => { e.preventDefault(); const f = e.target.elements.text; const body = f.value.trim(); if (!body) return; f.value = ''; st.drafts.delete(`c:${i.id}`); act(() => store.addComment(i.id, body)); } },
          h('input', { name: 'text', type: 'text', placeholder: 'Comment', 'aria-label': 'Comment', maxlength: '1000', 'data-k': `c:${i.id}` }),
          h('button', { class: 'primary', type: 'submit' }, 'Post'))) : null);
    return card;
  }

  function update() {
    const here = new Set(st.online.length ? st.online : ctx.here.filter((r) => !r.left_at).map((r) => r.user_id));
    here.add(user.id);
    nameEl.textContent = ctx.party.label || ctx.list.name;
    liveEl.textContent = `${here.size} here`;
    const ordered = [...ctx.members].sort((a, b) => Number(here.has(b.user_id)) - Number(here.has(a.user_id)));
    stackEl.replaceChildren(...ordered.slice(0, 5).map((m) => avatar(m.profile, 26, here.has(m.user_id) ? 'here' : 'away')));

    const unread = st.open ? 0 : ctx.messages.filter((m) => m.user_id !== user.id && Date.parse(m.created_at) > st.readAt).length + partyItems().filter((i) => i.added_by !== user.id && Date.parse(i.created_at) > st.readAt).length;
    badge.hidden = !unread;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    chatBtn.setAttribute('aria-expanded', String(st.open));
    panel.hidden = !st.open;

    if (st.open) {
      const nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      for (const el of log.querySelectorAll('input[data-k]')) st.drafts.set(el.dataset.k, el.value);
      const focusKey = shadow.activeElement?.dataset?.k;
      const rows = timeline();
      log.replaceChildren(...(rows.length
        ? rows.map((r) => {
            if (r.item) return itemCard(r.item);
            const m = r.m;
            const item = m.item_id && ctx.items.find((i) => i.id === m.item_id);
            return h('div', { class: `msg ${m.user_id === user.id ? 'me' : ''}`.trim() }, h('small', null, `${nameOf(m.user_id)} · ${ago(m.created_at)}${item ? ` · about ${item.product.title}` : ''}`), m.body);
          })
        : [h('div', { class: 'msg' }, 'No messages yet. Say hi, or save something.')]));
      for (const el of log.querySelectorAll('input[data-k]')) if (st.drafts.has(el.dataset.k)) el.value = st.drafts.get(el.dataset.k);
      if (focusKey) log.querySelector(`input[data-k="${focusKey}"]`)?.focus({ preventScroll: true });
      if (nearEnd || !log.dataset.seen) log.scrollTop = log.scrollHeight;
      log.dataset.seen = '1';
    }
  }

  async function reload() {
    if (gone) return;
    ctx = await store.loadContext(listId, partyId);
    if (ctx.party?.status !== 'live') return finish(`This party ended. Everything is saved in ${ctx.list.name}.`);
    for (const i of ctx.items) {
      if (!st.known.has(i.id) && i.added_by !== user.id) toast(`${nameOf(i.added_by)} saved ${i.product.title.slice(0, 60)}`);
      st.known.add(i.id);
    }
    update();
  }

  async function finish(text) {
    toast(text);
    update();
    setTimeout(() => destroy(), 2600);
    const active = await store.getActive();
    if (active?.partyId === partyId) await store.setActive(null);
    onGone?.();
  }

  async function save() {
    if (st.busy) return;
    const p = getProduct();
    if (!p) return toast('Open a product page to save it');
    if (ctx.items.some((i) => sameProduct(i.product.url, p.url))) return toast('Already on your list');
    st.busy = true;
    try {
      await store.saveItem(listId, partyId, p);
      toast('Saved to your list');
      await reload();
    } catch (e) {
      toast(`Couldn't save. ${e.message}`);
    } finally {
      st.busy = false;
    }
  }

  async function send() {
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      await store.sendMessage(partyId, body);
      await reload();
    } catch (e) {
      input.value = body;
      toast(`Message not sent. ${e.message}`);
    }
  }

  async function destroy() {
    if (gone) return;
    gone = true;
    clearTimeout(toastTimer);
    clearTimeout(reloadTimer);
    if (unsub) await unsub();
    host.remove();
  }

  unsub = await store.subscribe({ listId, partyId }, (ev) => {
    if (ev.kind === 'presence') { st.online = ev.online; update(); return; }
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => reload().catch(() => {}), 150);
  });
  update();

  return { destroy, host, shadow, partyId, listId, reload, toast };
}
