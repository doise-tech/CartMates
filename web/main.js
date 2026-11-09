import { h, thumb } from '../lib/dom.js';
import { money } from '../lib/split.js';
import { createMockStore, CATALOG, SHOP } from '../store/mock.js';
import { mountDrawer } from '../ui/drawer.js';
import { mountPartyBar } from '../ui/party-bar.js';
import css from '../ui/styles.css';

// The web preview: a made-up shop with the real Cartmates side drawer on it, and a map that jumps to every screen.
// It runs the same mountDrawer, createApp and mountPartyBar the extension runs, on an in-memory store.

const store = createMockStore({ signedIn: true });
const d = store.demo;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- the shop page

let product = CATALOG.find((p) => p.slug === 'cotton-throw');
const shop = $('shop');
const urlBar = $('url');

function drawShop() {
  urlBar.textContent = product.url.replace('https://', '');
  shop.replaceChildren(
    h('div', { class: 'shop-nav' }, h('b', { class: 'shop-logo' }, 'Hearth & Co.'), h('span', null, 'Kitchen'), h('span', null, 'Living'), h('span', null, 'Gifts')),
    h('div', { class: 'shop-main' },
      thumb(product, 'shop-pic'),
      h('div', { class: 'shop-info' },
        h('span', { class: 'shop-eyebrow' }, product.brand),
        h('h2', null, product.title),
        h('p', { class: 'shop-price' }, money(product.price, 'INR')),
        product.variant ? h('p', { class: 'shop-copy' }, product.variant) : null,
        h('p', { class: 'shop-copy' }, 'A made-up product on a made-up shop. In the real extension this is any shopping page you open.'),
        h('button', { class: 'shop-buy', type: 'button', onClick: () => (bar ? bar.toast('This is a demo shop. Use Save item in the Cartmates bar.') : drawer.openSave()) }, 'Add to bag'))),
    h('div', { class: 'shop-more' },
      h('span', { class: 'shop-eyebrow' }, 'More from the shop'),
      h('div', { class: 'shop-row' }, CATALOG.map((p) => h('button', {
        class: 'shop-card', type: 'button', 'aria-current': String(p.slug === product.slug), onClick: () => { product = p; drawShop(); },
      }, thumb(p, 'shop-mini'), h('span', null, p.title))))),
  );
}

// ---------------------------------------------------------------- party bar, remounted when you join or leave a party

let bar = null;
let token = 0;
async function syncBar(active) {
  const mine = ++token;
  bar?.destroy();
  bar = null;
  if (!active?.partyId) return;
  const next = await mountPartyBar({
    store, listId: active.listId, partyId: active.partyId, parent: $('stage-shop'), position: 'absolute', shadowMode: 'open',
    getProduct: () => ({ url: product.url, title: product.title, brand: product.brand, image_url: null, price: product.price, currency: 'INR', hue: product.hue, shape: product.shape }),
    onGone: () => { if (mine === token) bar = null; },
  });
  if (mine !== token) next?.destroy();
  else bar = next;
}

// ---------------------------------------------------------------- the drawer

let current = '';
const drawer = mountDrawer({
  store, css, parent: $('stage-shop'), position: 'absolute', shadowMode: 'open',
  getProduct: () => ({ url: product.url, title: product.title, brand: product.brand, image_url: null, price: product.price, currency: 'INR', variant: product.variant ?? null, hue: product.hue, shape: product.shape }),
  appOpts: {
    hint: 'Preview tip: the code goa7trip01 joins a party, and bday2list0 joins a list.',
    onActive: (a) => syncBar(a),
    onRoute: (r) => { current = r.name; markCurrent(); },
  },
});
const app = drawer.app();
drawer.showSave(true); // this pretend shop page is always a product page
const inDrawer = (sel) => drawer.shadow.querySelector(sel);
const pressIn = async (scope, label) => {
  const b = [...scope.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(label) && !x.disabled);
  b?.click();
  await new Promise((r) => setTimeout(r, 250));
  return !!b;
};

// ---------------------------------------------------------------- flow map

