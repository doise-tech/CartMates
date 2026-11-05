import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractProduct, isProductPage, variantText, currencyFromText } from '../lib/product.js';

const page = (html, url) => {
  const dom = new JSDOM(html, { url });
  return { doc: dom.window.document, loc: dom.window.location };
};

test('Amazon-style page: clean name, brand, price, colour, picture and a stable link', () => {
  const { doc, loc } = page(`<!doctype html><title>Funk For Hire Women Printed White and Brown 15.6 inch Laptop Handbag Sling Bag - Buy Funk For Hire Online at Low Price in India - Amazon.in</title>
    <link rel="canonical" href="https://www.amazon.in/Funk-Hire-Sling-Bag/dp/B0TEST123">
    <span id="productTitle">  Funk For Hire Women Printed White and Brown 15.6 inch Laptop Handbag Sling Bag </span>
    <a id="bylineInfo">Visit the Funk For Hire Store</a>
    <div id="corePrice_feature_div"><span class="a-price a-text-price"><span class="a-offscreen">₹5,000</span></span>
      <span class="a-price"><span class="a-offscreen">₹1,979</span></span></div>
    <div id="variation_color_name"><span>Colour: </span><span class="selection">White</span></div>
    <div id="variation_size_name"><span class="selection">15.6 inch</span></div>
    <img id="landingImage" src="https://m.media-amazon.com/images/I/small.jpg" data-old-hires="https://m.media-amazon.com/images/I/big.jpg">`,
  'https://www.amazon.in/dp/B0TEST123/ref=sr_1_1?crid=abc&keywords=bag');
  const p = extractProduct(doc, loc);
  assert.equal(p.title, 'Funk For Hire Women Printed White and Brown 15.6 inch Laptop Handbag Sling Bag');
  assert.equal(p.brand, 'Funk For Hire');
  assert.equal(p.price, 1979);
  assert.equal(p.currency, 'INR');
  assert.equal(p.variant, 'Colour: White · Size: 15.6 inch');
  assert.equal(p.image_url, 'https://m.media-amazon.com/images/I/big.jpg');
  assert.equal(p.url, 'https://www.amazon.in/Funk-Hire-Sling-Bag/dp/B0TEST123');
  assert.ok(isProductPage(doc));
});

test('plain shop page: heading as the name, price near it (not the crossed-out one), labelled options', () => {
  const { doc, loc } = page(`<!doctype html><title>Blue Linen Shirt | Buy Shirts Online | Weave & Co</title>
    <meta property="og:image" content="/img/shirt.jpg">
    <h1>Blue Linen Shirt</h1>
    <del><span class="price">Rs. 2,599.00</span></del>
    <span class="product-price">Rs. 1,299.00</span>
    <div><span>Colour: Navy</span></div><div><label>Size: M</label></div>
    <div class="note">Size: pick one of the below sizes please</div>`, 'https://weave.example/shirts/blue-linen?utm_source=ig');
  const p = extractProduct(doc, loc);
  assert.equal(p.title, 'Blue Linen Shirt');
  assert.equal(p.price, 1299);
  assert.equal(p.currency, 'INR');
  assert.equal(p.variant, 'Colour: Navy · Size: M');
  assert.equal(p.image_url, 'https://weave.example/img/shirt.jpg');
});

test('structured data wins: JSON-LD name, price, currency, colour, brand', () => {
  const { doc, loc } = page(`<!doctype html><title>x</title><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Oak Desk","brand":{"@type":"Brand","name":"Timber"},"color":"Natural oak","image":["https://c.example/desk.jpg"],
     "offers":{"@type":"Offer","price":"14999.00","priceCurrency":"INR"}}</script>`, 'https://shop.example/desk');
  const p = extractProduct(doc, loc);
  assert.deepEqual([p.title, p.brand, p.price, p.currency, p.variant, p.image_url], ['Oak Desk', 'Timber', 14999, 'INR', 'Colour: Natural oak', 'https://c.example/desk.jpg']);
});

test('drop-downs and ticked options are read, placeholders are not', () => {
  const { doc, loc } = page(`<!doctype html><title>Sneaker</title><h1>Road Sneaker</h1>
    <label for="s">Size</label><select id="s"><option>Select a size</option><option selected>UK 8</option></select>
    <select aria-label="Colour"><option selected>Choose colour</option><option>Red</option></select>
    <input type="radio" name="color" id="c1" checked><label for="c1">Midnight</label>`, 'https://shoes.example/s');
  assert.equal(extractProduct(doc, loc).variant, 'Size: UK 8 · Color: Midnight');
});

test('a page with no product details still returns something usable', () => {
  const { doc, loc } = page('<!doctype html><title>Some page</title><p>Hello</p>', 'https://example.com/about');
  const p = extractProduct(doc, loc);
  assert.equal(p.title, 'Some page');
  assert.equal(p.price, null);
  assert.equal(p.currency, null);
  assert.equal(p.variant, null);
  assert.ok(!isProductPage(doc));
});

test('helpers', () => {
  assert.equal(currencyFromText('₹1,979'), 'INR');
  assert.equal(currencyFromText('$12.50'), 'USD');
  assert.equal(currencyFromText('12.50 €'), 'EUR');
  assert.equal(currencyFromText('12'), null);
  assert.equal(variantText({ Colour: 'Red', Size: 'M' }), 'Colour: Red · Size: M');
  assert.equal(variantText({}), null);
});
