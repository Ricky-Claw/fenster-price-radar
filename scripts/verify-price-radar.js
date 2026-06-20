import fs from 'node:fs';
import path from 'node:path';

const dataPath = path.resolve('public', 'data', 'price-radar.json');
const historyDir = path.resolve('public', 'data', 'history');

function fail(message) {
  console.error(`price-radar quality failed: ${message}`);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

console.log(JSON.stringify({
  ok: true,
  generatedAt: payload.generatedAt,
  baseline: payload.comparisonBaseline,
  configs: payload.summary.configs,
  providerRows,
  weeklyChanges: changed
}, null, 2));
