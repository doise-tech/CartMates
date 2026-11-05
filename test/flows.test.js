import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Walk every screen of the popup against the mock store, the way a person would.
const dom = new JSDOM('<!doctype html><body><div id="app" class="cm"></div><div id="page"></div></body>', { url: 'https://hearthandco.example/p/cotton-throw', pretendToBeVisual: true });
for (const k of ['window', 'document', 'Node', 'HTMLElement', 'Event', 'KeyboardEvent']) {
  Object.defineProperty(globalThis, k, { value: k === 'window' ? dom.window : dom.window[k] ?? globalThis[k], configurable: true, writable: true });
}
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.matchMedia = () => ({ matches: false });

const { createMockStore, CATALOG } = await import('../store/mock.js');
const { createApp } = await import('../ui/app.js');
const { mountPartyBar } = await import('../ui/party-bar.js');
const { mountDrawer } = await import('../ui/drawer.js');
const { createSaveCard } = await import('../ui/save.js');
const { cleanUrl } = await import('../lib/product.js');

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const root = () => document.getElementById('app');
const text = () => root().textContent;
const click = async (label, scope = root()) => {
  const el = [...scope.querySelectorAll('button, a')].find((b) => b.textContent.trim().startsWith(label));
  assert.ok(el, `button "${label}" not found. Screen says: ${text().slice(0, 200)}`);
  el.click();
  await tick();
};
const type = (name, value) => {
  const el = root().querySelector(`[name="${name}"]`);
  assert.ok(el, `field ${name} missing`);
  el.value = value;
};
const submit = async () => { root().querySelector('form').requestSubmit(); await tick(60); };

const apps = [];
afterEach(async () => { while (apps.length) await apps.pop().destroy(); root().replaceChildren(); document.getElementById('page').replaceChildren(); });

async function boot(opts = {}) {
  const store = createMockStore(opts.store);
  const routes = [];
  const app = createApp(root(), store, { onRoute: (r) => routes.push(r.name), ...opts.app });
  apps.push(app);
  await tick(60);
  return { store, app, routes };
}

test('first run: welcome, sign up, permissions, home', async () => {
  const { app } = await boot({ store: { signedIn: false } });
  assert.match(text(), /Shop together/);
  await click('Next'); assert.match(text(), /Save together/);
  await click('Next'); assert.match(text(), /Buy together/);
  await click('Get started');
  type('email', 'asha@example.com'); type('password', 'pass1234'); type('name', 'Asha');
  await submit();
  assert.match(text(), /Before you start/);
  await click('Continue');
  assert.match(text(), /Housewarming/);
  await app.destroy();
});

test('sign in rejects a weak password', async () => {
  const { app } = await boot({ store: { signedIn: false } });
  await click('Next'); await click('Next');
  await click('I already have an account');
  type('email', 'a@b.co'); type('password', '1');
  await submit();
  assert.match(text(), /at least 6/);
  await app.destroy();
});

test('home shows lists and the live party, then opens a list with items', async () => {
  const { app } = await boot();
  assert.match(text(), /Housewarming/); assert.match(text(), /Diwali gifts/);
  await click('Housewarming');
  assert.match(text(), /Linen napkins/); assert.match(text(), /Terracotta planter/);
  await app.destroy();
});

test('item: like, tag, discuss, claim, remove', async () => {
  const { app, store } = await boot();
  await click('Housewarming');
  await click('Pour-over');
  const like = () => root().querySelector('.like');
  const before = like().textContent;
  like().click(); await tick();
  assert.notEqual(like().textContent, before, 'like toggles');
  type('tag', 'urgent');
  await click('Add');
  assert.match(text(), /urgent/);
  type('text', 'Is this the right size?');
  await click('Post');
  assert.match(text(), /right size/);
  await click("I'll buy this");
  assert.match(text(), /Mark as bought/);
  await click('Mark as bought');
  assert.match(text(), /You bought this/);
  await app.destroy();
  void store;
});

test('start a party on a list without one, then see the invite code', async () => {
  const { app } = await boot();
  app.go('startParty', {}, 'root'); await tick();
  assert.match(text(), /Diwali gifts/);
  type('label', 'Diya run');
  await submit();
  assert.match(text(), /Go live and start browsing/);
  assert.ok(/[a-z0-9]{10}/.test(root().querySelector('.bigcode').textContent));
  await click('Go live and start browsing');
  assert.match(text(), /Diya run/);
  await app.destroy();
});

test('join with a code lands on the joined screen', async () => {
  const { app } = await boot();
  app.go('join', {}, 'root'); await tick();
  type('code', 'nope'); await submit();
  assert.match(text(), /doesn.t match/);
  type('code', 'goa7trip01'); await submit();
  assert.match(text(), /You joined/);
  assert.match(text(), /Goa trip shopping/);
  await app.destroy();
});

