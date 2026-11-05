import { shareBlock } from './share.js';
import { h, safeUrl, avatar, ago, thumb, heart } from '../lib/dom.js';
import { money, total, lineMinor, fromMinor, splitEqual, splitByClaim, settleUp } from '../lib/split.js';

// Every popup screen lives here. The screens talk only to `store`, so the same code runs
// against Supabase in the extension and against the mock store in the web preview.

const IN_CART = ['in_cart', 'claimed', 'bought'];
const STATUS = { saved: 'Saved', in_cart: 'In cart', claimed: 'Claimed', bought: 'Bought' };
const ONBOARDING = ['welcome', 'signin', 'signup', 'permissions'];
const MAIN = ['home', 'party', 'cart'];
const TITLES = {
  newList: 'New list', startParty: 'Start a party', invite: 'Invite friends', join: 'Join with a code', share: 'Share list', joined: "You're in",
  notifications: 'Activity', settings: 'Settings', profile: 'Profile', notifPrefs: 'Notifications', history: 'Past parties',
};
const SLIDES = [
  { title: 'Shop together', body: 'Browse any shop with your friends. See who is online and what they save, live.' },
  { title: 'Save together', body: 'Everything lands in one shared list. Like it, tag it, and talk it over.' },
  { title: 'Buy together', body: 'Put items in the cart, claim what you will buy, and see a fair split.' },
];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

