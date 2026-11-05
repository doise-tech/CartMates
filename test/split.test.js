import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual, splitByClaim, settleUp, lineMinor, total } from '../lib/split.js';
import { parsePrice } from '../lib/product.js';

test('equal split always adds up to the total', () => {
  const shares = splitEqual(100, ['a', 'b', 'c']);
  const sum = Object.values(shares).reduce((s, n) => s + Math.round(n * 100), 0);
  assert.equal(sum, 10000);
  assert.deepEqual(shares, { a: 33.34, b: 33.33, c: 33.33 });
});

test('equal split with no members is empty', () => {
  assert.deepEqual(splitEqual(50, []), {});
});

test('lines count quantity and skip missing prices', () => {
  assert.equal(lineMinor({ price: 449, quantity: 2 }), 89800);
  assert.equal(lineMinor({ price: null, quantity: 3 }), 0);
  assert.equal(total([{ price: 0.1, quantity: 1 }, { price: 0.2, quantity: 1 }]), 0.3);
});

test('claim split charges each person for what they claimed', () => {
  const lines = [
    { price: 449, quantity: 1, claimed_by: 'a' },
    { price: 899.5, quantity: 1, claimed_by: 'b' },
    { price: 100, quantity: 2, claimed_by: null },
    { price: 50, quantity: 1, claimed_by: 'gone' },
  ];
  const { shares, unclaimed } = splitByClaim(lines, ['a', 'b', 'c']);
  assert.deepEqual(shares, { a: 449, b: 899.5, c: 0 });
  assert.equal(unclaimed, 250);
});

test('settle up makes everyone even with few moves', () => {
  const moves = settleUp({ a: 100, b: 100, c: 100 }, { a: 300, b: 0, c: 0 });
  assert.deepEqual(moves, [{ from: 'b', to: 'a', amount: 100 }, { from: 'c', to: 'a', amount: 100 }]);
  assert.deepEqual(settleUp({ a: 50, b: 50 }, { a: 50, b: 50 }), []);
});

test('parsePrice handles both separators', () => {
  assert.equal(parsePrice('Rs. 1,299.50'), 1299.5);
  assert.equal(parsePrice('1.299,50 €'), 1299.5);
  assert.equal(parsePrice('899'), 899);
  assert.equal(parsePrice('₹1,979'), 1979);
  assert.equal(parsePrice('₹1,97,979.00'), 197979);
  assert.equal(parsePrice('12,50'), 12.5);
  assert.equal(parsePrice('$1,299'), 1299);
  assert.equal(parsePrice('1.299'), 1299);
  assert.equal(parsePrice('9.99'), 9.99);
  assert.equal(parsePrice('free'), null);
  assert.equal(parsePrice(null), null);
});
