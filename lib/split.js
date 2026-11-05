// Cost maths works in whole minor units (paise/cents) so shares always add up to the total.
// Cartmates only calculates. It never moves money.

export const toMinor = (amount) => Math.round(Number(amount) * 100);
export const fromMinor = (minor) => minor / 100;

export function money(amount, currency = 'INR') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

// Each line is { price, quantity }. Lines without a price are skipped.
export const lineMinor = (line) => (line.price == null ? 0 : toMinor(line.price) * Math.max(1, line.quantity || 1));

export function total(lines) {
  return fromMinor(lines.reduce((sum, l) => sum + lineMinor(l), 0));
}

// Equal split. Leftover minor units go one each to the first people.
export function splitEqual(totalAmount, ids) {
  const n = ids.length;
  if (!n) return {};
  const all = toMinor(totalAmount);
  const base = Math.floor(all / n);
  let rest = all - base * n;
  const out = {};
  for (const id of ids) {
    out[id] = fromMinor(base + (rest > 0 ? 1 : 0));
    if (rest > 0) rest -= 1;
  }
  return out;
}

// Each person's share is whatever they claimed. Unclaimed lines come back under "unclaimed".
export function splitByClaim(lines, ids) {
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  let unclaimed = 0;
  for (const l of lines) {
    const m = lineMinor(l);
    if (l.claimed_by && l.claimed_by in out) out[l.claimed_by] += m;
    else unclaimed += m;
  }
  const result = Object.fromEntries(Object.entries(out).map(([id, m]) => [id, fromMinor(m)]));
  return { shares: result, unclaimed: fromMinor(unclaimed) };
}

// Who pays whom, given what each person owes (share) and what they already paid at the shop.
// Few, simple transfers: largest debtor pays largest creditor until everyone is even.
export function settleUp(shares, paid) {
  const net = Object.keys(shares).map((id) => ({ id, minor: toMinor(shares[id]) - toMinor(paid[id] || 0) }));
  const debtors = net.filter((n) => n.minor > 0).sort((a, b) => b.minor - a.minor);
  const creditors = net.filter((n) => n.minor < 0).map((n) => ({ ...n, minor: -n.minor })).sort((a, b) => b.minor - a.minor);
  const moves = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].minor, creditors[j].minor);
    if (amt > 0) moves.push({ from: debtors[i].id, to: creditors[j].id, amount: fromMinor(amt) });
    debtors[i].minor -= amt;
    creditors[j].minor -= amt;
    if (debtors[i].minor === 0) i += 1;
    if (creditors[j].minor === 0) j += 1;
  }
  return moves;
}