export function createApp(root, store, opts = {}) {
  const S = {
    user: null, route: { name: 'boot' }, stack: [],
    lists: [], history: [],
    active: null, // { listId, partyId } of the party you are in, if any
    listId: null, partyId: null, ctx: null, thread: [], online: [],
    filter: 'all', splitMode: 'equal', splitWith: null,
    slide: 0, msg: null, prefs: { saves: true, chat: true }, seen: null, unsub: null, confirmEnd: false,
  };
  let reloadTimer;

  // ------------------------------------------------------------------ small helpers

  const me = () => S.user?.id;
  const person = (id) => S.ctx?.members.find((m) => m.user_id === id)?.profile || (id === me() ? S.user : { id, display_name: 'Someone' });
  const nm = (id) => (id === me() ? 'You' : person(id).display_name || 'Someone');
  const priceOf = (i) => i.price_at_save ?? i.product?.price ?? null;
  const curOf = (i) => i.currency_at_save || i.product?.currency || S.user?.preferred_currency || 'INR';
  const lineOf = (i) => ({ price: priceOf(i), quantity: i.quantity, claimed_by: i.claimed_by });
  const priceText = (i) => (priceOf(i) == null ? 'No price' : `${i.quantity > 1 ? `${i.quantity} × ` : ''}${money(priceOf(i), curOf(i))}`);
  const listName = () => S.ctx?.list.name || 'List';
  const isOwner = () => S.ctx?.members.some((m) => m.user_id === me() && m.role === 'owner');
  const inParty = () => !!(S.partyId && S.ctx?.party?.status === 'live');
  const hereIds = () => (S.ctx?.here || []).filter((r) => !r.left_at).map((r) => r.user_id);
  const onlineIds = () => (S.online.length ? S.online : hereIds());
  const itemById = (id) => S.ctx?.items.find((i) => i.id === id);
  const btn = (label, onClick, cls = '') => h('button', { class: `btn ${cls}`.trim(), type: 'button', onClick }, label);
  const link = (label, onClick) => h('button', { class: 'link', type: 'button', onClick }, label);

  const say = (text, err = false) => { S.msg = { text, err }; render(); };
  const run = async (fn) => {
    try { await fn(); } catch (e) { say(e?.message || String(e), true); }
  };
  const copy = async (text, done = 'Copied') => {
    try { await navigator.clipboard.writeText(text); say(done); } catch { say(`Copy this: ${text}`); }
  };

  // Inputs keep what you typed when live updates redraw the screen.
  const field = (name, props = {}) => h('input', { class: 'field', name, 'data-k': `${S.route.name}:${name}`, type: 'text', ...props });
  const select = (name, options, value, props = {}) =>
    h('select', { class: 'field', name, 'data-k': `${S.route.name}:${name}`, ...props }, options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));

  function collect() {
    const out = {};
    for (const el of root.querySelectorAll('[data-k]')) out[el.dataset.k] = { v: el.value, focus: el === root.getRootNode().activeElement, s: el.selectionStart };
    return out;
  }
  function restore(keep) {
    for (const [k, st] of Object.entries(keep)) {
      const el = root.querySelector(`[data-k="${k}"]`);
      if (!el) continue;
      if (el.value !== st.v && el.tagName === 'INPUT') el.value = st.v;
      if (st.focus) {
        el.focus();
        try { if (st.s != null) el.setSelectionRange(st.s, st.s); } catch { /* not a text field */ }
      }
    }
  }

  // ------------------------------------------------------------------ navigation

  function go(name, params = {}, mode = 'push') {
    if (mode === 'push') S.stack.push(S.route);
    else if (mode === 'root') S.stack = [];
    S.route = { name, ...params };
    S.msg = null;
    S.confirmEnd = false;
    opts.onRoute?.(S.route);
    render();
    root.scrollTop = 0;
  }
  function back() {
    S.route = S.stack.pop() || { name: 'home' };
    S.msg = null;
    opts.onRoute?.(S.route);
    render();
  }
  async function tab(name) {
    if (name === 'home') await run(refreshHome);
    if (name === 'party' && S.active && !inParty()) await run(() => openList(S.active.listId, S.active.partyId));
    if (name === 'cart' && !S.ctx && S.active) await run(() => openList(S.active.listId, S.active.partyId));
    go(name, {}, 'root');
  }

  // ------------------------------------------------------------------ data

  async function refreshHome() {
    S.lists = (await store.loadHome()).lists;
  }

  async function loadCtx() {
    if (!S.listId) { S.ctx = null; return; }
    S.ctx = await store.loadContext(S.listId, S.partyId);
    if (S.partyId && S.ctx.party && S.ctx.party.status !== 'live') {
      // Someone ended the party. The list stays; the live bar goes away.
      await setActive(null);
      S.partyId = null;
      S.ctx.party = null;
      S.msg = { text: 'The party ended. Your list is still here.', err: false };
      await resubscribe();
    }
    if (S.splitWith) S.splitWith = S.splitWith.filter((id) => S.ctx.members.some((m) => m.user_id === id));
    if (S.route.itemId) S.thread = await store.loadThread(S.route.itemId);
  }

  async function setActive(next) {
    S.active = next;
    await store.setActive(next);
    opts.onActive?.(next);
  }

  async function resubscribe() {
    if (S.unsub) { await S.unsub(); S.unsub = null; }
    if (!S.listId) return;
    S.unsub = await store.subscribe({ listId: S.listId, partyId: S.partyId }, (ev) => {
      if (ev.kind === 'presence') { S.online = ev.online; render(); return; }
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => run(async () => { await loadCtx(); render(); }), 150);
    });
  }

  // Make a list the current one. Pass a partyId to be in that party; omit it to keep any party you are already in.
  async function openList(listId, partyId) {
    S.listId = listId;
    S.partyId = partyId === undefined ? (S.active?.listId === listId ? S.active.partyId : null) : partyId;
    S.filter = 'all';
    S.splitWith = null;
    S.online = [];
    S.seen = await store.getSeen(listId);
    await loadCtx();
    if (S.seen == null) { S.seen = new Date().toISOString(); await store.setSeen(listId, S.seen); }
    await resubscribe();
  }

  async function openItem(id) {
    S.thread = await store.loadThread(id);
    go('item', { itemId: id });
  }

  async function enterParty(party) {
    await store.enterParty(party.id);
    await setActive({ listId: party.list_id, partyId: party.id });
    await openList(party.list_id, party.id);
  }

  async function afterSignIn() {
    S.prefs = await store.getPrefs();
    S.active = await store.getActive();
    opts.onActive?.(S.active);
    await refreshHome();
    if (S.active) {
      try { await openList(S.active.listId, S.active.partyId); } catch { await setActive(null); }
    }
  }

  async function init() {
    S.user = await store.getUser();
    if (!S.user) { S.listId = null; S.ctx = null; S.active = null; opts.onActive?.(null); return go('welcome', {}, 'root'); }
    go('home', {}, 'root');
    await run(afterSignIn);
    render();
  }

  async function signOut() {
    if (S.unsub) { await S.unsub(); S.unsub = null; }
    await store.signOut();
    Object.assign(S, { user: null, ctx: null, listId: null, partyId: null, active: null, lists: [], slide: 0 });
    opts.onActive?.(null);
    go('welcome', {}, 'root');
  }

  // ------------------------------------------------------------------ activity feed

  function events() {
    const c = S.ctx;
    if (!c || !S.user.notifications_enabled) return [];
    const out = [];
    const add = (at, text, route) => out.push({ at, text, route, unread: !S.seen || Date.parse(at) > Date.parse(S.seen) });
    for (const i of c.items) {
      if (i.added_by !== me() && S.prefs.saves) add(i.created_at, `${nm(i.added_by)} saved ${i.product.title}`, { name: 'item', itemId: i.id });
      for (const r of i.reactions) if (r.user_id !== me() && S.prefs.saves) add(r.created_at, `${nm(r.user_id)} liked ${i.product.title}`, { name: 'item', itemId: i.id });
    }
    for (const m of c.messages) if (m.user_id !== me() && S.prefs.chat) add(m.created_at, `${nm(m.user_id)}: ${m.body}`, m.item_id ? { name: 'item', itemId: m.item_id } : { name: 'party' });
    for (const r of c.here) if (r.user_id !== me()) add(r.joined_at, `${nm(r.user_id)} joined the party`, { name: 'party' });
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 30);
  }
  const unreadCount = () => events().filter((e) => e.unread).length;

  // ------------------------------------------------------------------ chrome

  function header() {
    const r = S.route.name;
    if (r === 'boot') return null;
    if (ONBOARDING.includes(r)) {
      const canBack = r === 'signin' || r === 'signup';
      return h('div', { class: 'top' }, canBack ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Back', onClick: back }, '←') : null, h('span', { class: 'brand' }, h('i'), 'cartmates'));
    }
    if (MAIN.includes(r)) {
      const n = unreadCount();
      return h('div', { class: 'top' },
        h('span', { class: 'brand' }, h('i'), 'cartmates'),
        h('span', { class: 'row' },
          h('button', { class: 'iconbtn bell', type: 'button', 'aria-label': n ? `Activity, ${n} new` : 'Activity', onClick: () => go('notifications') }, 'Activity', n ? h('span', { class: 'badge' }, n > 9 ? '9+' : n) : null),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Settings', onClick: () => go('settings') }, 'Settings')));
    }
    const title = r === 'list' ? listName() : r === 'item' ? 'Item' : TITLES[r] || '';
    return h('div', { class: 'top' }, h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Back', onClick: back }, '←'), h('span', { class: 'title' }, title));
  }

  function tabs() {
    if (!MAIN.includes(S.route.name)) return null;
    return h('div', { class: 'tabs', role: 'tablist' },
      [['home', 'Lists'], ['party', 'Party'], ['cart', 'Cart']].map(([key, label]) =>
        h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(S.route.name === key), onClick: () => tab(key) }, label, key === 'party' && inParty() ? h('i', { class: 'live-dot' }) : null)));
  }

  const banner = () => (S.msg ? h('div', { class: 'body flush' }, h('div', { class: `msg ${S.msg.err ? 'err' : ''}`, role: S.msg.err ? 'alert' : 'status' }, S.msg.text)) : null);

  // ------------------------------------------------------------------ onboarding

  function welcome() {
    const slide = SLIDES[S.slide];
    const last = S.slide === SLIDES.length - 1;
    const art = [
      h('div', { class: 'art' }, h('div', { class: 'stack' }, ['Priya', 'Arjun', 'Asha'].map((n, i) => avatar({ id: `x${i}`, display_name: n }, 38, i < 2 ? 'here' : ''))), h('span', { class: 'pill live' }, '3 here')),
      h('div', { class: 'art' }, h('div', { class: 'mini-grid' }, ['bottle', 'planter', 'tin', 'napkin'].map((s) => h('div', { class: `tile ${s}`, style: 'background:var(--accent-soft)' })))),
      h('div', { class: 'art' }, h('div', { class: 'mini-rows' }, [['Asha', '1,782'], ['Priya', '1,782'], ['Arjun', '1,782']].map(([n, a]) => h('div', { class: 'share' }, h('span', null, n), h('span', null, `₹${a}`))))),
    ][S.slide];
    return h('div', { class: 'body welcome' },
      art,
      h('div', { class: 'col' }, h('h2', null, slide.title), h('p', { class: 'lede' }, slide.body)),
      h('div', { class: 'dots', role: 'presentation' }, SLIDES.map((_, i) => h('i', { class: i === S.slide ? 'on' : '' }))),
      h('div', { class: 'col' },
        last ? btn('Get started', () => go('signup'), 'primary') : btn('Next', () => { S.slide += 1; render(); }, 'primary'),
        last ? link('I already have an account', () => go('signin')) : link('Skip', () => go('signup'))));
  }

  function authForm(signup) {
    const submit = (e) => {
      e.preventDefault();
      const f = e.target.elements;
      run(async () => {
        const email = f.email.value.trim();
        const result = signup ? await store.signUp(email, f.password.value, f.name.value.trim()) : await store.signIn(email, f.password.value);
        if (!result.user) return say('Check your email to confirm your account, then sign in.');
        S.user = result.user;
        await afterSignIn();
        if (signup) return go('permissions', {}, 'root');
        await store.setFlag('onboarded', true);
        go('home', {}, 'root');
      });
    };
    return h('form', { class: 'body', onSubmit: submit },
      h('div', null, h('h2', null, signup ? 'Create your account' : 'Welcome back'), h('p', { class: 'sub' }, signup ? 'It takes a minute. Friends will see the name you pick.' : 'Sign in to pick up where you left off.')),
      signup ? field('name', { placeholder: 'Priya', 'aria-label': 'Your name', autocomplete: 'nickname', maxlength: 60 }) : null,
      field('email', { type: 'email', placeholder: 'name@company.com', 'aria-label': 'Email', autocomplete: 'email' }),
      field('password', { type: 'password', placeholder: 'At least 6 characters', 'aria-label': 'Password', autocomplete: signup ? 'new-password' : 'current-password' }),
      h('button', { class: 'btn primary', type: 'submit' }, signup ? 'Create account' : 'Sign in'),
      link(signup ? 'I already have an account' : 'Create an account', () => go(signup ? 'signin' : 'signup', {}, 'replace')));
  }

  function permissions() {
    const toggle = (key, label, hint) =>
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!S.prefs[key], onChange: (e) => { S.prefs[key] = e.target.checked; } }), h('span', null, h('b', null, label), h('small', null, hint)));
    return h('div', { class: 'body' },
      h('div', null, h('h2', null, 'Before you start'), h('p', { class: 'sub' }, 'Two things worth knowing.')),
      h('div', { class: 'card col' }, h('b', null, 'Where the bar shows up'), h('p', { class: 'sub' }, 'Cartmates adds its bar to shopping pages only while you are in a live party. It reads the product name, price, and picture from a page when you save it, and nothing else.')),
      h('div', { class: 'card col' }, h('b', null, 'What to tell you about'), toggle('saves', 'Saves and likes', 'When a friend saves an item or likes one'), toggle('chat', 'Chat', 'When a friend sends a message')),
      btn('Continue', () => run(async () => { await store.setPrefs(S.prefs); await store.setFlag('onboarded', true); go('home', {}, 'root'); }), 'primary'));
  }

  // ------------------------------------------------------------------ lists

  function home() {
    const live = S.lists.filter((l) => l.live);
    return h('div', { class: 'body' },
      opts.onSavePage ? h('div', { class: 'card row sp' }, h('span', { class: 'col tight grow0' }, h('b', null, 'Save this page'), h('span', { class: 'sub' }, 'Add what you are looking at to a list.')), btn('Save', () => opts.onSavePage(), 'small primary')) : null,
      h('div', { class: 'row' }, btn('New list', () => go('newList'), 'primary grow'), btn('Join with a code', () => go('join'), 'grow')),
      live.length ? h('div', { class: 'col' }, h('span', { class: 'label' }, 'Live now'),
        live.map((l) => h('div', { class: 'card live col' },
          h('div', { class: 'row sp' }, h('b', null, l.live.label || l.name), h('span', { class: 'pill live' }, 'live')),
          h('span', { class: 'sub' }, `On ${l.name}`),
          btn(S.active?.partyId === l.live.id ? 'Back to the party' : 'Join in', () => run(async () => { await enterParty(l.live); go('party', {}, 'root'); }), 'small primary')))) : null,
      h('div', { class: 'col' },
        h('span', { class: 'label' }, 'Your lists'),
        S.lists.length
          ? S.lists.map((l) => h('button', { class: 'card rowcard', type: 'button', onClick: () => run(async () => { await openList(l.id); go('list'); }) },
              h('span', { class: 'col tight' }, h('b', null, l.name), h('span', { class: 'sub' }, l.role === 'owner' ? 'You own this list' : 'Shared with you')),
              l.live ? h('span', { class: 'pill live' }, 'live') : h('span', { class: 'chev' }, '›')))
          : h('div', { class: 'empty' }, h('h3', null, 'Start your first list'), h('p', null, 'A list is where everything you and your friends save ends up.'))));
  }

  function shareScreen() {
    const c = S.ctx;
    if (!c) return h('div', { class: 'body' }, btn('Back to lists', () => go('home', {}, 'root')));
    return h('div', { class: 'body' }, shareBlock({
      list: c.list, installUrl: opts.installUrl, canReset: isOwner(), onCopy: (t, done) => copy(t, done),
      onReset: () => run(async () => { await store.resetInvite(c.list.id); await loadCtx(); say('New code made. The old one no longer works.'); }),
    }));
  }

  function newList() {
    return h('form', { class: 'body', onSubmit: (e) => { e.preventDefault(); run(async () => {
      const list = await store.createList(e.target.elements.name.value);
      await refreshHome();
      await openList(list.id);
      go('list', {}, 'replace');
    }); } },
      h('p', { class: 'sub' }, 'Give it a name your friends will recognise, like a room, a trip, or an occasion.'),
      field('name', { placeholder: 'Housewarming', 'aria-label': 'List name', maxlength: 80 }),
      h('button', { class: 'btn primary', type: 'submit' }, 'Create list'));
  }

  function likeButton(i) {
    const mine = i.reactions.some((r) => r.user_id === me());
    return h('button', { class: 'like', type: 'button', 'aria-pressed': String(mine), 'aria-label': `${mine ? 'Unlike' : 'Like'} ${i.product.title}`, onClick: () => run(async () => { await store.toggleReaction(i.id); await loadCtx(); render(); }) }, heart(mine), String(i.reactions.length));
  }

  function listScreen() {
    const c = S.ctx;
    if (!c) return h('div', { class: 'body' }, h('div', { class: 'empty' }, h('h3', null, 'List unavailable'), btn('Back to lists', () => go('home', {}, 'root'))));
    const tagName = (id) => c.tags.find((t) => t.id === id)?.name;
    const shown = c.items.filter((i) => S.filter === 'all' || (S.filter === 'cart' ? IN_CART.includes(i.status) : i.tag_ids.includes(S.filter)));
    const partyCard = inParty()
      ? h('div', { class: 'card live col' }, h('div', { class: 'row sp' }, h('b', null, c.party.label || 'Live party'), h('span', { class: 'pill live' }, `${onlineIds().length || 1} here`)), btn('Open party', () => tab('party'), 'small primary'))
      : c.liveParty
        ? h('div', { class: 'card live col' }, h('div', { class: 'row sp' }, h('b', null, c.liveParty.label || 'A party is live'), h('span', { class: 'pill live' }, 'live')), btn('Join in', () => run(async () => { await enterParty(c.liveParty); go('party', {}, 'root'); }), 'small primary'))
        : h('div', { class: 'card row sp' }, h('span', { class: 'col tight' }, h('b', null, 'Shop together'), h('span', { class: 'sub' }, 'Start a party and browse with friends.')), btn('Start a party', () => go('startParty'), 'small primary'));
    return h('div', { class: 'body' },
      partyCard,
      h('div', { class: 'card row sp' }, h('span', { class: 'col tight grow0' }, h('b', null, `${c.members.length} ${c.members.length === 1 ? 'person' : 'people'} on this list`), h('span', { class: 'sub' }, 'Invite friends with a code.')), btn('Share list', () => go('share'), 'small primary')),
      h('div', { class: 'chips' }, [['all', 'All'], ...c.tags.map((t) => [t.id, t.name]), ['cart', 'In cart']].map(([key, label]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(S.filter === key), onClick: () => { S.filter = key; render(); } }, label))),
      shown.length
        ? h('div', { class: 'grid' }, shown.map((i) => h('div', { class: 'item' },
            h('button', { class: 'plain', type: 'button', 'aria-label': `Open ${i.product.title}`, onClick: () => run(() => openItem(i.id)) }, thumb(i.product), h('span', { class: 't' }, i.product.title)),
            h('div', { class: 'row sp' }, h('span', { class: 'price' }, priceText(i)), likeButton(i)),
            h('div', { class: 'row sp' }, h('span', { class: 'sub' }, nm(i.added_by)), i.status !== 'saved' ? h('span', { class: `pill ${i.status}` }, STATUS[i.status]) : null),
            i.tag_ids.length ? h('div', { class: 'tags' }, i.tag_ids.map((t) => tagName(t) && h('span', { class: 'tag' }, tagName(t)))) : null)))
        : h('div', { class: 'empty' }, h('h3', null, c.items.length ? 'Nothing here' : 'Nothing saved yet'), h('p', null, c.items.length ? 'Try a different filter.' : 'Start a party, open a shop, and press Save item in the Cartmates bar.')),
      h('div', { class: 'col' },
        h('span', { class: 'label' }, `People (${c.members.length})`),
        h('div', { class: 'card col' }, c.members.map((m) => h('div', { class: 'share' },
          h('span', { class: 'row' }, avatar(m.profile, 26), h('span', null, nm(m.user_id)), m.role === 'owner' ? h('span', { class: 'pill' }, 'Owner') : null),
          m.user_id === me() ? link('Leave', () => run(async () => { await store.removeMember(c.list.id, me()); await refreshHome(); S.ctx = null; S.listId = null; go('home', {}, 'root'); }))
            : isOwner() ? link('Remove', () => run(async () => { await store.removeMember(c.list.id, m.user_id); await loadCtx(); render(); })) : null)))));
  }

  // ------------------------------------------------------------------ item

  function itemActions(i) {
    const set = (status) => run(async () => { await store.setItemStatus(i.id, status); await loadCtx(); render(); });
    const mine = i.claimed_by === me();
    if (i.status === 'saved') return [btn('Add to cart', () => set('in_cart'), 'small primary')];
    if (i.status === 'in_cart') return [btn("I'll buy this", () => set('claimed'), 'small primary'), btn('Take out of cart', () => set('saved'), 'small')];
    if (i.status === 'claimed') return mine ? [btn('Mark as bought', () => set('bought'), 'small primary'), btn('Release', () => set('in_cart'), 'small')] : [h('span', { class: 'sub' }, `${nm(i.claimed_by)} will buy this`)];
    return mine ? [h('span', { class: 'sub' }, 'You bought this'), btn('Undo', () => set('claimed'), 'small')] : [h('span', { class: 'sub' }, `Bought by ${nm(i.claimed_by)}`)];
  }

  function itemScreen() {
    const i = itemById(S.route.itemId);
    if (!i) return h('div', { class: 'body' }, h('div', { class: 'empty' }, h('h3', null, 'This item was removed'), btn('Back', back)));
    const c = S.ctx;
    const href = safeUrl(i.product.url);
    const likers = i.reactions.map((r) => nm(r.user_id));
    const canPost = inParty();
    const post = (e) => {
      e.preventDefault();
      const input = e.target.elements.text;
      const body = input.value.trim();
      if (!body) return;
      input.value = '';
      run(async () => { await store.sendMessage(S.partyId, body, i.id); await loadCtx(); render(); });
    };
    const addTag = (e) => {
      e.preventDefault();
      const input = e.target.elements.tag;
      const name = input.value.trim();
      if (!name) return;
      input.value = '';
      run(async () => {
        const have = c.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
        const tag = have || (await store.addTag(c.list.id, name));
        if (!i.tag_ids.includes(tag.id)) await store.setItemTag(c.list.id, i.id, tag.id, true);
        await loadCtx();
        render();
      });
    };
    return h('div', { class: 'body' },
      thumb(i.product, 'hero-thumb'),
      h('div', { class: 'col tight' },
        h('h2', null, i.product.title),
        h('div', { class: 'row sp' }, h('span', { class: 'price big' }, priceText(i)), h('span', { class: `pill ${i.status}` }, STATUS[i.status])),
        h('span', { class: 'sub' }, `Saved by ${nm(i.added_by)} ${ago(i.created_at)}${i.product.brand ? ` · ${i.product.brand}` : ''}`),
        href ? h('a', { class: 'out', href, target: '_blank', rel: 'noopener noreferrer' }, `Open at ${i.product.store_domain || 'the shop'}`) : null),
      h('div', { class: 'card col' }, h('span', { class: 'label' }, 'Buying'), h('div', { class: 'row wrap' }, itemActions(i))),
      h('div', { class: 'row' }, likeButton(i), h('span', { class: 'sub' }, likers.length ? `${likers.join(', ')} liked this` : 'Be the first to like this')),
      h('div', { class: 'col' },
        h('span', { class: 'label' }, 'Tags'),
        h('div', { class: 'chips' }, c.tags.map((t) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(i.tag_ids.includes(t.id)), onClick: () => run(async () => { await store.setItemTag(c.list.id, i.id, t.id, !i.tag_ids.includes(t.id)); await loadCtx(); render(); }) }, t.name))),
        h('form', { class: 'row', onSubmit: addTag }, field('tag', { placeholder: 'New tag', 'aria-label': 'New tag', maxlength: 40 }), h('button', { class: 'btn', type: 'submit' }, 'Add'))),
      h('div', { class: 'col' },
        h('span', { class: 'label' }, 'Talk it over'),
        S.thread.length ? h('div', { class: 'thread' }, S.thread.map((m) => h('div', { class: `bubble ${m.user_id === me() ? 'mine' : ''}` }, h('small', null, `${nm(m.user_id)} · ${ago(m.created_at)}`), m.body)))
          : h('p', { class: 'sub' }, 'No messages about this item yet.'),
        canPost
          ? h('form', { class: 'row', onSubmit: post }, field('text', { placeholder: 'Say something about this', 'aria-label': 'Message', maxlength: 1000 }), h('button', { class: 'btn primary', type: 'submit' }, 'Post'))
          : h('p', { class: 'sub' }, 'Chat opens while a party is live.')),
      i.added_by === me() || isOwner() ? btn('Remove from list', () => run(async () => { await store.removeItem(i.id); await loadCtx(); back(); }), 'danger small') : null);
  }

  // ------------------------------------------------------------------ parties

  function partyMessage() {
    const p = S.ctx.party;
    return `Join my Cartmates party "${p.label || listName()}": install the Cartmates extension, choose Join with a code, and enter ${p.invite_code}.`;
  }

  function startParty() {
    const pick = S.lists.filter((l) => !l.live);
    if (!pick.length) return h('div', { class: 'body' }, h('div', { class: 'empty' }, h('h3', null, S.lists.length ? 'Every list already has a party' : 'You need a list first'), h('p', null, S.lists.length ? 'Join the live party from your lists.' : 'Parties shop for a list.'), btn(S.lists.length ? 'Back to lists' : 'New list', () => (S.lists.length ? go('home', {}, 'root') : go('newList', {}, 'replace')), 'primary')));
    const start = (e) => {
      e.preventDefault();
      const f = e.target.elements;
      run(async () => {
        const list = S.lists.find((l) => l.id === f.list.value);
        const party = await store.startParty(list.id, f.label.value.trim() || `${list.name} party`);
        await setActive({ listId: list.id, partyId: party.id });
        await openList(list.id, party.id);
        await refreshHome();
        go('invite', {}, 'replace');
      });
    };
    return h('form', { class: 'body', onSubmit: start },
      h('p', { class: 'sub' }, 'A party is a live session. Friends who join can chat and see what you save.'),
      h('span', { class: 'label' }, 'Shopping for'),
      select('list', pick.map((l) => [l.id, l.name]), pick.find((l) => l.id === S.listId)?.id || pick[0].id, { 'aria-label': 'List' }),
      h('span', { class: 'label' }, 'Party name'),
      field('label', { placeholder: 'Saturday shop', 'aria-label': 'Party name', maxlength: 80 }),
      h('button', { class: 'btn primary', type: 'submit' }, 'Start party'));
  }

  function invite() {
    const c = S.ctx;
    if (!inParty()) return h('div', { class: 'body' }, h('div', { class: 'empty' }, h('h3', null, 'No live party'), btn('Start a party', () => go('startParty', {}, 'replace'), 'primary')));
    const text = partyMessage();
    const here = new Set(onlineIds());
    return h('div', { class: 'body' },
      h('div', { class: 'card col center' }, h('span', { class: 'label' }, 'Invite code'), h('span', { class: 'bigcode' }, c.party.invite_code), btn('Copy code', () => copy(c.party.invite_code, 'Invite code copied'), 'small')),
      h('div', { class: 'row' }, btn('Copy invite message', () => copy(text, 'Message copied'), 'grow'), h('a', { class: 'btn grow center', href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp')),
      h('div', { class: 'col' }, h('span', { class: 'label' }, `In the party (${c.members.length})`),
        h('div', { class: 'card col' }, c.members.map((m) => h('div', { class: 'share' }, h('span', { class: 'row' }, avatar(m.profile, 26, here.has(m.user_id) ? 'here' : ''), nm(m.user_id)), here.has(m.user_id) ? h('span', { class: 'pill live' }, 'here') : h('span', { class: 'sub' }, 'away'))))),
      btn('Go live and start browsing', () => go('party', {}, 'root'), 'primary'));
  }

  function join() {
    return h('form', { class: 'body', onSubmit: (e) => { e.preventDefault(); run(async () => {
      const r = await store.join(e.target.elements.code.value);
      if (r.kind === 'party') {
        await setActive({ listId: r.party.list_id, partyId: r.party.id });
        await openList(r.party.list_id, r.party.id);
      } else {
        await openList(r.list.id, null);
      }
      await refreshHome();
      go('joined', {}, 'replace');
    }); } },
      h('p', { class: 'sub' }, 'Ask your friend for the invite code. It can be for a list or for a live party.'),
      field('code', { placeholder: 'k7m2x9qa41', 'aria-label': 'Invite code', autocomplete: 'off', spellcheck: 'false' }),
      opts.hint ? h('p', { class: 'hint' }, opts.hint) : null,
      h('button', { class: 'btn primary', type: 'submit' }, 'Join'));
  }

  function joined() {
    const c = S.ctx;
    if (!c) return h('div', { class: 'body' }, btn('Back to lists', () => go('home', {}, 'root')));
    return h('div', { class: 'body center' },
      h('div', { class: 'check-badge' }, '✓'),
      h('div', { class: 'col tight' }, h('h2', null, `You joined ${c.party?.label || c.list.name}`), h('p', { class: 'sub' }, `Everything you save lands in ${c.list.name}.`)),
      h('div', { class: 'stack center' }, c.members.map((m) => avatar(m.profile, 34, onlineIds().includes(m.user_id) ? 'here' : ''))),
      inParty() ? btn('Start browsing', () => go('party', {}, 'root'), 'primary') : btn('Open the list', () => go('list', {}, 'root'), 'primary'));
  }

  function partyScreen() {
    const c = S.ctx;
    if (!inParty()) {
      const live = S.lists.filter((l) => l.live);
      return h('div', { class: 'body' },
        h('div', { class: 'empty' }, h('h3', null, 'No live party'), h('p', null, 'Start one for a list, or join a friend with their code.')),
        h('div', { class: 'row' }, btn('Start a party', () => go('startParty'), 'primary grow'), btn('Join with a code', () => go('join'), 'grow')),
        live.length ? h('div', { class: 'col' }, h('span', { class: 'label' }, 'Live on your lists'), live.map((l) => h('div', { class: 'card row sp' }, h('span', { class: 'col tight' }, h('b', null, l.live.label || l.name), h('span', { class: 'sub' }, l.name)), btn('Join in', () => run(async () => { await enterParty(l.live); go('party', {}, 'root'); }), 'small primary')))) : null);
    }
    const here = new Set(onlineIds());
    const saved = c.items.length;
    const inCart = c.items.filter((i) => IN_CART.includes(i.status)).length;
    const host = c.party.host_id === me();
    return h('div', { class: 'body' },
      h('div', { class: 'card col' },
        h('div', { class: 'row sp' }, h('b', { class: 'big' }, c.party.label || c.list.name), h('span', { class: 'pill live' }, 'live')),
        h('span', { class: 'sub' }, `Shopping for ${c.list.name} · started ${ago(c.party.started_at)}`),
        h('div', { class: 'stats' }, [[here.size || 1, 'here'], [saved, 'saved'], [inCart, 'in cart']].map(([n, l]) => h('div', { class: 'stat' }, h('b', null, n), h('span', null, l))))),
      h('p', { class: 'sub' }, 'Open any shop. The Cartmates bar at the bottom of the page lets you save what you find and chat with everyone here.'),
      h('div', { class: 'row' }, btn('Open the list', () => go('list'), 'grow'), btn('Invite friends', () => go('invite'), 'grow')),
      h('div', { class: 'col' }, h('span', { class: 'label' }, 'In this party'),
        h('div', { class: 'card col' }, c.members.map((m) => h('div', { class: 'share' }, h('span', { class: 'row' }, avatar(m.profile, 26, here.has(m.user_id) ? 'here' : ''), nm(m.user_id), m.user_id === c.party.host_id ? h('span', { class: 'pill' }, 'Host') : null), here.has(m.user_id) ? h('span', { class: 'pill live' }, 'here') : h('span', { class: 'sub' }, 'away'))))),
      h('div', { class: 'row' },
        btn('Leave party', () => run(async () => { await store.leaveParty(S.partyId); await setActive(null); S.partyId = null; await openList(c.list.id, null); go('home', {}, 'root'); })),
        host ? (S.confirmEnd
          ? btn('Tap again to end for everyone', () => run(async () => { await store.endParty(S.partyId); await setActive(null); S.partyId = null; await openList(c.list.id, null); await refreshHome(); go('list', {}, 'root'); }), 'danger')
          : btn('End party', () => { S.confirmEnd = true; render(); }, 'danger')) : null));
  }

  // ------------------------------------------------------------------ cart, split and checkout

  function cartScreen() {
    const c = S.ctx;
    if (!c) return h('div', { class: 'body' }, h('div', { class: 'empty' }, h('h3', null, 'Open a list first'), h('p', null, 'The cart belongs to a list.'), btn('Go to lists', () => go('home', {}, 'root'), 'primary')));
    const items = c.items.filter((i) => IN_CART.includes(i.status));
    if (!items.length) return h('div', { class: 'body' }, h('div', { class: 'empty' }, h('h3', null, 'Your cart is empty'), h('p', null, `Open ${c.list.name} and add what you want to buy.`), btn('Open the list', () => go('list'), 'primary')));

    const cur = curOf(items[0]);
    const counted = items.filter((i) => curOf(i) === cur);
    const sum = total(counted.map(lineOf));
    const everyone = c.members.map((m) => m.user_id);
    const ids = S.splitWith || everyone;
    let shares;
    let unclaimed = 0;
    let moves = [];
    if (S.splitMode === 'equal') {
      shares = splitEqual(sum, ids);
      const paidMinor = {};
      for (const i of counted) if (i.status === 'bought' && i.claimed_by) paidMinor[i.claimed_by] = (paidMinor[i.claimed_by] || 0) + lineMinor(lineOf(i));
      const paid = Object.fromEntries(Object.entries(paidMinor).map(([id, m]) => [id, fromMinor(m)]));
      for (const id of Object.keys(paid)) shares[id] = shares[id] ?? 0;
      if (Object.keys(paid).length) moves = settleUp(shares, paid);
    } else {
      ({ shares, unclaimed } = splitByClaim(counted.map(lineOf), ids));
    }
    const toBuy = items.filter((i) => i.status !== 'bought');
    const stores = [...new Set(toBuy.map((i) => i.product.store_domain || 'Other'))];

    return h('div', { class: 'body' },
      h('p', { class: 'sub' }, `${items.length} ${items.length === 1 ? 'item' : 'items'} in the cart for ${c.list.name}.`),
      h('div', { class: 'card col' }, items.map((i) => h('div', { class: 'cartrow' },
        thumb(i.product, 'mini'),
        h('div', { class: 'col tight grow0' }, h('button', { class: 'plain left', type: 'button', onClick: () => run(() => openItem(i.id)) }, h('b', null, i.product.title)), h('span', { class: 'sub' }, priceText(i)), h('div', { class: 'row wrap' }, itemActions(i))),
        h('span', { class: `pill ${i.status}` }, STATUS[i.status])))),

      h('div', { class: 'col' },
        h('span', { class: 'label' }, 'Split between'),
        h('div', { class: 'chips' }, c.members.map((m) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(ids.includes(m.user_id)), onClick: () => { const next = ids.includes(m.user_id) ? ids.filter((x) => x !== m.user_id) : [...ids, m.user_id]; S.splitWith = next.length ? next : ids; render(); } }, nm(m.user_id)))),
        h('div', { class: 'chips' }, [['equal', 'Equal'], ['claim', 'By who buys']].map(([key, label]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(S.splitMode === key), onClick: () => { S.splitMode = key; render(); } }, label))),
        h('div', { class: 'card col' },
          Object.keys(shares).map((id) => h('div', { class: 'share' }, h('span', { class: 'row' }, avatar(person(id), 24), nm(id)), h('span', { class: 'amt' }, money(shares[id], cur)))),
          unclaimed ? h('div', { class: 'share' }, h('span', { class: 'sub' }, 'Not claimed yet'), h('span', { class: 'amt' }, money(unclaimed, cur))) : null,
          h('div', { class: 'totalrow' }, h('span', null, 'Cart total'), h('span', { class: 'amt' }, money(sum, cur)))),
        counted.length < items.length ? h('p', { class: 'sub' }, `${items.length - counted.length} item in another currency is not counted.`) : null),

      moves.length ? h('div', { class: 'col' }, h('span', { class: 'label' }, 'To even things out'), h('div', { class: 'card col' }, moves.map((m) => h('div', { class: 'share' }, h('span', null, `${nm(m.from)} pays ${nm(m.to)}`), h('span', { class: 'amt' }, money(m.amount, cur)))))) : null,

      toBuy.length ? h('div', { class: 'col' }, h('span', { class: 'label' }, 'Check out at'),
        stores.map((s) => {
          const mine = toBuy.filter((i) => (i.product.store_domain || 'Other') === s);
          return h('div', { class: 'card col' }, h('div', { class: 'row sp' }, h('b', null, s), h('span', { class: 'sub' }, `${mine.length} ${mine.length === 1 ? 'item' : 'items'}`)),
            mine.map((i) => { const href = safeUrl(i.product.url); return h('div', { class: 'share' }, h('span', { class: 'clip' }, i.product.title), href ? h('a', { class: 'out', href, target: '_blank', rel: 'noopener noreferrer' }, 'Open') : null); }));
        })) : null,
      h('p', { class: 'note' }, 'Cartmates only works out the numbers. Pay each shop at checkout and settle up with friends your own way.'));
  }

  // ------------------------------------------------------------------ activity and settings

  function notifications() {
    const list = events();
    return h('div', { class: 'body' },
      list.length ? h('div', { class: 'card col' }, list.map((e) => h('button', { class: `event ${e.unread ? 'new' : ''}`, type: 'button', onClick: () => (e.route.name === 'item' && itemById(e.route.itemId) ? run(() => openItem(e.route.itemId)) : tab('party')) },
        h('span', { class: 'clip2' }, e.text), h('span', { class: 'sub' }, ago(e.at)))))
        : h('div', { class: 'empty' }, h('h3', null, "You're all caught up"), h('p', null, S.user.notifications_enabled ? 'Saves, likes, and chat from your friends show up here.' : 'Notifications are off. Turn them on in Settings.')),
      list.some((e) => e.unread) ? btn('Mark all as read', () => run(async () => { S.seen = new Date().toISOString(); await store.setSeen(S.listId, S.seen); render(); }), 'small') : null,
      S.ctx ? h('p', { class: 'sub' }, `Showing activity for ${S.ctx.list.name}.`) : null);
  }

  function settings() {
    const row = (label, hint, onClick) => h('button', { class: 'card rowcard', type: 'button', onClick }, h('span', { class: 'col tight' }, h('b', null, label), hint ? h('span', { class: 'sub' }, hint) : null), h('span', { class: 'chev' }, '›'));
    return h('div', { class: 'body' },
      h('div', { class: 'row' }, avatar(S.user, 40), h('span', { class: 'col tight' }, h('b', null, S.user.display_name), h('span', { class: 'sub' }, S.user.email || ''))),
      row('Profile', 'Name and currency', () => go('profile')),
      row('Notifications', S.user.notifications_enabled ? 'On' : 'Off', () => go('notifPrefs')),
      row('Past parties', 'Parties that have ended', () => run(async () => { S.history = await store.loadHistory(); go('history'); })),
      btn('Sign out', () => run(signOut), 'small'));
  }

  function profile() {
    return h('form', { class: 'body', onSubmit: (e) => { e.preventDefault(); const f = e.target.elements; run(async () => {
      const name = f.name.value.trim();
      if (!name) throw new Error('Enter the name your friends will see.');
      S.user = await store.updateProfile({ display_name: name, preferred_currency: f.currency.value });
      if (S.listId) await loadCtx();
      say('Saved');
    }); } },
      h('span', { class: 'label' }, 'Your name'),
      field('name', { value: S.user.display_name, 'aria-label': 'Your name', maxlength: 60 }),
      h('span', { class: 'label' }, 'Currency for prices without one'),
      select('currency', CURRENCIES.map((c) => [c, c]), S.user.preferred_currency, { 'aria-label': 'Currency' }),
      h('button', { class: 'btn primary', type: 'submit' }, 'Save'));
  }

  function notifPrefs() {
    const row = (label, hint, checked, onChange) => h('label', { class: 'check card' }, h('input', { type: 'checkbox', checked, onChange }), h('span', null, h('b', null, label), h('small', null, hint)));
    const savePrefs = () => run(async () => { await store.setPrefs(S.prefs); say('Saved'); });
    return h('div', { class: 'body' },
      row('Notifications', 'Show friend activity and the badge', S.user.notifications_enabled, (e) => run(async () => { S.user = await store.updateProfile({ notifications_enabled: e.target.checked }); say('Saved'); })),
      row('Saves and likes', 'When a friend saves or likes an item', S.prefs.saves, (e) => { S.prefs.saves = e.target.checked; savePrefs(); }),
      row('Chat', 'When a friend sends a message', S.prefs.chat, (e) => { S.prefs.chat = e.target.checked; savePrefs(); }));
  }

  function history() {
    return h('div', { class: 'body' },
      S.history.length
        ? h('div', { class: 'card col' }, S.history.map((p) => h('div', { class: 'share' }, h('span', { class: 'col tight' }, h('b', null, p.label || p.list_name), h('span', { class: 'sub' }, p.list_name)), h('span', { class: 'sub' }, ago(p.ended_at)))))
        : h('div', { class: 'empty' }, h('h3', null, 'No past parties'), h('p', null, 'Parties you end, or that go quiet for six hours, show up here.')));
  }

  // ------------------------------------------------------------------ render

  const SCREENS = { share: shareScreen, welcome, signin: () => authForm(false), signup: () => authForm(true), permissions, home, newList, list: listScreen, item: itemScreen, startParty, invite, join, joined, party: partyScreen, cart: cartScreen, notifications, settings, profile, notifPrefs, history };

  function render() {
    const build = SCREENS[S.route.name];
    const keep = collect();
    root.replaceChildren(...[header(), tabs(), banner(), build ? build() : h('div', { class: 'body' }, 'Loading…')].filter(Boolean));
    restore(keep);
  }

  render();
  init();

  return {
    go, back, tab, openList, openItem, render,
    state: () => S,
    restart: () => init(),
    destroy: async () => { clearTimeout(reloadTimer); if (S.unsub) await S.unsub(); },
  };
}
