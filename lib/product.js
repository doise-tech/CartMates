// Best-effort product details from the page the person is looking at.
// Order of trust: structured data on the page (JSON-LD, product meta tags), then known shop layouts
// (Amazon), then general rules that work on most shops (the page's main heading, the price near it,
// the biggest picture, "Colour: White" style labels). Nothing leaves the page until Save is pressed.

const meta = (doc, selector) => doc.querySelector(selector)?.getAttribute('content')?.trim() || null;
const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const jsdom = (doc) => /jsdom/i.test(doc.defaultView?.navigator?.userAgent || '');
const visible = (el, doc) => jsdom(doc) || !el.getClientRects || el.getClientRects().length > 0;

export function parsePrice(value) {
  if (value == null) return null;
  // Drop everything before the first digit ("Rs. ", "USD ", "$") so a currency dot isn't read as a decimal.
  const cleaned = String(value).replace(/^[^0-9]*/, '').replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;
  // "1,299.50", "1.299,50", "1,979" (thousands) and "12,50" (decimal comma) all appear in the wild.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized;
  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const decimalComma = cleaned.split(',').length === 2 && /,\d{1,2}$/.test(cleaned);
    normalized = decimalComma ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastDot !== -1 && (cleaned.split('.').length > 2 || /\.\d{3}$/.test(cleaned))) {
    normalized = cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const SYMBOLS = [[/₹|\brs\.?\s*\d|\binr\b/i, 'INR'], [/\bUS\$|\$|\busd\b/i, 'USD'], [/€|\beur\b/i, 'EUR'], [/£|\bgbp\b/i, 'GBP'], [/\baed\b/i, 'AED'], [/\bsgd\b/i, 'SGD'], [/\bcad\b|\bC\$/i, 'CAD'], [/\baud\b|\bA\$/i, 'AUD']];
export function currencyFromText(t) {
  for (const [re, code] of SYMBOLS) if (re.test(t || '')) return code;
  return null;
}
const asCurrency = (v) => (/^[A-Za-z]{3}$/.test(v || '') ? v.toUpperCase() : null);
const asUrl = (v, base) => {
  try {
    const u = v ? new URL(v, base) : null;
    return u && /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- structured data

function findProduct(node, depth = 0) {
  if (!node || depth > 5) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProduct(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const type = node['@type'];
  if (type === 'Product' || type === 'ProductGroup' || (Array.isArray(type) && (type.includes('Product') || type.includes('ProductGroup')))) return node;
  return findProduct(node['@graph'], depth + 1);
}

const str = (v) => (typeof v === 'string' ? v : v?.name || null);

function fromJsonLd(doc) {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const product = findProduct(JSON.parse(script.textContent));
      if (!product) continue;
      const first = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const offer = first?.offers ? (Array.isArray(first.offers) ? first.offers[0] : first.offers) : first;
      const image = Array.isArray(product.image) ? product.image[0] : product.image;
      const variants = {};
      if (product.color) variants.Colour = str(product.color);
      if (product.size) variants.Size = str(product.size);
      if (product.material) variants.Material = str(product.material);
      return {
        title: product.name || null,
        brand: str(product.brand),
        image_url: typeof image === 'string' ? image : image?.url || null,
        images: (Array.isArray(product.image) ? product.image : [product.image]).map((x) => (typeof x === 'string' ? x : x?.url)).filter(Boolean),
        price: parsePrice(offer?.price ?? offer?.lowPrice),
        currency: offer?.priceCurrency || null,
        variants,
      };
    } catch {
      // Malformed JSON-LD is common. Skip it.
    }
  }
  return null;
}

export function isProductPage(doc = document) {
  if (fromJsonLd(doc)) return true;
  if (/product/i.test(meta(doc, 'meta[property="og:type"]') || '')) return true;
  if (meta(doc, 'meta[property="product:price:amount"]') || meta(doc, 'meta[property="og:price:amount"]')) return true;
  return !!doc.querySelector('#productTitle, [itemtype*="schema.org/Product"], [itemprop="price"]');
}

// ---------------------------------------------------------------- the page itself

const STORE_TAIL = /\s*[|:–—-]\s*(?:buy\b|shop\b|online\b|official\b).*$/i;

function pageTitle(doc, loc) {
  const h1 = [...doc.querySelectorAll('h1')].find((el) => visible(el, doc) && text(el).length >= 4 && text(el).length <= 250);
  const raw = doc.title || '';
  if (h1 && raw.toLowerCase().includes(text(h1).toLowerCase().slice(0, 30))) return text(h1);
  const og = meta(doc, 'meta[property="og:title"]');
  const t = og || raw || loc.hostname;
  return String(t).replace(STORE_TAIL, '').replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, '').trim() || t;
}

const BAD_PRICE_CONTEXT = /strike|mrp|\bwas\b|\bold\b|original|list-?price|compare|cross|saving|emi|per-?unit|unit-?price|deal-?badge|coupon|shipping|offer/i;

function pagePrice(doc) {
  const candidates = [];
  for (const sel of ['[itemprop="price"]', '[data-price]', '[class*="price" i], [id*="price" i]']) {
    for (const el of doc.querySelectorAll(sel)) candidates.push(el);
  }
  const seen = new Set();
  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (!visible(el, doc)) continue;
    const t = el.getAttribute('content') || el.getAttribute('data-price') || text(el);
    if (!t || t.length > 28) continue;
    if (!/\d/.test(t) || !(currencyFromText(t) || el.getAttribute('itemprop') === 'price' || el.hasAttribute('data-price'))) continue;
    let bad = false;
    for (let p = el, n = 0; p && n < 4; p = p.parentElement, n += 1) {
      if (/^(DEL|S|STRIKE)$/.test(p.tagName) || BAD_PRICE_CONTEXT.test(`${p.className || ''} ${p.id || ''}`) || /line-through/.test(p.style?.textDecoration || '')) { bad = true; break; }
    }
    if (bad) continue;
    const price = parsePrice(t);
    if (price != null && price > 0) return { price, currency: currencyFromText(t) };
  }
  return null;
}