async function visit(name, o = {}) {
  const wantSigned = o.signed !== false;
  if (o.fresh || wantSigned !== d.signedIn()) {
    d.resetData({ keepSignedIn: wantSigned });
    if (wantSigned && !d.signedIn()) d.signInQuick();
    await app.restart();
  }
  if (!o.keepClosed) drawer.open();
  if (o.list) {
    if (o.party) {
      const a = { listId: o.list, partyId: o.party };
      await store.setActive(a);
      app.state().active = a;
      syncBar(a);
    }
    await app.openList(o.list, o.party);
  }
  if (o.itemTitle) {
    const ctx = await store.loadContext('l1', 'pa1');
    const it = ctx.items.find((i) => i.product.title.includes(o.itemTitle));
    if (!app.state().ctx) await app.openList('l1', 'pa1');
    app.go('list', {}, 'root');
    await app.openItem(it.id);
    return;
  }
  if (['home', 'party', 'cart'].includes(name)) await app.tab(name);
  else app.go(name, {}, 'root');
  if (o.after) await o.after();
}

const live = { list: 'l1', party: 'pa1' };
const submitCode = (code) => async () => {
  const form = drawer.shadow.querySelector('form');
  form.elements.code.value = code;
  form.requestSubmit();
};
// Open the Save card on the shop page the way a person would, then press things in it.
const saveCard = (...labels) => async () => {
  await drawer.openSave();
  await new Promise((r) => setTimeout(r, 250));
  for (const l of labels) await pressIn(drawer.saveCard.el, l);
};
const FLOWS = [
  { name: 'Get started', note: 'Welcome slides, account, permissions', steps: [
    { label: 'Welcome', route: 'welcome', go: () => visit('welcome', { signed: false, fresh: true, after: () => { app.state().slide = 0; app.render(); } }) },
    { label: 'Create account', route: 'signup', go: () => visit('signup', { signed: false }) },
    { label: 'Sign in', route: 'signin', go: () => visit('signin', { signed: false }) },
    { label: 'Permissions', route: 'permissions', go: () => visit('permissions') },
    { label: 'Your lists', route: 'home', go: () => visit('home') },
  ] },
  { name: 'The side drawer', note: 'A tab on every page. Slides out, grows to full view', steps: [
    { label: 'Edge tab', route: 'tab', go: async () => { drawer.close(); drawer.closeSave(); } },
    { label: 'Side drawer', route: 'home', go: () => visit('home', { fresh: true }) },
    { label: 'Full view', route: 'list', go: () => visit('list', { ...live, after: () => drawer.setFull(true) }) },
  ] },
  { name: 'Save from any shop', note: 'Like pinning to a board: pick a list, or make one on the spot', steps: [
    { label: 'Save button', route: 'save', go: async () => { d.resetData(); await app.restart(); drawer.close(); drawer.closeSave(); } },
    { label: 'Pick a list', route: 'save', go: saveCard() },
    { label: 'New list here', route: 'save', go: async () => { await saveCard()(); const box = drawer.saveCard.el.querySelector('input[name="listName"]'); if (box) { box.value = 'Goa trip'; box.focus(); } } },
    { label: 'Saved', route: 'save', go: saveCard('Housewarming') },
    { label: 'Share it', route: 'save', go: saveCard('Housewarming', 'Share this list') },
  ] },
  { name: 'Share a list', note: 'Permanent invite code, message, WhatsApp', steps: [
    { label: 'New list', route: 'newList', go: () => visit('newList') },
    { label: 'Share sheet', route: 'share', go: () => visit('share', { list: 'l1', party: 'pa1' }) },
    { label: 'Join with a list code', route: 'joined', go: () => visit('join', { fresh: true, after: submitCode('bday2list0') }) },
  ] },
  { name: 'Start a party', note: 'Pick a list, invite friends, go live', steps: [
    { label: 'Pick a list', route: 'startParty', go: () => visit('startParty') },
    { label: 'Invite friends', route: 'invite', go: () => visit('invite', live) },
    { label: 'Party hub', route: 'party', go: () => visit('party', live) },
  ] },
  { name: 'Join a party', note: 'Use a party invite code a friend sent', steps: [
    { label: 'Enter a code', route: 'join', go: () => visit('join', { fresh: true }) },
    { label: 'You joined', route: 'joined', go: () => visit('join', { fresh: true, after: submitCode('goa7trip01') }) },
  ] },
  { name: 'Shop together', note: 'The live bar on the shop page: presence, save, chat', steps: [
    { label: 'Party hub', route: 'party', go: () => visit('party', live) },
    { label: 'Chat in the bar', route: 'party', go: () => visit('party', { ...live, keepClosed: true, after: () => { drawer.close(); bar?.shadow.querySelector('button[aria-expanded="false"]')?.click(); } }) },
  ] },
  { name: 'Decide together', note: 'Shared list, likes, tags, talk about an item', steps: [
    { label: 'Shared list', route: 'list', go: () => visit('list', live) },
    { label: 'Like and tag', route: 'item', go: () => visit('item', { ...live, itemTitle: 'Terracotta' }) },
    { label: 'Discuss an item', route: 'item', go: () => visit('item', { ...live, itemTitle: 'Linen' }) },
    { label: 'Claim an item', route: 'item', go: () => visit('item', { ...live, itemTitle: 'Pour-over' }) },
  ] },
  { name: 'Review and check out', note: 'Cart, who pays what, store links. No payments here.', steps: [
    { label: 'Cart and split', route: 'cart', go: () => visit('cart', live) },
  ] },
  { name: 'Wrap up', note: 'End the party, look back', steps: [
    { label: 'End the party', route: 'party', go: () => visit('party', { ...live, after: () => { app.state().confirmEnd = true; app.render(); } }) },
    { label: 'Past parties', route: 'history', go: () => visit('history', { after: async () => { app.state().history = await store.loadHistory(); app.render(); } }) },
  ] },
  { name: 'Stay in the loop', note: 'Activity feed, settings, profile', steps: [
    { label: 'Activity', route: 'notifications', go: () => visit('notifications', live) },
    { label: 'Settings', route: 'settings', go: () => visit('settings') },
    { label: 'Profile', route: 'profile', go: () => visit('profile') },
    { label: 'Notification settings', route: 'notifPrefs', go: () => visit('notifPrefs') },
  ] },
];
const FLAT = FLOWS.flatMap((f, fi) => f.steps.map((s, si) => ({ ...s, fi, si })));
let at = -1;
const buttons = [];

