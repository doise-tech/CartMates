// In-memory stand-in for store/supabase.js, used by the web preview and the tests.
// Same method names and shapes, plus `demo` helpers that make friends do things.

import { cleanUrl } from '../lib/product.js';

const MIN = 60000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const code = (n) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, 'x');
let seq = 1000;
const uid = (p) => `${p}${++seq}`;

export const SHOP = 'hearthandco.example';
export const CATALOG = [
  { slug: 'olive-oil', title: 'Cold-pressed olive oil, 1 L', price: 899, hue: '#dfe8b0', shape: 'bottle' },
  { slug: 'tiffin-set', title: 'Brass tiffin set', price: 1299, hue: '#f0dcae', shape: 'tin' },
  { slug: 'cotton-throw', title: 'Cotton throw blanket', price: 1599, hue: '#f3cfc4', shape: 'throw', variant: 'Colour: Blush · Size: Queen' },
  { slug: 'pour-over-kettle', title: 'Pour-over kettle', price: 2499, hue: '#cfd9ea', shape: 'kettle', variant: 'Colour: Matte blue · Size: 1 L' },
  { slug: 'terracotta-planter', title: 'Terracotta planter', price: 449, hue: '#f2c9b0', shape: 'planter' },
  { slug: 'linen-napkins', title: 'Linen napkins, set of 4', price: 649, hue: '#e4dcf0', shape: 'napkin', variant: 'Colour: Lilac' },
].map((p) => ({ ...p, url: `https://${SHOP}/p/${p.slug}`, brand: 'Hearth & Co.', image_url: null, currency: 'INR', store_domain: SHOP }));

const bySlug = (slug) => CATALOG.find((p) => p.slug === slug);
const PEOPLE = {
  u_me: 'Asha',
  u_priya: 'Priya',
  u_arjun: 'Arjun',
  u_meera: 'Meera',
};
const person = (id) => ({ id, display_name: PEOPLE[id] || 'Friend', avatar_url: null });
const member = (id, role = 'member', joined = ago(300 * MIN)) => ({ user_id: id, role, joined_at: joined, profile: person(id) });

