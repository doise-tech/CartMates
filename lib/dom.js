// Tiny element builder. Everything that comes from other people (titles, names, chat)
// goes through text nodes, never innerHTML, so shared data can't inject markup.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el, kid) {
  if (kid == null || kid === false) return;
  if (Array.isArray(kid)) return kid.forEach((k) => append(el, k));
  el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
}

// Only allow http(s) links and images from shared data.
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

const PALETTE = ['#93643a', '#b0483a', '#3e7d4f', '#6b5b95', '#3b6a8a', '#7d6218', '#a0507a'];

// People don't pick an avatar colour, so derive a steady one from their id.
export function colorFor(id) {
  let n = 0;
  for (const ch of String(id || '')) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[n % PALETTE.length];
}

export function avatar(person, size = 24, state = '') {
  const p = person || {};
  const url = safeUrl(p.avatar_url);
  const common = { class: `avatar ${state}`.trim(), title: p.display_name || 'Member', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;background:${colorFor(p.id)}` };
  if (url) return h('span', common, h('img', { src: url, alt: '', referrerpolicy: 'no-referrer' }));
  return h('span', common, initials(p.display_name));
}

export function ago(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.round(hr / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// Product picture. Real items use image_url. The web preview uses coloured shapes instead.
export function thumb(product, cls = 'thumb') {
  const src = safeUrl(product?.image_url);
  if (src) return h('img', { class: cls, src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  const hue = /^#[0-9a-f]{3,8}$/i.test(product?.hue || '') ? product.hue : '';
  return h('div', { class: `${cls} tile ${/^[a-z]+$/.test(product?.shape || '') ? product.shape : ''}`, style: hue ? `background:${hue}` : '' });
}

export function heart(filled = false) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M12 20.5s-7.5-4.7-9.5-9.4C1.1 7.7 3 4.8 6.2 4.8c2 0 3.6 1.1 5.8 3.2 2.2-2.1 3.8-3.2 5.8-3.2 3.2 0 5.1 2.9 3.7 6.3-2 4.7-9.5 9.4-9.5 9.4z');
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}
