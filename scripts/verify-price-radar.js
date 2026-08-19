import fs from 'node:fs';
import path from 'node:path';
import { grossToNet } from '../src/pricing.js';
import { configVerification } from '../src/verification.js';

const dataPath = path.resolve('public', 'data', 'price-radar.json');
const historyDir = path.resolve('public', 'data', 'history');

function fail(message) {
  console.error(`price-radar quality failed: ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseDmyDateStamp(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const day = +m[1], month = +m[2], year = +m[3];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseIsoDateStamp(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = +m[1], month = +m[2], day = +m[3];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function sourceDateStamp(dir) {
  if (typeof dir !== 'string') return null;
  const m = dir.match(/(\d{4}-\d{2}-\d{2})T/);
  return m ? parseIsoDateStamp(m[1]) : null;
}

if (!fs.existsSync(dataPath)) fail('public/data/price-radar.json missing');
const payload = readJson(dataPath);
const currentStamp = payload.generatedAt?.slice(0, 10);
if (!payload.generatedAt || !currentStamp) fail('generatedAt missing');
if (!payload.summary?.configs) fail('summary.configs missing');
if (!Array.isArray(payload.configs) || payload.configs.length !== payload.summary.configs) fail('configs length mismatch');
const filteredOut = payload.summary.filteredOut ?? 0;
const candidates = payload.summary.candidates ?? payload.summary.configs + filteredOut;
// Completeness tolerates a few excluded configs while price correctness stays strict.
const MAX_FILTERED = Math.max(3, Math.ceil(candidates * 0.05));
if (filteredOut > MAX_FILTERED) fail(`too many non-comparable configs: ${filteredOut} > ${MAX_FILTERED}`);
if (filteredOut > 0) console.warn(`WARN: ${filteredOut} non-comparable config(s) excluded (within tolerance)`);

try {
  const catalog = readJson(path.resolve('data', 'comparison-catalog.json'));
  const catalogCount = Array.isArray(catalog) ? catalog.length : (catalog.configs || []).length;
  if (typeof payload.summary.candidates === 'number' && payload.summary.candidates !== catalogCount) {
    fail(`payload candidates ${payload.summary.candidates} != catalog ${catalogCount} (run data:sync after catalog changes)`);
  }
} catch {}

if (filteredOut > 0 && (!Array.isArray(payload.filtered) || payload.filtered.length !== filteredOut)) {
  fail(`filtered array length must equal filteredOut (${filteredOut})`);
}

for (const [provider, dir] of Object.entries(payload.sources || {})) {
  const sourceStamp = sourceDateStamp(dir);
  if (!sourceStamp) continue;
  if (sourceStamp !== currentStamp) {
    fail(`stale source: ${provider} ${dir} not from current run (generatedAt ${currentStamp})`);
  }
}

const historyCandidates = fs.existsSync(historyDir)
  ? fs.readdirSync(historyDir)
    .filter(n => /^price-radar-\d{4}-\d{2}-\d{2}\.json$/.test(n) && !n.includes(currentStamp))
    .map(n => {
      const file = path.join(historyDir, n);
      try { return { file, name:n, payload:readJson(file) }; }
      catch { return null; }
    })
    .filter(Boolean)
    .filter(x => x.payload.generatedAt && x.payload.generatedAt < payload.generatedAt && (x.payload.configs || []).length > 0)
    .sort((a, b) => xDate(a).localeCompare(xDate(b)))
  : [];

function xDate(x) { return x.payload.generatedAt || ''; }

const expectedBaseline = historyCandidates.at(-1);
if (expectedBaseline) {
  const actual = payload.comparisonBaseline?.generatedAt || payload.summary.weeklyBaselineGeneratedAt;
  if (actual !== expectedBaseline.payload.generatedAt) {
    fail(`weekly baseline must use latest prior history snapshot (${expectedBaseline.name}), got ${actual || 'none'}`);
  }
  const sameDayPrevious = payload.configs.find(c => c.previousGeneratedAt?.startsWith(currentStamp));
  if (sameDayPrevious) fail(`weekly baseline points to same-day snapshot on ${sameDayPrevious.key}`);
}

let providerRows = 0;
let invalidWeekly = 0;
let changed = 0;
for (const config of payload.configs) {
  for (const [provider, row] of Object.entries(config.providers || {})) {
    providerRows += 1;
    if (row.status === 'error') fail(`${config.key} ${provider} has provider error: ${row.reason || row.error || 'unknown'}`);
    if (row.valid && typeof row.customerTotal !== 'number' && typeof row.listTotal !== 'number') {
      fail(`${config.key} ${provider} valid without numeric price`);
    }
    const hasListTotal = typeof row.listTotal === 'number' && Number.isFinite(row.listTotal);
    const hasCustomerTotal = typeof row.customerTotal === 'number' && Number.isFinite(row.customerTotal);
    if (hasListTotal && hasCustomerTotal && row.customerTotal - row.listTotal > 0.01) {
      fail(`customer price exceeds list price: ${config.key}/${provider} customer ${row.customerTotal.toFixed(2)} > list ${row.listTotal.toFixed(2)}`);
    }
    if (hasListTotal && row.listTotal > 0 && hasCustomerTotal && row.customerTotal > 0) {
      const impliedDiscountPercent = 1 - row.customerTotal / row.listTotal;
      const metadataDiscountPercent = typeof row.discountMetadata?.observedDiscountPercent === 'number'
        ? row.discountMetadata.observedDiscountPercent
        : 0;
      if (Math.abs(impliedDiscountPercent - metadataDiscountPercent) > 0.001) {
        fail(`discount mismatch: ${config.key}/${provider} implied ${(impliedDiscountPercent * 100).toFixed(2)}% != metadata ${(metadataDiscountPercent * 100).toFixed(2)}%`);
      }
      const impliedObserved = row.listTotal - row.customerTotal > 0.01;
      if ((row.discountMetadata?.observed === true) !== impliedObserved) {
        fail(`discount observed mismatch: ${config.key}/${provider} implied ${String(impliedObserved)} != metadata ${String(row.discountMetadata?.observed === true)}`);
      }
    }
    const validUntil = row.discountMetadata?.discountValidUntil;
    const validUntilStamp = parseDmyDateStamp(validUntil);
    if (validUntilStamp && validUntilStamp < currentStamp && typeof row.customerTotal === 'number' && typeof row.listTotal === 'number' && row.customerTotal < row.listTotal) {
      fail(`expired discount published: ${config.key}/${provider} validUntil ${validUntil} < generatedAt ${currentStamp}`);
    }
  }
  const hasPurchasePrice = typeof config.purchasePrice === 'number' && Number.isFinite(config.purchasePrice);
  const hasPurchaseMargin = typeof config.purchaseMargin === 'number' && Number.isFinite(config.purchaseMargin);
  if (hasPurchasePrice && hasPurchaseMargin) {
    if (config.purchaseMarginBasis !== 'netto') {
      fail(`purchase margin basis mismatch: ${config.key} expected netto, got ${config.purchaseMarginBasis || 'missing'}`);
    }
    const expectedDfsCustomerNet = grossToNet(config.dfsCustomerPrice);
    if (typeof expectedDfsCustomerNet !== 'number') {
      fail(`purchase margin missing DFS customer price: ${config.key}`);
    }
    if (typeof config.dfsCustomerNet !== 'number' || Math.abs(config.dfsCustomerNet - expectedDfsCustomerNet) > 0.01) {
      fail(`DFS customer net mismatch: ${config.key} expected ${expectedDfsCustomerNet.toFixed(2)}, got ${typeof config.dfsCustomerNet === 'number' ? config.dfsCustomerNet.toFixed(2) : 'missing'}`);
    }
    const expectedMargin = +(expectedDfsCustomerNet - config.purchasePrice).toFixed(2);
    if (Math.abs(config.purchaseMargin - expectedMargin) > 0.01) {
      fail(`purchase margin mismatch: ${config.key} expected ${expectedMargin.toFixed(2)} netto, got ${config.purchaseMargin.toFixed(2)}`);
    }
  }
  for (const [provider, change] of Object.entries(config.weeklyChange || {})) {
    const row = config.providers?.[provider];
    if (!row?.valid) continue;
    const expectedCurrent = typeof row.customerTotal === 'number' ? row.customerTotal : row.listTotal;
    if (typeof expectedCurrent === 'number' && typeof change.current === 'number' && Math.abs(expectedCurrent - change.current) > 0.01) {
      invalidWeekly += 1;
    }
    if ((change.delta || 0) !== 0 || (change.listDelta || 0) !== 0) changed += 1;
  }
}
if (!providerRows) fail('no provider rows found');
if (invalidWeekly) fail(`${invalidWeekly} weekly changes do not match current customer prices`);

let verificationGate = null;
try {
  verificationGate = readJson(path.resolve('data', 'verification.json'));
} catch {}

if (verificationGate) {
  const embeddedVerification = payload.verification || {};
  if (embeddedVerification.samples !== verificationGate.samples || embeddedVerification.verifiedAt !== verificationGate.verifiedAt) {
    fail('verification.json und price-radar.json sind nicht aus demselben Sync — npm run data:sync ausführen');
  }
}

if (verificationGate?.verifiedKeys !== undefined) {
  if (!Array.isArray(verificationGate.verifiedKeys)) fail('verification.verifiedKeys must be an array');
  if (verificationGate.verifiedKeys.length > 0) {
    const configKeys = new Set(payload.configs.map(config => config.key));
    for (const entry of verificationGate.verifiedKeys) {
      if (!configKeys.has(entry?.key)) console.warn(`verification stale key (config nicht mehr vergleichbar): ${entry?.key || 'missing key'}`);
    }

    const verifiedCount = verificationGate.verifiedKeys.filter(entry => entry?.result === 'verified').length;
    if (verificationGate.samples !== verifiedCount) {
      fail(`verification samples ${verificationGate.samples} != verified entries ${verifiedCount}`);
    }

    for (const config of payload.configs) {
      if (config.verification?.status !== 'verified') continue;
      const reproduced = configVerification(verificationGate.verifiedKeys, config);
      if (reproduced?.status !== 'verified') fail(`non-reproducible verification badge: ${config.key}`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  generatedAt: payload.generatedAt,
  baseline: payload.comparisonBaseline,
  configs: payload.summary.configs,
  providerRows,
  weeklyChanges: changed
}, null, 2));