function seed() {
  const item = (slug, by, status, minutesAgo, extra = {}) => {
    const p = bySlug(slug);
    return {
      id: uid('it'), list_id: 'l1', product: clone(p), price_at_save: p.price, currency_at_save: 'INR', quantity: 1, note: null, variant: p.variant ?? null,
      status, claimed_by: null, bought_at: null, added_by: by, party_id: 'pa1', created_at: ago(minutesAgo * MIN), reactions: [], comments: [], tag_ids: [], ...extra,
    };
  };
  const planter = item('terracotta-planter', 'u_priya', 'saved', 95, { tag_ids: ['t2'] });
  planter.reactions = [{ user_id: 'u_me', type: 'up', created_at: ago(80 * MIN) }, { user_id: 'u_arjun', type: 'up', created_at: ago(70 * MIN) }];
  planter.comments = [{ id: 'c1', user_id: 'u_arjun', body: 'This would look great by the window.', created_at: ago(68 * MIN) }];
  const tiffin = item('tiffin-set', 'u_arjun', 'in_cart', 60, { tag_ids: ['t1'] });
  tiffin.reactions = [{ user_id: 'u_priya', type: 'up', created_at: ago(50 * MIN) }, { user_id: 'u_arjun', type: 'down', created_at: ago(45 * MIN) }];
  tiffin.comments = [{ id: 'c2', user_id: 'u_arjun', body: 'Do we really need a fourth one?', created_at: ago(44 * MIN) }, { id: 'c3', user_id: 'u_priya', body: 'Ha. Fine, the steel one is better anyway.', created_at: ago(40 * MIN) }];
  const napkins = item('linen-napkins', 'u_arjun', 'claimed', 12, { claimed_by: 'u_priya', tag_ids: ['t1', 't3'] });
  const kettle = item('pour-over-kettle', 'u_priya', 'in_cart', 30, { tag_ids: ['t1'] });
  const oil = item('olive-oil', 'u_me', 'bought', 140, { claimed_by: 'u_me', bought_at: ago(20 * MIN), tag_ids: ['t1'] });
  const gift = {
    id: uid('it'), list_id: 'l2', product: { url: 'https://giftbox.example/p/diya-set', title: 'Hand-painted diya set', brand: null, image_url: null, price: 799, currency: 'INR', store_domain: 'giftbox.example', hue: '#f6d9a8', shape: 'tin' },
    price_at_save: 799, currency_at_save: 'INR', quantity: 2, note: null, variant: null, status: 'saved', claimed_by: null, bought_at: null, added_by: 'u_priya', party_id: 'pa0', created_at: ago(9000 * MIN), reactions: [], comments: [], tag_ids: [],
  };
  return {
    lists: [
      { id: 'l1', name: 'Housewarming', owner_id: 'u_me', created_at: ago(3000 * MIN), invite_code: 'h0use4rm1n' },
      { id: 'l2', name: 'Diwali gifts', owner_id: 'u_priya', created_at: ago(9500 * MIN), invite_code: 'd1wa11g1ft' },
    ],
    members: { l1: [member('u_me', 'owner'), member('u_priya'), member('u_arjun')], l2: [member('u_priya', 'owner'), member('u_me')] },
    parties: [
      { id: 'pa1', list_id: 'l1', label: 'Saturday shop', status: 'live', invite_code: 'k7m2x9qa41', host_id: 'u_me', started_at: ago(70 * MIN), ended_at: null },
      { id: 'pa0', list_id: 'l2', label: 'Diwali run', status: 'ended', invite_code: 'p4n8d1ze72', host_id: 'u_priya', started_at: ago(9100 * MIN), ended_at: ago(9000 * MIN) },
    ],
    here: { pa1: [{ user_id: 'u_me', joined_at: ago(68 * MIN), left_at: null }, { user_id: 'u_priya', joined_at: ago(66 * MIN), left_at: null }, { user_id: 'u_arjun', joined_at: ago(64 * MIN), left_at: ago(10 * MIN) }] },
    items: { l1: [napkins, kettle, tiffin, oil, planter], l2: [gift] },
    tags: { l1: [{ id: 't1', name: 'kitchen' }, { id: 't2', name: 'gifts' }, { id: 't3', name: 'priority' }], l2: [] },
    messages: {
      pa1: [
        { id: uid('m'), party_id: 'pa1', user_id: 'u_priya', body: 'Found a few things for the flat. Saving them now.', item_id: null, created_at: ago(55 * MIN) },
        { id: uid('m'), party_id: 'pa1', user_id: 'u_arjun', body: 'These napkins are on sale today.', item_id: napkins.id, created_at: ago(11 * MIN) },
        { id: uid('m'), party_id: 'pa1', user_id: 'u_priya', body: 'I will buy those, put them in the cart.', item_id: napkins.id, created_at: ago(8 * MIN) },
      ],
      pa0: [],
    },
    sharedLists: [
      { code: 'bday2list0', list: { id: 'l8', name: 'Meera birthday', owner_id: 'u_meera', created_at: ago(2000 * MIN), invite_code: 'bday2list0' } },
    ],
    joinable: [
      { code: 'goa7trip01', list: { id: 'l9', name: 'Goa trip shopping', owner_id: 'u_priya', created_at: ago(500 * MIN), invite_code: 'g0atr1p000' }, party: { id: 'pa9', list_id: 'l9', label: 'Beach kit', status: 'live', invite_code: 'goa7trip01', host_id: 'u_priya', started_at: ago(30 * MIN), ended_at: null } },
    ],
  };
}