test('cart: totals, split modes, store links', async () => {
  const { app } = await boot();
  await app.openList('l1', 'pa1');
  app.go('cart', {}, 'root'); await tick();
  assert.match(text(), /Check out at/);
  assert.match(text(), /hearthandco\.example/);
  assert.match(text(), /only works out the numbers/);
  await app.destroy();
});

test('activity feed counts unread and marks all read', async () => {
  const { app } = await boot();
  await app.openList('l1', 'pa1');
  app.go('notifications', {}, 'root'); await tick();
  assert.match(text(), /Priya|Arjun/);
  await click('Mark all as read');
  assert.equal(root().querySelectorAll('.event.new').length, 0);
  await app.destroy();
});

test('settings, profile, notification prefs, past parties', async () => {
  const { app } = await boot();
  app.go('settings', {}, 'root'); await tick();
  await click('Profile');
  type('name', 'Asha K'); await submit();
  assert.match(text(), /Saved/);
  app.go('notifPrefs', {}, 'root'); await tick();
  assert.match(text(), /Chat/);
  app.go('settings', {}, 'root'); await tick();
  await click('Past parties');
  assert.match(text(), /Diwali run/);
  await app.destroy();
});

test('ending the party needs a second tap and clears the live state', async () => {
  const { app } = await boot();
  await app.openList('l1', 'pa1');
  app.go('party', {}, 'root'); await tick();
  await click('End party');
  assert.match(text(), /Tap again/);
  await click('Tap again');
  assert.doesNotMatch(text(), /Tap again/);
  await app.destroy();
});

test('party bar: shows who is here, saves once, chats, and stops when the party ends', async () => {
  const store = createMockStore();
  const page = document.getElementById('page');
  const p = CATALOG.find((c) => c.slug === 'cotton-throw');
  const bar = await mountPartyBar({ store, listId: 'l1', partyId: 'pa1', parent: page, position: 'absolute', shadowMode: 'open', getProduct: () => ({ ...p }) });
  assert.ok(bar, 'bar mounts for a live party');
  const q = (sel) => bar.shadow.querySelector(sel);
  assert.match(bar.shadow.textContent, /Saturday shop/);
  [...bar.shadow.querySelectorAll('button')].find((b) => b.textContent.startsWith('Save item')).click();
  await tick(80);
  assert.match(bar.shadow.textContent, /Saved to your list/);
  [...bar.shadow.querySelectorAll('button')].find((b) => b.textContent.startsWith('Save item')).click();
  await tick(80);
  assert.match(bar.shadow.textContent, /Already on your list/);
  const ctx = await store.loadContext('l1', 'pa1');
  assert.equal(ctx.items.filter((i) => i.product.url === p.url).length, 1);
  [...bar.shadow.querySelectorAll('button')].find((b) => b.textContent.startsWith('Chat')).click();
  q('input').value = 'hello <b>team</b>';
  q('form').requestSubmit();
  await tick(80);
  assert.match(q('.log').textContent, /hello <b>team<\/b>/);
  assert.equal(q('.log b'), null, 'chat is text, never markup');
  store.demo.endLiveParty();
  await tick(400);
  assert.match(bar.shadow.textContent, /ended/);
  await bar.destroy();
});

test('party bar refuses to mount when signed out', async () => {
  const store = createMockStore({ signedIn: false });
  assert.equal(await mountPartyBar({ store, listId: 'l1', partyId: 'pa1', parent: document.getElementById('page'), getProduct: () => null }), null);
});

test('join with a list code (not a party code) lands on the list', async () => {
  const { app } = await boot();
  app.go('join', {}, 'root'); await tick();
  type('code', 'bday2list0'); await submit();
  assert.match(text(), /You joined Meera birthday/);
  await click('Open the list');
  assert.match(text(), /Linen|Brass/);
});

test('share screen shows the permanent code, and the owner can replace it', async () => {
  const { app } = await boot();
  await app.openList('l1', 'pa1');
  app.go('share', {}, 'root'); await tick();
  assert.match(text(), /h0use4rm1n/);
  assert.ok(root().querySelector('a[href^="https://wa.me/?text="]'), 'WhatsApp link');
  await click('Make a new code');
  assert.doesNotMatch(text(), /h0use4rm1n/);
  assert.match(text(), /New code made/);
});

test('share is not offered a reset to someone who does not own the list', async () => {
  const { app } = await boot();
  await app.openList('l2');
  app.go('share', {}, 'root'); await tick();
  assert.match(text(), /d1wa11g1ft/);
  assert.doesNotMatch(text(), /Make a new code/);
});