async function jump(i) {
  at = (i + FLAT.length) % FLAT.length;
  try { await FLAT[at].go(); } catch (e) { say(`That step hit a snag: ${e.message}`); }
  markCurrent();
  const s = FLAT[at];
  $('where').textContent = `${FLOWS[s.fi].name}, step ${s.si + 1} of ${FLOWS[s.fi].steps.length}: ${s.label}`;
}

function markCurrent() {
  buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === at)));
}

function drawFlows() {
  let n = 0;
  $('flows').replaceChildren(...FLOWS.map((f, fi) => h('section', { class: 'flow' },
    h('h3', null, h('span', { class: 'flow-n' }, fi + 1), f.name),
    h('p', null, f.note),
    h('ol', null, f.steps.map((s) => {
      const i = n++;
      const b = h('button', { type: 'button', onClick: () => jump(i) }, s.label);
      buttons[i] = b;
      return h('li', null, b);
    })))));
}

// ---------------------------------------------------------------- friends and controls

function say(text) { $('says').textContent = text; }
function simulators() {
  const sims = [
    ['Priya saves an item', 'friendSaves'], ['Arjun upvotes an item', 'friendReacts'], ['Priya comments on an item', 'friendComments'], ['Priya sends a message', 'friendChats'],
    ['Arjun claims from the cart', 'friendClaims'], ['A friend joins', 'friendJoins'],
  ];
  $('sims').replaceChildren(...sims.map(([label, fn]) => h('button', { type: 'button', onClick: () => say(d[fn]()) }, label)));
}

$('prev').addEventListener('click', () => jump(at <= 0 ? FLAT.length - 1 : at - 1));
$('next').addEventListener('click', () => jump(at + 1));
$('reset').addEventListener('click', async () => {
  d.resetData();
  await app.restart();
  at = -1; markCurrent(); $('where').textContent = 'Reset. Pick any step on the left.';
  say('Demo data reset');
});
$('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  drawer.setTheme(root.dataset.theme);
  $('theme').setAttribute('aria-pressed', String(!dark));
});

drawShop();
drawFlows();
simulators();