export function createMockStore({ signedIn = true } = {}) {
  let db = seed();
  let user = signedIn ? { id: 'u_me', email: 'asha@example.com', display_name: 'Asha', avatar_url: null, preferred_currency: 'INR', notifications_enabled: true } : null;
  let active = signedIn ? { listId: 'l1', partyId: 'pa1' } : null;
  let prefs = { saves: true, chat: true };
  let seen = { l1: ago(40 * MIN) };
  let nav = null;
  let flags = { onboarded: signedIn };
  let online = ['u_me', 'u_priya'];
  const listeners = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
  };
  const emit = () => listeners.forEach((fn) => fn({ kind: 'data' }));
  const emitPresence = () => listeners.forEach((fn) => fn({ kind: 'presence', online: [...online] }));

  const needUser = () => {
    if (!user) throw new Error('Sign in first.');
  };
  const list = (id) => db.lists.find((l) => l.id === id);
  const party = (id) => db.parties.find((p) => p.id === id);
  const itemById = (id) => Object.values(db.items).flat().find((i) => i.id === id);
  const isOwner = (listId) => (db.members[listId] || []).some((m) => m.user_id === user.id && m.role === 'owner');
  const livePartyFor = (listId) => db.parties.find((p) => p.list_id === listId && p.status === 'live') || null;
  const addMember = (listId, id, role = 'member') => {
    db.members[listId] = db.members[listId] || [];
    if (!db.members[listId].some((m) => m.user_id === id)) db.members[listId].push(member(id, role, new Date().toISOString()));
  };
  const addHere = (partyId, id) => {
    db.here[partyId] = db.here[partyId] || [];
    const row = db.here[partyId].find((r) => r.user_id === id);
    if (row) Object.assign(row, { left_at: null, joined_at: new Date().toISOString() });
    else db.here[partyId].push({ user_id: id, joined_at: new Date().toISOString(), left_at: null });
    if (!online.includes(id) && party(partyId)?.status === 'live') online.push(id);
  };
  const newItem = (listId, partyId, p, by) => {
    const row = {
      id: uid('it'), list_id: listId, product: { url: p.url, title: p.title, brand: p.brand ?? null, image_url: p.image_url ?? null, price: p.price ?? null, currency: p.currency ?? null, store_domain: new URL(p.url).hostname, hue: p.hue, shape: p.shape },
      price_at_save: p.price ?? null, currency_at_save: p.currency ?? null, quantity: 1, note: null, variant: p.variant ?? null, images: p.images ?? [], options: p.options ?? [], status: 'saved', claimed_by: null, bought_at: null,
      added_by: by, party_id: partyId ?? null, created_at: new Date().toISOString(), reactions: [], comments: [], images: p.images ?? [], options: p.options ?? [], tag_ids: [],
    };
    db.items[listId] = db.items[listId] || [];
    db.items[listId].unshift(row);
    return row;
  };

  const store = {
    mode: 'mock',

    async getUser() {
      return clone(user);
    },
    async signIn(email, password) {
      if (!/.+@.+\..+/.test(email || '') || (password || '').length < 6) throw new Error('Enter your email and a password of at least 6 characters.');
      user = { id: 'u_me', email, display_name: email.split('@')[0], avatar_url: null, preferred_currency: 'INR', notifications_enabled: true };
      return { user: clone(user) };
    },
    async signUp(email, password, name) {
      if (!/.+@.+\..+/.test(email || '') || (password || '').length < 6) throw new Error('Enter your email and a password of at least 6 characters.');
      user = { id: 'u_me', email, display_name: name || email.split('@')[0], avatar_url: null, preferred_currency: 'INR', notifications_enabled: true };
      return { user: clone(user) };
    },
    async resetPassword(email) {
      if (!/.+@.+\..+/.test(email || '')) throw new Error('Enter the email you signed up with.');
    },
    async signOut() {
      user = null;
      active = null;
    },
    async updateProfile(patch) {
      needUser();
      Object.assign(user, patch);
      PEOPLE.u_me = user.display_name;
      (Object.values(db.members).flat()).forEach((m) => { if (m.user_id === 'u_me') m.profile = person('u_me'); });
      return clone(user);
    },

    async loadHome() {
      needUser();
      const lists = db.lists
        .filter((l) => (db.members[l.id] || []).some((m) => m.user_id === user.id))
        .map((l) => ({ ...l, role: db.members[l.id].find((m) => m.user_id === user.id).role, live: livePartyFor(l.id) }))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      return clone({ lists });
    },
    async createList(name) {
      needUser();
      if (!name.trim()) throw new Error('Give your list a name.');
      const l = { id: uid('l'), name: name.trim(), owner_id: user.id, created_at: new Date().toISOString(), invite_code: code(10) };
      db.lists.push(l);
      db.members[l.id] = [member(user.id, 'owner', l.created_at)];
      db.items[l.id] = [];
      db.tags[l.id] = [];
      return clone(l);
    },
    async removeMember(listId, userId) {
      needUser();
      if (userId !== user.id && !isOwner(listId)) throw new Error('Only the list owner can remove people.');
      db.members[listId] = db.members[listId].filter((m) => m.user_id !== userId);
      if (userId === user.id) db.lists = db.lists.filter((l) => l.id !== listId || db.members[listId].length);
      emit();
    },

    async loadContext(listId, partyId) {
      needUser();
      const l = list(listId);
      if (!l) throw new Error('That list is not available.');
      const ctx = {
        list: l,
        members: db.members[listId] || [],
        items: db.items[listId] || [],
        tags: db.tags[listId] || [],
        liveParty: livePartyFor(listId),
        party: partyId ? party(partyId) : null,
        here: partyId ? db.here[partyId] || [] : [],
        messages: partyId ? db.messages[partyId] || [] : [],
      };
      return clone(ctx);
    },
    async loadHistory() {
      return clone(db.parties.filter((p) => p.status === 'ended').map((p) => ({ id: p.id, label: p.label, list_name: list(p.list_id)?.name ?? 'List', started_at: p.started_at, ended_at: p.ended_at })));
    },

    async startParty(listId, label) {
      needUser();
      if (livePartyFor(listId)) throw new Error('This list already has a live party. Join it instead.');
      const p = { id: uid('pa'), list_id: listId, label: label?.trim() || null, status: 'live', invite_code: code(10), host_id: user.id, started_at: new Date().toISOString(), ended_at: null };
      db.parties.push(p);
      db.here[p.id] = [];
      db.messages[p.id] = [];
      online = [user.id];
      addHere(p.id, user.id);
      // Friends drift in, so the invite screen has something to show.
      later(() => { addMember(listId, 'u_priya'); addHere(p.id, 'u_priya'); emit(); emitPresence(); }, 4000);
      later(() => { addMember(listId, 'u_arjun'); addHere(p.id, 'u_arjun'); emit(); emitPresence(); }, 9000);
      emit();
      return clone(p);
    },
    async joinParty(codeText) {
      needUser();
      const c = (codeText || '').trim();
      const extra = db.joinable.find((j) => j.code === c);
      if (extra) {
        db.lists.push(extra.list);
        db.members[extra.list.id] = [member('u_priya', 'owner'), member('u_arjun')];
        db.items[extra.list.id] = [];
        db.tags[extra.list.id] = [];
        db.parties.push(extra.party);
        db.here[extra.party.id] = [{ user_id: 'u_priya', joined_at: ago(29 * MIN), left_at: null }];
        db.messages[extra.party.id] = [{ id: uid('m'), party_id: extra.party.id, user_id: 'u_priya', body: 'Welcome! Save anything you want for the trip.', item_id: null, created_at: ago(2 * MIN) }];
        db.joinable = db.joinable.filter((j) => j !== extra);
      }
      const p = db.parties.find((x) => x.invite_code === c);
      if (!p) throw new Error("That invite code doesn't match any party");
      if (p.status !== 'live') throw new Error('This party has already ended');
      addMember(p.list_id, user.id);
      addHere(p.id, user.id);
      emit();
      emitPresence();
      return clone(p);
    },
    async joinList(codeText) {
      needUser();
      const c = (codeText || '').trim();
      const extra = db.sharedLists.find((j) => j.code === c);
      if (extra) {
        db.lists.push(extra.list);
        db.members[extra.list.id] = [member('u_meera', 'owner'), member('u_priya')];
        db.items[extra.list.id] = [];
        db.tags[extra.list.id] = [];
        newItem(extra.list.id, null, CATALOG[1], 'u_meera');
        db.sharedLists = db.sharedLists.filter((j) => j !== extra);
      }
      const l = db.lists.find((x) => x.invite_code === c);
      if (!l) throw new Error("That invite code doesn't match any list");
      addMember(l.id, user.id);
      emit();
      return clone(l);
    },
    async join(codeText) {
      try {
        return { kind: 'party', party: await store.joinParty(codeText) };
      } catch (e) {
        if (!/doesn.t match any party/i.test(e.message)) throw e;
      }
      return { kind: 'list', list: await store.joinList(codeText) };
    },
    async resetInvite(listId) {
      needUser();
      if (!isOwner(listId)) throw new Error('Only the list owner can make a new invite code');
      list(listId).invite_code = code(10);
      emit();
      return list(listId).invite_code;
    },
    async savedIn(url) {
      const clean = cleanUrl(url);
      return Object.entries(db.items).filter(([id, items]) => (db.members[id] || []).some((m) => m.user_id === user?.id) && items.some((i) => cleanUrl(i.product.url) === clean)).map(([id]) => id);
    },
    async enterParty(partyId) {
      needUser();
      addHere(partyId, user.id);
      emitPresence();
    },
    async leaveParty(partyId) {
      needUser();
      const row = (db.here[partyId] || []).find((r) => r.user_id === user.id);
      if (row) row.left_at = new Date().toISOString();
      online = online.filter((id) => id !== user.id);
      emit();
      emitPresence();
    },
    async endParty(partyId) {
      needUser();
      const p = party(partyId);
      if (p.host_id !== user.id) throw new Error('Only the host can end the party.');
      p.status = 'ended';
      p.ended_at = new Date().toISOString();
      emit();
    },
    async getActive() {
      return clone(active);
    },
    async setActive(next) {
      active = next ? { ...next } : null;
    },

    async saveItem(listId, partyId, p) {
      needUser();
      if (partyId && party(partyId)?.status !== 'live') throw new Error("That party isn't live for this list");
      const row = newItem(listId, partyId, p, user.id);
      emit();
      return clone(row);
    },
    async setItemStatus(itemId, status) {
      needUser();
      const it = itemById(itemId);
      if (!it) throw new Error('That item is gone.');
      if (it.claimed_by && it.claimed_by !== user.id && !isOwner(it.list_id)) throw new Error('This item is already claimed by someone else');
      it.status = status;
      if (status === 'claimed') { it.claimed_by = user.id; it.bought_at = null; }
      else if (status === 'bought') { it.claimed_by = it.claimed_by || user.id; it.bought_at = new Date().toISOString(); }
      else { it.claimed_by = null; it.bought_at = null; }
      emit();
    },
    async removeItem(itemId) {
      needUser();
      const it = itemById(itemId);
      if (!it) return;
      if (it.added_by !== user.id && !isOwner(it.list_id)) throw new Error('Only the person who added this item, or the list owner, can remove it');
      db.items[it.list_id] = db.items[it.list_id].filter((x) => x.id !== itemId);
      emit();
    },
    async vote(itemId, dir) {
      needUser();
      const it = itemById(itemId);
      const i = it.reactions.findIndex((r) => r.user_id === user.id);
      const now = i >= 0 ? (it.reactions[i].type === 'down' ? 'down' : 'up') : null;
      if (i >= 0) it.reactions.splice(i, 1);
      if (now !== dir) it.reactions.push({ user_id: user.id, type: dir, created_at: new Date().toISOString() });
      emit();
    },
    async addComment(itemId, body) {
      needUser();
      const it = itemById(itemId);
      const text = String(body || '').trim().slice(0, 1000);
      if (!it || !text) return;
      (it.comments ||= []).push({ id: uid('c'), user_id: user.id, body: text, created_at: new Date().toISOString() });
      emit();
    },
    async deleteComment(commentId) {
      needUser();
      for (const list of Object.values(db.items)) for (const it of list) it.comments = (it.comments || []).filter((c) => !(c.id === commentId && c.user_id === user.id));
      emit();
    },
    async toggleReaction(itemId) {
      needUser();
      const it = itemById(itemId);
      const i = it.reactions.findIndex((r) => r.user_id === user.id);
      if (i >= 0) it.reactions.splice(i, 1);
      else it.reactions.push({ user_id: user.id, type: 'heart', created_at: new Date().toISOString() });
      emit();
    },
    async addTag(listId, name) {
      needUser();
      const t = { id: uid('t'), name: name.trim() };
      db.tags[listId].push(t);
      emit();
      return clone(t);
    },
    async setItemTag(listId, itemId, tagId, on) {
      needUser();
      const it = itemById(itemId);
      it.tag_ids = it.tag_ids.filter((t) => t !== tagId);
      if (on) it.tag_ids.push(tagId);
      emit();
    },

    async sendMessage(partyId, body, itemId = null) {
      needUser();
      const p = party(partyId);
      if (!p || p.status !== 'live') throw new Error('Chat is only open while the party is live.');
      if (!body.trim()) return;
      db.messages[partyId].push({ id: uid('m'), party_id: partyId, user_id: user.id, body: body.trim(), item_id: itemId, created_at: new Date().toISOString() });
      emit();
    },
    async loadThread(itemId) {
      return clone((itemById(itemId)?.comments || []).slice().sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)));
    },

    async subscribe({ partyId }, onChange) {
      listeners.add(onChange);
      if (partyId) later(() => onChange({ kind: 'presence', online: [...online] }), 0);
      return () => listeners.delete(onChange);
    },

    async getPrefs() { return { ...prefs }; },
    async setPrefs(next) { prefs = { ...next }; },
    async getSeen(listId) { return seen[listId] ?? null; },
    async setSeen(listId, iso) { seen[listId] = iso; },
    async getNav() { return nav ? { ...nav } : null; },
    async setNav(next) { nav = next ? { ...next } : null; },
    async getFlag(key) { return !!flags[key]; },
    async setFlag(key, value) { flags[key] = value; },

    // Friends doing things, for the preview. Each one targets the list you are looking at.
    demo: {
      target() {
        const listId = active?.listId || 'l1';
        return { listId, partyId: active?.partyId || livePartyFor(listId)?.id || null };
      },
      friendSaves() {
        const { listId, partyId } = this.target();
        const have = (db.items[listId] || []).map((i) => i.product.url);
        const pick = CATALOG.find((p) => !have.includes(p.url));
        if (!pick) return 'Everything in the shop is already saved';
        newItem(listId, partyId, pick, 'u_priya');
        emit();
        return `Priya saved ${pick.title}`;
      },
      friendReacts() {
        const { listId } = this.target();
        const it = (db.items[listId] || []).find((i) => !i.reactions.some((r) => r.user_id === 'u_arjun'));
        if (!it) return 'Arjun already voted on everything';
        it.reactions.push({ user_id: 'u_arjun', type: 'up', created_at: new Date().toISOString() });
        emit();
        return `Arjun upvoted ${it.product.title}`;
      },
      friendChats() {
        const { partyId } = this.target();
        if (!partyId) return 'Start or join a party first';
        const lines = ['Which one should we get first?', 'Just checked, this ships in two days.', 'Can someone take the kettle?'];
        const body = lines[Math.floor(Math.random() * lines.length)];
        db.messages[partyId].push({ id: uid('m'), party_id: partyId, user_id: 'u_priya', body, item_id: null, created_at: new Date().toISOString() });
        emit();
        return `Priya: ${body}`;
      },
      friendComments() {
        const { listId } = this.target();
        const it = (db.items[listId] || [])[0];
        if (!it) return 'Nothing saved to comment on yet';
        const lines = ['Love this one.', 'Is it available in a smaller size?', 'I saw this cheaper somewhere else.', 'Yes please, add it to the cart.'];
        const body = lines[Math.floor(Math.random() * lines.length)];
        (it.comments ||= []).push({ id: uid('c'), user_id: 'u_priya', body, created_at: new Date().toISOString() });
        emit();
        return `Priya on ${it.product.title}: ${body}`;
      },
      friendClaims() {
        const { listId } = this.target();
        const it = (db.items[listId] || []).find((i) => i.status === 'in_cart');
        if (!it) return 'Nothing in the cart to claim';
        it.status = 'claimed';
        it.claimed_by = 'u_arjun';
        emit();
        return `Arjun claimed ${it.product.title}`;
      },
      friendJoins() {
        const { listId, partyId } = this.target();
        if (!partyId) return 'Start or join a party first';
        const who = db.members[listId].some((m) => m.user_id === 'u_meera') ? 'u_arjun' : 'u_meera';
        addMember(listId, who);
        addHere(partyId, who);
        emit();
        emitPresence();
        return `${PEOPLE[who]} joined the party`;
      },
      signedIn() { return !!user; },
      signInQuick() {
        user = { id: 'u_me', email: 'asha@example.com', display_name: PEOPLE.u_me, avatar_url: null, preferred_currency: 'INR', notifications_enabled: true };
        flags.onboarded = true;
        active = { listId: 'l1', partyId: livePartyFor('l1')?.id || null };
      },
      resetData({ keepSignedIn = true } = {}) {
        const was = !!user;
        db = seed();
        PEOPLE.u_me = 'Asha';
        online = ['u_me', 'u_priya'];
        seen = { l1: ago(40 * MIN) };
        prefs = { saves: true, chat: true };
        user = keepSignedIn && was ? { id: 'u_me', email: 'asha@example.com', display_name: 'Asha', avatar_url: null, preferred_currency: 'INR', notifications_enabled: true } : null;
        active = user ? { listId: 'l1', partyId: 'pa1' } : null;
        emit();
      },
      endLiveParty() {
        const p = livePartyFor('l1');
        if (p) { p.status = 'ended'; p.ended_at = new Date().toISOString(); emit(); }
      },
    },
  };
  return store;
}
