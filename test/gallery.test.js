import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractProduct, bigImage } from '../lib/product.js';

const li = (label, img, on) => `<li class="dimension-value-list-item-square-image"><input class="a-button-input" aria-checked="${on}"><img alt="${label}" src="https://m.media-amazon.com/images/I/${img}._SS64_.jpg"></li>`;
const page = `<html><head><title>Bag - Buy Bag Online at Low Price in India - Amazon.in</title></head><body>
<h1 id="title">Bag</h1>
<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">₹1,979.00</span></span></div>
<img id="landingImage" src="https://m.media-amazon.com/images/I/81eK._SX679_.jpg" data-old-hires="https://m.media-amazon.com/images/I/81eK._SL1500_.jpg">
<div id="altImages"><ul><li class="imageThumbnail"><img src="https://m.media-amazon.com/images/I/51FQ._SS40_.jpg"></li>
<li class="imageThumbnail"><img src="https://m.media-amazon.com/images/I/61IL.SS40_BG85,85,85_BR-120_PKdp-play-icon-overlay__.jpg"></li>
<li class="imageThumbnail"><img src="https://m.media-amazon.com/images/I/510P._SS40_.jpg"></li></ul></div>
<div id="inline-twister-row-color_name"><ul>${li('White', '51FQ', true)}${li('Black', '41al', false)}${li('Navy Blue', '41bS', false)}</ul></div>
</body></html>`;

test('collects every colour option with pictures, and the gallery', () => {
  const dom = new JSDOM(page, { url: 'https://www.amazon.in/dp/B09TPMQ4CQ' });
  const p = extractProduct(dom.window.document, dom.window.location);
  assert.equal(p.price, 1979);
  assert.equal(p.options.length, 1);
  assert.equal(p.options[0].name, 'Colour');
  assert.deepEqual(p.options[0].values.map((v) => v.label), ['White', 'Black', 'Navy Blue']);
  assert.deepEqual(p.options[0].values.map((v) => v.selected), [true, false, false]);
  assert.ok(p.options[0].values[1].image.includes('41al'));
  assert.equal(p.variant, 'Colour: White');
  assert.equal(p.images.length, 3); // main + two thumbs, the video thumbnail is skipped
  assert.ok(p.images[0].includes('81eK') && p.images[0].includes('_SL800_'));
  assert.equal(p.image_url, p.images[0]);
});

test('bigImage swaps the size tag', () => {
  assert.equal(bigImage('https://x/I/a._SS64_.jpg'), 'https://x/I/a._SL800_.jpg');
  assert.equal(bigImage('https://x/plain.jpg'), 'https://x/plain.jpg');
});

test('drop-down choices become options', () => {
  const dom = new JSDOM('<h1>Tee</h1><label for="s">Size</label><select id="s"><option>Select size</option><option>S</option><option selected>M</option><option>L</option></select>', { url: 'https://shop.example/p/tee' });
  const p = extractProduct(dom.window.document, dom.window.location);
  assert.deepEqual(p.options[0].values.map((v) => v.label), ['S', 'M', 'L']);
  assert.equal(p.variant, 'Size: M');
});

test('save card: pick another colour, picture follows, and it is saved with all options', async () => {
  const dom = new JSDOM('<body></body>', { url: 'https://www.amazon.in/' });
  globalThis.document = dom.window.document; globalThis.window = dom.window; globalThis.Node = dom.window.Node; globalThis.HTMLElement = dom.window.HTMLElement;
  const { createSaveCard } = await import('../ui/save.js');
  let saved = null;
  const product = { url: 'https://www.amazon.in/dp/X', title: 'Bag', brand: null, price: 1979, currency: 'INR', image_url: 'https://x/I/a._SL800_.jpg',
    images: ['https://x/I/a._SL800_.jpg', 'https://x/I/b._SL800_.jpg'], variant: 'Colour: White',
    options: [{ name: 'Colour', values: [{ label: 'White', image: 'https://x/I/w._SS64_.jpg', selected: true }, { label: 'Black', image: 'https://x/I/k._SS64_.jpg', selected: false }] }] };
  const store = { getUser: async () => ({ id: 'u', preferred_currency: 'INR' }), loadHome: async () => ({ lists: [{ id: 'l1', name: 'Gifts', role: 'owner' }] }), savedIn: async () => [],
    getActive: async () => null, saveItem: async (l, p, prod) => { saved = prod; } };
  // A colour already chosen on the page is saved as is: no pickers on the card, options kept for the item screen.
  const chosen = createSaveCard({ store, getProduct: () => product });
  await chosen.open();
  assert.equal(chosen.el.querySelectorAll('.opt').length, 0);
  [...chosen.el.querySelectorAll('button.rowcard')][0].click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(saved.variant, 'Colour: White');
  assert.equal(saved.options[0].values.length, 2);
  // Nothing chosen yet: the card offers the pickers.
  const open = { ...product, variant: null };
  const card = createSaveCard({ store, getProduct: () => open });
  await card.open();
  const opts = [...card.el.querySelectorAll('.opt')];
  assert.equal(opts.length, 2);
  opts[1].click();
  assert.ok(card.el.querySelectorAll('.opt')[1].getAttribute('aria-pressed') === 'true');
  assert.equal(card.state.product.variant, 'Colour: Black');
  assert.ok(card.state.product.image_url.includes('k._SL800_'));
  [...card.el.querySelectorAll('button.rowcard')][0].click();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(saved.options[0].values.length, 2);
  assert.equal(saved.variant, 'Colour: Black');
});