test('save card: pick a list, share it, and a saved list opens straight to sharing', async () => {
  const store = createMockStore();
  const p = { ...CATALOG.find((c) => c.slug === 'cotton-throw') };
  const card = createSaveCard({ store, getProduct: () => p });
  document.getElementById('page').append(card.el);
  await card.open();
  assert.match(card.el.textContent, /Housewarming/);
  const press = async (label) => { [...card.el.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label)).click(); await tick(60); };
  await press('Housewarming');
  assert.match(card.el.textContent, /Saved to Housewarming/);
  assert.equal((await store.loadContext('l1', 'pa1')).items.filter((i) => i.product.url === p.url).length, 1);
  await press('Share this list');
  assert.match(card.el.textContent, /h0use4rm1n/);
  await card.open();
  await press('Housewarming');
  assert.match(card.el.textContent, /Saved to Housewarming/, 'no duplicate save, goes to done view');
  assert.equal((await store.loadContext('l1', 'pa1')).items.filter((i) => i.product.url === p.url).length, 1);
});

test('save card: create a new list on the spot and save into it', async () => {
  const store = createMockStore();
  const p = { ...CATALOG.find((c) => c.slug === 'terracotta-planter') };
  const card = createSaveCard({ store, getProduct: () => p });
  document.getElementById('page').append(card.el);
  await card.open();
  card.el.querySelector('input[name="listName"]').value = 'Goa trip';
  card.el.querySelector('form').requestSubmit();
  await tick(120);
  assert.match(card.el.textContent, /Saved to Goa trip/);
  const lists = (await store.loadHome()).lists;
  const goa = lists.find((l) => l.name === 'Goa trip');
  assert.ok(goa && goa.invite_code.length === 10);
  assert.equal((await store.loadContext(goa.id, null)).items.length, 1);
});

test('save card asks for a name, and signed-out people are sent to sign in', async () => {
  const store = createMockStore();
  const card = createSaveCard({ store, getProduct: () => ({ ...CATALOG[0] }) });
  document.getElementById('page').append(card.el);
  await card.open();
  card.el.querySelector('form').requestSubmit();
  await tick(40);
  assert.match(card.el.textContent, /Give your list a name/);
  const out = createMockStore({ signedIn: false });
  const card2 = createSaveCard({ store: out, getProduct: () => ({ ...CATALOG[0] }) });
  await card2.open();
  assert.match(card2.el.textContent, /Sign in first/);
});

test('drawer: tab opens it, full view widens it, Escape closes it, Save pill shows on product pages', async () => {
  const store = createMockStore();
  const d = mountDrawer({ store, css: '', parent: document.getElementById('page'), shadowMode: 'open', getProduct: () => ({ ...CATALOG[2] }) });
  const q = (s) => d.shadow.querySelector(s);
  assert.ok(!d.isOpen());
  assert.equal(q('.pill-save').hidden, true);
  d.showSave(true);
  assert.equal(q('.pill-save').hidden, false);
  q('.tab').click(); await tick(80);
  assert.ok(d.isOpen());
  assert.match(q('.drawer .cm').textContent, /Housewarming/);
  assert.match(q('.drawer .cm').textContent, /Save this page/);
  [...d.shadow.querySelectorAll('.dhead button')].find((b) => b.textContent === 'Full view').click();
  assert.ok(q('.drawer').classList.contains('full') && q('.drawer .cm').classList.contains('wide'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(!d.isOpen() && !q('.drawer').classList.contains('full'));
  q('.pill-save').click(); await tick(100);
  assert.equal(q('.pop').hidden, false);
  assert.match(q('.pop').textContent, /Save to a list/);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(q('.pop').hidden, true);
  await d.destroy();
  assert.equal(document.getElementById('cartmates-drawer'), null);
});

test('cleanUrl matches the database tidy-up', () => {
  assert.equal(cleanUrl('https://WWW.Myntra.com/kurta/123/?utm_source=insta&color=blue#reviews'), 'https://www.myntra.com/kurta/123?color=blue');
  assert.equal(cleanUrl('https://a.com/p/?fbclid=x'), 'https://a.com/p');
  assert.equal(cleanUrl('https://a.com/'), 'https://a.com/');
});

test('sign up that needs email confirmation shows a clear check-your-email screen', async () => {
  const store = createMockStore({ signedIn: false });
  store.signUp = async () => ({ user: null, needsConfirm: true });
  const routes = [];
  const app = createApp(root(), store, { onRoute: (r) => routes.push(r.name) });
  apps.push(app);
  await tick(60);
  await click('Skip');
  assert.match(text(), /Create a password/);
  assert.equal(root().querySelector('[name="password"]').getAttribute('aria-label'), 'Create a password');
  type('email', 'asha@example.com'); type('password', 'pass1234'); type('name', 'Asha');
  await submit();
  assert.match(text(), /Check your email/);
  assert.match(text(), /asha@example\.com/);
  await click('Go to sign in');
  assert.match(text(), /Welcome back/);
});