function pageImage(doc, loc) {
  const og = asUrl(meta(doc, 'meta[property="og:image"]') || meta(doc, 'meta[name="twitter:image"]') || doc.querySelector('link[rel="image_src"]')?.getAttribute('href'), loc.href);
  if (og) return og;
  let best = null;
  let bestArea = 0;
  for (const img of doc.querySelectorAll('img')) {
    if (!visible(img, doc)) continue;
    const r = img.getBoundingClientRect?.();
    const w = img.naturalWidth || r?.width || 0;
    const h = img.naturalHeight || r?.height || 0;
    if (w < 180 || h < 180 || (r && r.top > 1400)) continue;
    if (/logo|sprite|icon|avatar|banner|badge/i.test(`${img.className} ${img.alt} ${img.src}`)) continue;
    if (w * h > bestArea) { bestArea = w * h; best = img; }
  }
  return best ? asUrl(best.currentSrc || best.src, loc.href) : null;
}

// "Colour: White", "Size: 15.6 inch": selected options shown as a label and a value.
const VARIANT_LABEL = /^(colou?r|size|style|pattern|material|capacity|storage|memory|flavou?r|fit|length|width|model|edition|configuration)\s*[:：]\s*(\S.{0,40})$/i;
const SKIP_VALUE = /^(select|choose|pick|please|--|none)/i;

function pageVariants(doc) {
  const out = {};
  const put = (label, value) => {
    const key = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
    const v = (value || '').replace(/\s+/g, ' ').trim();
    if (v && !SKIP_VALUE.test(v) && v.length <= 40 && !(key in out)) out[key] = v;
  };
  // Amazon's option pickers
  for (const [label, sels] of [
    ['Colour', ['#variation_color_name .selection', '#inline-twister-expanded-dimension-text-color_name']],
    ['Size', ['#variation_size_name .selection', '#inline-twister-expanded-dimension-text-size_name', '#native_dropdown_selected_size_name']],
    ['Style', ['#variation_style_name .selection', '#inline-twister-expanded-dimension-text-style_name']],
    ['Pattern', ['#variation_pattern_name .selection']],
  ]) {
    for (const s of sels) {
      const el = doc.querySelector(s);
      if (el) { put(label, el.tagName === 'SELECT' ? el.selectedOptions[0]?.textContent : text(el)); break; }
    }
  }
  // Drop-downs with a label next to them
  for (const sel of doc.querySelectorAll('select')) {
    const label = (sel.id && doc.querySelector(`label[for="${sel.id}"]`)?.textContent) || sel.getAttribute('aria-label') || sel.name || '';
    const m = /(colou?r|size|style|capacity|storage|flavou?r|fit)/i.exec(label);
    if (m && sel.selectedIndex > 0) put(m[1], sel.selectedOptions[0]?.textContent);
  }
  // Ticked radio buttons in a colour or size group
  for (const r of doc.querySelectorAll('input[type="radio"]:checked')) {
    const m = /(colou?r|size|style|capacity|storage|flavou?r|fit)/i.exec(`${r.name} ${r.id}`);
    const lab = (r.id && doc.querySelector(`label[for="${r.id}"]`)?.textContent) || r.value;
    if (m) put(m[1], lab);
  }
  // Plain "Label: value" text
  let n = 0;
  for (const el of doc.body?.querySelectorAll('span, div, label, li, p, dt') || []) {
    if (n++ > 4000) break;
    if (el.childElementCount > 3) continue;
    const t = text(el);
    if (t.length > 60 || t.length < 6) continue;
    const m = VARIANT_LABEL.exec(t);
    if (m && visible(el, doc)) put(m[1], m[2]);
  }
  return out;
}

