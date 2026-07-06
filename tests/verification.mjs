import assert from 'node:assert/strict';
import { configVerification } from '../src/verification.js';

const key = 'Brand|Profile|100x100|3fach|Dreh-Kipp|weiß|1flg';
const otherKey = 'Other|Profile|100x100|3fach|Dreh-Kipp|weiß|1flg';
const config = {
  key,
  providers: {
    dfs: { customerTotal: 100 },
    fensterblick: { customerTotal: 201 },
    fensterversand: { customerTotal: 300 },
  },
};

assert.equal(configVerification(undefined, config), null);
assert.equal(configVerification([], config), null);

assert.equal(
  configVerification([
    { key: otherKey, verifiedAt: '2026-07-05', result: 'verified', prices: { dfs: 100, fensterblick: 201 } },
  ], config),
  null
);

assert.deepEqual(
  configVerification([
    { key, verifiedAt: '2026-07-05', result: 'verified', prices: { dfs: 100.5, fensterblick: 199.1, fensterversand: 330 } },
  ], config),
  { status: 'verified', verifiedAt: '2026-07-05', providers: ['dfs', 'fensterblick'] }
);

assert.equal(
  configVerification([
    { key, verifiedAt: '2026-07-05', result: 'verified', prices: { dfs: 100.5, fensterblick: 190, fensterversand: 330 } },
  ], config),
  null
);

assert.deepEqual(
  configVerification([
    { key, verifiedAt: '2026-07-05', result: 'mismatch', prices: { dfs: 100, fensterblick: 220 } },
  ], config),
  { status: 'mismatch', verifiedAt: '2026-07-05', providers: ['fensterblick'] }
);

assert.equal(
  configVerification([
    { key, verifiedAt: '2026-07-05', result: 'mismatch', prices: { dfs: 100.5, fensterblick: 199.1 } },
  ], config),
  null
);

assert.equal(
  configVerification([
    { key, verifiedAt: '2026-07-05', result: 'mismatch', prices: { dfs: null, fensterblick: '220' } },
  ], config),
  null
);

assert.deepEqual(
  configVerification([
    { key, verifiedAt: '2026-07-04', result: 'mismatch', prices: { dfs: 100 } },
    { key, verifiedAt: '2026-07-05', result: 'verified', prices: { dfs: 100, fensterblick: 201 } },
  ], config),
  { status: 'verified', verifiedAt: '2026-07-05', providers: ['dfs', 'fensterblick'] }
);

assert.equal(
  configVerification([
    { key, verifiedAt: '2026-07-05', result: 'verified', prices: { dfs: 0, fensterblick: 201 } },
  ], {
    key,
    providers: {
      dfs: { customerTotal: 0 },
      fensterblick: { customerTotal: 201 },
      fensterversand: {},
    },
  }),
  null
);

console.log('verification ok');
