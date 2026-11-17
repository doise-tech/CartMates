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

// Up / down arrow for voting. Filled when it is your vote.
export function arrow(up = true, filled = false) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', up ? 'M12 4.5l8 10h-5.5v5h-5v-5H4z' : 'M12 19.5l-8-10h5.5v-5h5v5H20z');
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

export function bubbleIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M4 5h16v11H9l-5 4z');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

// Small line icons for the list header and the hanging Save tab.
function icon(paths, size = 18) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}
export const saveIcon = (size) => icon(['M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z', 'M12 8v5M9.5 10.5h5'], size);
export const partyIcon = (size) => icon(['M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11z', 'M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5', 'M16.5 5.2a3 3 0 0 1 0 5.6M18.5 14.8c1.5.6 2.5 2.3 2.5 5.2'], size);
export const shareIcon = (size) => icon(['M12 15V3.5M7.5 8 12 3.5 16.5 8', 'M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5'], size);
export const trashIcon = (size) => icon(['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l1 13h9l1-13', 'M10 11v5M14 11v5'], size);
export const linkIcon = (size) => icon(['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'], size);
export const confettiIcon = (size) => icon(['M4 20l4.5-12.5 8 8L4 20z', 'M13 4v2M18 9h2M16.5 5.5l1.2-1.2M19 15.5l1.5 1', 'M9.5 11.5l3 3'], size);

// The Cartmates mark: an editorial serif C with a cart handle and wheels. Takes the colour of the text around it.
export function logoMark(size = 20) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '16 18 84 92');
  svg.setAttribute('width', String(Math.round(size * 84 / 92)));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', 'translate(40 20) scale(1.1)');
  const c = document.createElementNS(NS, 'path');
  c.setAttribute('d', 'M46.43 20.98Q45.29 13.73 41.57 10.05Q37.86 6.38 31.74 6.30Q27.19 6.30 23.78 8.39Q20.37 10.49 18.14 13.99Q15.91 17.49 14.82 21.95Q13.73 26.40 13.73 31.13Q13.73 38.64 15.87 44.46Q18.01 50.27 22.12 53.60Q26.23 56.92 32.09 56.92Q37.60 56.92 43.02 54.08Q48.44 51.23 52.11 46.16L56.31 50.01Q52.02 55.87 47.30 58.89Q42.58 61.90 38.08 62.95Q33.57 64.00 29.99 64.00Q23.26 64.00 17.75 61.60Q12.24 59.19 8.26 54.95Q4.28 50.71 2.14 45.07Q0.00 39.43 0.00 32.87Q0.00 26.93 1.92 21.07Q3.85 15.21 7.65 10.45Q11.45 5.68 17.22 2.84Q22.99 0.00 30.60 0.00Q34.01 0.00 38.08 1.09Q42.14 2.19 45.73 4.28L45.38 0.61H52.11V20.98Z');
  c.setAttribute('fill', 'currentColor');
  g.append(c);
  const handle = document.createElementNS(NS, 'path');
  for (const [k, v] of Object.entries({ d: 'M18 27h13l9 21', fill: 'none', stroke: 'currentColor', 'stroke-width': '5.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) handle.setAttribute(k, v);
  svg.append(g, handle);
  for (const cx of [57, 81]) {
    const w = document.createElementNS(NS, 'circle');
    w.setAttribute('cx', String(cx)); w.setAttribute('cy', '100'); w.setAttribute('r', '6.5'); w.setAttribute('fill', 'currentColor');
    svg.append(w);
  }
  return svg;
}