// ---------------------------------------------------------------- pictures and every option

// Shops serve a tiny thumbnail by default (Amazon puts the size in the file name, "._SS40_.jpg").
// Ask for a bigger one of the same picture.
export function bigImage(u) {
  return u ? u.replace(/\._[^/.]*_(\.\w+)(\?.*)?$/, '._SL800_$1') : u;
}
const imageKey = (u) => String(u).replace(/\._[^/.]*_(\.\w+)(\?.*)?$/, '$1').replace(/\.SS\d+_[^/]*?(\.\w+)$/, '$1');

// The picture gallery: the main picture first, then the rest of the shop's own thumbnails.
function pageImages(doc, loc, main, ld) {
  const found = [main];
  for (const img of doc.querySelectorAll('#altImages img, #imageBlock_feature_div .imageThumbnail img')) {
    const src = img.getAttribute('src') || '';
    if (!src || /play-icon|PKdp|sprite|grey-pixel|transparent/i.test(src) || /video|play/i.test(img.alt || '')) continue;
    found.push(src);
  }
  for (const u of ld?.images || []) found.push(u);
  const seen = new Set();
  const out = [];
  for (const raw of found) {
    const u = asUrl(raw, loc.href);
    if (!u) continue;
    const k = imageKey(u);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(bigImage(u));
    if (out.length >= 8) break;
  }
  return out;
}

const DIM_NAMES = { color_name: 'Colour', size_name: 'Size', style_name: 'Style', pattern_name: 'Pattern', configuration: 'Configuration', material_type: 'Material' };
const DIM_WORDS = /(colou?r|size|style|capacity|storage|flavou?r|fit|pattern)/i;

// Everything the shop lets you choose between, e.g. Colour: White, Black, Navy Blue.
// Each value: { label, image, selected }.
function pageOptions(doc, loc, picked) {
  const dims = [];
  const add = (name, values) => {
    const seen = new Set();
    const list = values.filter((v) => v.label && v.label.length <= 40 && !SKIP_VALUE.test(v.label) && !seen.has(v.label.toLowerCase()) && seen.add(v.label.toLowerCase())).slice(0, 24);
    if (list.length < 2 || dims.some((d) => d.name === name)) return;
    const want = (picked?.[name] || '').toLowerCase();
    if (want) for (const v of list) v.selected = v.label.toLowerCase() === want;
    dims.push({ name, values: list });
  };

  // Amazon: one row per choice, each with a list of squares or buttons
  for (const row of doc.querySelectorAll('[id^="inline-twister-row-"]')) {
    const key = row.id.replace('inline-twister-row-', '');
    const name = DIM_NAMES[key] || key.replace(/_name$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const values = [...row.querySelectorAll('li[class*="dimension-value"], li.swatch-prototype, li[data-asin]')].map((li) => {
      const img = li.querySelector('img');
      const label = (img?.alt || li.getAttribute('title') || text(li)).replace(/^click to select\s*/i, '').trim();
      const on = !!li.querySelector('input[aria-checked="true"], input:checked') || /selected/.test(li.className);
      return { label, image: asUrl(img?.getAttribute('src'), loc.href), selected: on };
    });
    add(name, values);
  }
  // Older Amazon layout
  for (const [key, name] of Object.entries(DIM_NAMES)) {
    const lis = [...doc.querySelectorAll(`#variation_${key} li`)];
    if (lis.length) {
      add(name, lis.map((li) => {
        const img = li.querySelector('img');
        return { label: (img?.alt || li.getAttribute('title') || text(li)).replace(/^click to select\s*/i, '').trim(), image: asUrl(img?.getAttribute('src'), loc.href), selected: /selected/.test(li.className) };
      }));
    }
  }
  // Drop-downs
  for (const sel of doc.querySelectorAll('select')) {
    const label = (sel.id && doc.querySelector(`label[for="${sel.id}"]`)?.textContent) || sel.getAttribute('aria-label') || sel.name || '';
    const m = DIM_WORDS.exec(label);
    if (!m) continue;
    add(m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(), [...sel.options].map((o, i) => ({ label: o.textContent.replace(/\s+/g, ' ').trim(), image: null, selected: i === sel.selectedIndex && i > 0 })));
  }
  // Radio groups
  const groups = {};
  for (const r of doc.querySelectorAll('input[type="radio"]')) {
    const m = DIM_WORDS.exec(`${r.name} ${r.id}`);
    if (!m) continue;
    (groups[r.name] ||= { dim: m[1], items: [] }).items.push({ label: ((r.id && doc.querySelector(`label[for="${r.id}"]`)?.textContent) || r.value || '').replace(/\s+/g, ' ').trim(), image: null, selected: r.checked });
  }
  for (const g of Object.values(groups)) add(g.dim.charAt(0).toUpperCase() + g.dim.slice(1).toLowerCase(), g.items);

  return dims.slice(0, 4);
}

function brandFromPage(doc) {
  const by = text(doc.querySelector('#bylineInfo, [itemprop="brand"], .product-brand, [class*="brand-name" i]'));
  if (!by) return null;
  return by.replace(/^(visit the|brand:)\s*/i, '').replace(/\s*store$/i, '').trim().slice(0, 120) || null;
}

function canonicalUrl(doc, loc) {
  const c = asUrl(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || meta(doc, 'meta[property="og:url"]'), loc.href);
  try {
    // Only trust it if it is the same shop, so a page can't point us somewhere else.
    if (c && new URL(c).hostname.replace(/^www\./, '') === new URL(loc.href).hostname.replace(/^www\./, '')) return c;
  } catch {
    // fall through
  }
  return loc.href;
}

export function variantText(variants) {
  return Object.entries(variants || {}).map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 120) || null;
}

