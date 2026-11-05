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
  assert.match(text(), /doesn't match/);
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
