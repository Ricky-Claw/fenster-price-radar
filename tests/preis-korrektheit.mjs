import assert from 'node:assert/strict';
import { deriveDiscountFromTotals, grossToNet, netToGross } from '../src/pricing.js';

assert.equal(grossToNet(119), 100);
assert.equal(grossToNet(null), null);
assert.equal(grossToNet(undefined), null);
assert.equal(grossToNet(NaN), null);
assert.equal(grossToNet(0), 0);
assert.equal(netToGross(100), 119);

const dfsCustomerNet = grossToNet(121.17);
const purchasePrice = 91.11;
const purchaseMargin = +(dfsCustomerNet - purchasePrice).toFixed(2);
const purchaseMarginPct = +((purchaseMargin / purchasePrice) * 100).toFixed(1);
assert.equal(dfsCustomerNet, 101.82);
assert.equal(purchaseMargin, 10.71);
assert.equal(purchaseMarginPct, 11.8);
assert.notEqual(purchaseMargin, 30.06);
assert.notEqual(purchaseMarginPct, 33);

assert.deepEqual(
  deriveDiscountFromTotals(100, 75),
  { observed: true, observedDiscountPercent: 0.25, observedDiscount: 25 }
);
assert.deepEqual(
  deriveDiscountFromTotals(100, 100),
  { observed: false, observedDiscountPercent: 0, observedDiscount: 0 }
);
assert.deepEqual(
  deriveDiscountFromTotals(100, 125),
  { observed: false, observedDiscountPercent: 0, observedDiscount: 0 }
);

for (const [listTotal, customerTotal] of [[undefined, 75], [100, undefined], [0, 75], [100, 0], [0, 0]]) {
  const discount = deriveDiscountFromTotals(listTotal, customerTotal);
  assert.deepEqual(discount, { observed: false, observedDiscountPercent: 0, observedDiscount: 0 });
  assert.ok(Number.isFinite(discount.observedDiscountPercent));
}

console.log('preis-korrektheit ok');