export function extractProduct(doc = document, loc = location) {
  const ld = fromJsonLd(doc) || {};
  const amazon = doc.querySelector('#productTitle');
  const title = text(amazon) || ld.title || pageTitle(doc, loc);

  let price = ld.price ?? parsePrice(meta(doc, 'meta[property="product:price:amount"]') || meta(doc, 'meta[property="og:price:amount"]'));
  let currency = asCurrency(ld.currency) || asCurrency(meta(doc, 'meta[property="product:price:currency"]')) || asCurrency(meta(doc, 'meta[property="og:price:currency"]'));
  if (price == null) {
    const az = doc.querySelector('#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen, .priceToPay .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');
    const found = az ? { price: parsePrice(text(az)), currency: currencyFromText(text(az)) } : pagePrice(doc);
    if (found?.price != null) { price = found.price; currency = currency || found.currency; }
  }

  const image = asUrl(doc.querySelector('#landingImage')?.getAttribute('data-old-hires') || doc.querySelector('#landingImage')?.getAttribute('src'), loc.href)
    || asUrl(ld.image_url, loc.href) || pageImage(doc, loc);

  const variants = { ...pageVariants(doc), ...Object.fromEntries(Object.entries(ld.variants || {}).filter(([, v]) => v)) };
  const options = pageOptions(doc, loc, variants);
  for (const d of options) {
    const on = d.values.find((v) => v.selected);
    if (on && !(d.name in variants)) variants[d.name] = on.label;
  }
  const images = pageImages(doc, loc, image, ld);

  return {
    images,
    options,
    url: canonicalUrl(doc, loc),
    title: String(title).slice(0, 300),
    brand: (ld.brand || brandFromPage(doc) || meta(doc, 'meta[property="product:brand"]') || null)?.toString().slice(0, 120) || null,
    image_url: images[0] || image,
    price,
    currency: price == null ? null : currency,
    variant: variantText(variants),
  };
}

// Same tidy-up the database does to product links (strip tracking, drop #fragment and a trailing slash),
// so "is this page already saved?" matches what is stored.
const TRACKING = /^(utm_.*|ref|ref_.*|fbclid|gclid|gclsrc|dclid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl|affid|aff_id|affiliate.*|tag|psc|smid|linkcode|ascsubtag|pd_rd_.*|pf_rd_.*|sr|qid|sprefix|crid|keywords|spm|scm)$/i;

export function cleanUrl(raw) {
  if (raw == null) return null;
  const url = String(raw).trim().split('#')[0];
  const q = url.indexOf('?');
  let base = q === -1 ? url : url.slice(0, q);
  const qs = q === -1 ? '' : url.slice(q + 1);
  const kept = qs ? qs.split('&').filter((part) => part && !TRACKING.test(part.split('=')[0])) : [];
  const host = base.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]+/)?.[0];
  if (host) base = host.toLowerCase() + base.slice(host.length);
  if (/:\/\/[^/]+\/.+\/$/.test(base)) base = base.slice(0, -1);
  return kept.length ? `${base}?${kept.join('&')}` : base;
}
