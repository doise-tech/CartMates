// Best-effort product details from the page the person is looking at.
// Order: JSON-LD, then Open Graph / product meta, then the page title.

const meta = (doc, selector) => doc.querySelector(selector)?.getAttribute('content')?.trim() || null;

export function parsePrice(value) {
  if (value == null) return null;
  // Drop everything before the first digit ("Rs. ", "USD ", "$") so a currency dot isn't read as a decimal.
  const cleaned = String(value).replace(/^[^0-9]*/, '').replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;
  // "1,299.50" and "1.299,50" both appear in the wild.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const normalized = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

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
  if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) return node;
  return findProduct(node['@graph'], depth + 1);
}

function fromJsonLd(doc) {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const product = findProduct(JSON.parse(script.textContent));
      if (!product) continue;
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const image = Array.isArray(product.image) ? product.image[0] : product.image;
      return {
        title: product.name || null,
        brand: typeof product.brand === 'string' ? product.brand : product.brand?.name || null,
        image_url: typeof image === 'string' ? image : image?.url || null,
        price: parsePrice(offer?.price ?? offer?.lowPrice),
        currency: offer?.priceCurrency || null,
      };
    } catch {
      // Malformed JSON-LD is common. Skip it.
    }
  }
  return null;
}

const asCurrency = (v) => (/^[A-Za-z]{3}$/.test(v || '') ? v.toUpperCase() : null);
const asUrl = (v, base) => {
  try {
    return v ? new URL(v, base).href : null;
  } catch {
    return null;
  }
};

export function extractProduct(doc = document, loc = location) {
  const ld = fromJsonLd(doc) || {};
  const title = ld.title || meta(doc, 'meta[property="og:title"]') || doc.title || loc.hostname;
  const price = ld.price ?? parsePrice(meta(doc, 'meta[property="product:price:amount"]') || meta(doc, 'meta[property="og:price:amount"]'));
  const currency = asCurrency(ld.currency) || asCurrency(meta(doc, 'meta[property="product:price:currency"]')) || asCurrency(meta(doc, 'meta[property="og:price:currency"]'));
  return {
    url: loc.href,
    title: String(title).slice(0, 300),
    brand: ld.brand ? String(ld.brand).slice(0, 120) : meta(doc, 'meta[property="product:brand"]'),
    image_url: asUrl(ld.image_url || meta(doc, 'meta[property="og:image"]'), loc.href),
    price,
    currency: price == null ? null : currency,
  };
}
