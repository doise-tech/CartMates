import { cleanUrl } from '../lib/product.js';
import { supabase } from '../lib/supabase.js';

// The one place that knows about Supabase tables. Screens only call these methods, so the
// web preview can swap in a mock store with the same shape.
// Tables: lists, list_members, parties, party_members, products, list_items, tags,
// item_tags, reactions, messages, profiles. RPCs: save_item, join_party.

const ACTIVE_KEY = 'cm_active';
const channels = new Map(); // live connections shared by everything on this page
const PREFS_KEY = 'cm_prefs';
const SEEN_KEY = 'cm_seen';
const FLAGS_KEY = 'cm_flags';

const local = {
  async get(key, fallback) {
    const out = await chrome.storage.local.get(key);
    return out[key] ?? fallback;
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
};

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

async function me() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

async function profileFor(user) {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, preferred_currency, notifications_enabled')
    .eq('id', user.id)
    .maybeSingle();
  return {
    id: user.id,
    email: user.email,
    display_name: data?.display_name || user.email?.split('@')[0] || 'You',
    avatar_url: data?.avatar_url ?? null,
    preferred_currency: data?.preferred_currency || 'INR',
    notifications_enabled: data?.notifications_enabled ?? true,
  };
}

export const store = {
  mode: 'live',

  // ---- account
  async getUser() {
    const user = await me();
    return user ? profileFor(user) : null;
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { user: await profileFor(data.user) };
  },
  async signUp(email, password, name) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name || undefined }, emailRedirectTo: chrome.runtime.getURL('confirmed/confirmed.html') } });
    if (error) throw new Error(error.message);
    return data.session ? { user: await profileFor(data.user) } : { user: null, needsConfirm: true };
  },
  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: chrome.runtime.getURL('confirmed/confirmed.html') });
    if (error) throw new Error(error.message);
  },
  async signOut() {
    await supabase.auth.signOut();
    await chrome.storage.local.remove([ACTIVE_KEY]);
  },
  async updateProfile(patch) {
    const user = await me();
    const allowed = {};
    for (const k of ['display_name', 'preferred_currency', 'notifications_enabled']) if (k in patch) allowed[k] = patch[k];
    ok(await supabase.from('profiles').update(allowed).eq('id', user.id));
    return profileFor(user);
  },

  // ---- lists
  async loadHome() {
    const user = await me();
    const [mine, live] = await Promise.all([
      supabase.from('list_members').select('role, lists(id, name, owner_id, created_at, invite_code)').eq('user_id', user.id),
      supabase.from('parties').select('id, list_id, label, invite_code, host_id, started_at').eq('status', 'live'),
    ]);
    const liveBy = new Map(ok(live).map((p) => [p.list_id, p]));
    const lists = ok(mine)
      .filter((r) => r.lists)
      .map((r) => ({ ...r.lists, role: r.role, live: liveBy.get(r.lists.id) ?? null }))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return { lists };
  },
  async createList(name) {
    return ok(await supabase.from('lists').insert({ name: name.trim() }).select().single());
  },
  // Which of my lists already hold this page.
  async savedIn(url) {
    const rows = ok(await supabase.from('list_items').select('list_id, product:products!inner(url)').eq('product.url', cleanUrl(url)).is('removed_at', null));
    return [...new Set(rows.map((r) => r.list_id))];
  },
  async removeMember(listId, userId) {
    ok(await supabase.from('list_members').delete().eq('list_id', listId).eq('user_id', userId));
  },

  // Everything the screens and the party bar need for one list, and one party if there is one.
  async loadContext(listId, partyId) {
    const q = supabase;
    const [list, members, items, tags, liveParty] = await Promise.all([
      q.from('lists').select('id, name, owner_id, created_at, invite_code').eq('id', listId).single(),
      q.from('list_members').select('user_id, role, joined_at, profile:profiles(display_name, avatar_url)').eq('list_id', listId),
      q
        .from('list_items')
        .select('*, product:products(url, title, brand, image_url, price, currency, store_domain), reactions(user_id, type, created_at), item_tags(tag_id)')
        .eq('list_id', listId)
        .is('removed_at', null)
        .order('created_at', { ascending: false }),
      q.from('tags').select('id, name').eq('list_id', listId).order('name'),
      q.from('parties').select('id, list_id, label, invite_code, host_id, status, started_at').eq('list_id', listId).eq('status', 'live').order('started_at', { ascending: false }).limit(1),
    ]);
    const ctx = {
      list: ok(list),
      members: ok(members).map((m) => ({ ...m, profile: { id: m.user_id, ...(m.profile || {}) } })),
      items: ok(items).map(({ item_tags, ...i }) => ({ ...i, tag_ids: (item_tags || []).map((t) => t.tag_id) })),
      tags: ok(tags),
      liveParty: ok(liveParty)[0] ?? null,
      party: null,
      here: [],
      messages: [],
    };
    if (partyId) {
      const [party, here, messages] = await Promise.all([
        q.from('parties').select('id, list_id, label, invite_code, host_id, status, started_at, ended_at').eq('id', partyId).single(),
        q.from('party_members').select('user_id, joined_at, left_at').eq('party_id', partyId),
        q.from('messages').select('id, user_id, body, item_id, created_at').eq('party_id', partyId).order('created_at', { ascending: false }).limit(60),
      ]);
      ctx.party = ok(party);
      ctx.here = ok(here);
      ctx.messages = ok(messages).reverse();
    }
    return ctx;
  },

  async loadHistory() {
    const rows = ok(
      await supabase
        .from('parties')
        .select('id, label, started_at, ended_at, list:lists(name)')
        .eq('status', 'ended')
        .order('ended_at', { ascending: false })
        .limit(20),
    );
    return rows.map((r) => ({ id: r.id, label: r.label, list_name: r.list?.name ?? 'List', started_at: r.started_at, ended_at: r.ended_at }));
  },

  // ---- parties
  async startParty(listId, label) {
    const user = await me();
    return ok(await supabase.from('parties').insert({ list_id: listId, host_id: user.id, label: label?.trim() || null }).select().single());
  },
  async joinParty(code) {
    return ok(await supabase.rpc('join_party', { code: code.trim() }));
  },
  async joinList(code) {
    return ok(await supabase.rpc('join_list', { code: code.trim() }));
  },
  // One box for any invite code: a live party's code, or a list's own code.
  async join(code) {
    try {
      return { kind: 'party', party: await store.joinParty(code) };
    } catch (e) {
      if (!/doesn.t match any party/i.test(e.message || '')) throw e;
    }
    return { kind: 'list', list: await store.joinList(code) };
  },
  async resetInvite(listId) {
    return ok(await supabase.rpc('reset_list_invite', { list_id: listId }));
  },
  // Come back to a live party you left, or step into one on a list you already belong to.
  async enterParty(partyId) {
    const user = await me();
    const back = ok(await supabase.from('party_members').update({ left_at: null }).eq('party_id', partyId).eq('user_id', user.id).select());
    if (!back.length) ok(await supabase.from('party_members').insert({ party_id: partyId, user_id: user.id }));
  },
  async leaveParty(partyId) {
    const user = await me();
    ok(await supabase.from('party_members').update({ left_at: new Date().toISOString() }).eq('party_id', partyId).eq('user_id', user.id));
  },
  async endParty(partyId) {
    ok(await supabase.from('parties').update({ status: 'ended' }).eq('id', partyId));
  },
  async getActive() {
    return local.get(ACTIVE_KEY, null);
  },
  async setActive(active) {
    if (active) await local.set(ACTIVE_KEY, active);
    else await chrome.storage.local.remove(ACTIVE_KEY);
  },

  // ---- items
  async saveItem(listId, partyId, p) {
    return ok(
      await supabase.rpc('save_item', {
        p_list_id: listId,
        p_url: p.url,
        p_title: p.title,
        p_image_url: p.image_url ?? null,
        p_price: p.price ?? null,
        p_currency: p.currency ?? null,
        p_brand: p.brand ?? null,
        p_variant: p.variant ?? null,
        p_images: (p.images || []).slice(0, 8),
        p_options: p.options || [],
        p_quantity: 1,
        p_note: null,
        p_party_id: partyId ?? null,
      }),
    );
  },
  async setItemStatus(itemId, status) {
    ok(await supabase.from('list_items').update({ status }).eq('id', itemId));
  },
  async removeItem(itemId) {
    ok(await supabase.from('list_items').update({ removed_at: new Date().toISOString() }).eq('id', itemId));
  },
  async toggleReaction(itemId) {
    const user = await me();
    const { data } = await supabase.from('reactions').select('item_id').eq('item_id', itemId).eq('user_id', user.id).maybeSingle();
    if (data) ok(await supabase.from('reactions').delete().eq('item_id', itemId).eq('user_id', user.id));
    else ok(await supabase.from('reactions').insert({ item_id: itemId, user_id: user.id, type: 'heart' }));
  },
  async addTag(listId, name) {
    return ok(await supabase.from('tags').insert({ list_id: listId, name: name.trim() }).select('id, name').single());
  },
  async setItemTag(listId, itemId, tagId, on) {
    if (on) ok(await supabase.from('item_tags').insert({ item_id: itemId, tag_id: tagId, list_id: listId }));
    else ok(await supabase.from('item_tags').delete().eq('item_id', itemId).eq('tag_id', tagId));
  },

  // ---- chat. A message can point at an item, which is how item discussion works.
  async sendMessage(partyId, body, itemId = null) {
    const user = await me();
    ok(await supabase.from('messages').insert({ party_id: partyId, user_id: user.id, body: body.trim(), item_id: itemId }));
  },
  async loadThread(itemId) {
    return ok(await supabase.from('messages').select('id, user_id, body, created_at').eq('item_id', itemId).order('created_at'));
  },

  // ---- live updates. onChange({ kind: 'data' }) means "reload"; { kind: 'presence', online } lists who is here.
  async subscribe({ listId, partyId }, onChange) {
    const user = await me();
    const topic = `cm:${partyId || listId}`;
    // The drawer and the party bar can both listen to the same list or party. They share one connection
    // (a second one with the same name is refused once the first is running) and each gets every update.
    let shared = channels.get(topic);
    if (!shared) {
      const channel = supabase.channel(topic, { config: { presence: { key: user.id } } });
      shared = { channel, listeners: new Set(), online: null };
      const fan = (ev) => shared.listeners.forEach((fn) => { try { fn(ev); } catch { /* one listener's trouble stays its own */ } });
      const bump = () => fan({ kind: 'data' });
      const watch = (table, filter) => channel.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, bump);
      watch('list_items', `list_id=eq.${listId}`);
      watch('item_tags', `list_id=eq.${listId}`);
      watch('parties', `list_id=eq.${listId}`);
      watch('reactions'); // no list column to filter on; row level security keeps it to your lists
      if (partyId) {
        watch('messages', `party_id=eq.${partyId}`);
        watch('party_members', `party_id=eq.${partyId}`);
        channel.on('presence', { event: 'sync' }, () => { shared.online = Object.keys(channel.presenceState()); fan({ kind: 'presence', online: shared.online }); });
      }
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' && partyId) channel.track({ at: Date.now() });
      });
      channels.set(topic, shared);
    }
    shared.listeners.add(onChange);
    if (shared.online) setTimeout(() => onChange({ kind: 'presence', online: shared.online }), 0);
    return () => {
      shared.listeners.delete(onChange);
      if (!shared.listeners.size) {
        if (channels.get(topic) === shared) channels.delete(topic);
        return supabase.removeChannel(shared.channel);
      }
    };
  },

  // ---- things that stay on this device
  async getPrefs() {
    return { saves: true, chat: true, ...(await local.get(PREFS_KEY, {})) };
  },
  async setPrefs(prefs) {
    await local.set(PREFS_KEY, prefs);
  },
  async getSeen(listId) {
    return (await local.get(SEEN_KEY, {}))[listId] ?? null;
  },
  async setSeen(listId, iso) {
    const all = await local.get(SEEN_KEY, {});
    await local.set(SEEN_KEY, { ...all, [listId]: iso });
  },
  async getFlag(key) {
    return (await local.get(FLAGS_KEY, {}))[key] ?? false;
  },
  async setFlag(key, value) {
    const all = await local.get(FLAGS_KEY, {});
    await local.set(FLAGS_KEY, { ...all, [key]: value });
  },
};
