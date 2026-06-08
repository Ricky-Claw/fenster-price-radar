import assert from 'node:assert/strict';
import { resolvePriceLimit } from '../scripts/price-limit.js';

assert.equal(resolvePriceLimit({}), '146');
assert.equal(resolvePriceLimit({ PRICE_LIMIT: '12' }), '12');

console.log('price-limit ok');
