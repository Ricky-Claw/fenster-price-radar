import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildRowKey, deriveCustomerTotal } from '../src/pricing.js';
import { MIN_CONFIRMING_PROVIDERS, VERIFY_TOLERANCE_PCT } from '../src/verification.js';

const resultsRoot = path.resolve('results');
const publicDataPath = path.resolve('public', 'data', 'price-radar.json');
const verificationPath = path.resolve('data', 'verification.json');
const startedAt = new Date();
const limit = parseLimit(process.argv);

const jobs = [
  { provider: 'dfs', prefix: 'dfs-mapped-pvc-', script: 'dfs:pvc:mapped', args: ['--', `--limit=${limit}`] },
  { provider: 'fensterblick', prefix: 'fensterblick-mapped-pvc-', script: 'fb:pvc:mapped', args: ['--', `--limit=${limit}`] },
  { provider: 'fensterversand', prefix: 'fensterversand-mapped-pvc-', script: 'fv:pvc:mapped', args: ['--', `--limit=${limit}`] },
];

function parseLimit(argv) {
  const raw = argv.find(arg => arg.startsWith('--n='));
  if (!raw) return 5;
  const n = Number.parseInt(raw.slice('--n='.length), 10);
  if (!Number.isFinite(n) || n < 1) {
    console.error(`Invalid --n value: ${raw.slice('--n='.length)}`);
    process.exit(1);
  }
  return n;
}

function run(script, args = []) {
  return new Promise(resolve => {
    console.log(`\n=== ${script} ${args.join(' ')} ===`);
    const child = spawn('npm', ['run', script, ...args], { stdio: 'inherit', shell: false });
    child.on('close', code => resolve({ script, code }));
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function folderTime(name, prefix) {
  const stamp = name.slice(prefix.length);
  const m = stamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!m) return Number.NaN;
  return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
}

function latestSample(prefix) {
  if (!fs.existsSync(resultsRoot)) return null;
  const candidates = fs.readdirSync(resultsRoot)
    .filter(n => n.startsWith(prefix) && fs.existsSync(path.join(resultsRoot, n, 'results.json')))
    .map(n => {
      try {
        const json = readJson(path.join(resultsRoot, n, 'results.json'));
        return { name: n, count: (json.results || []).length, time: folderTime(n, prefix) };
      } catch {
        return { name: n, count: 0, time: Number.NaN };
      }
    })
    .filter(x => x.count === limit && Number.isFinite(x.time) && x.time > startedAt.getTime())
    .sort((a, b) => a.name.localeCompare(b.name));
  return candidates.at(-1)?.name || null;
}

function rowFromResult(provider, dir, r) {
  const wrapped = r[provider] || r.dfs || r.fensterblick || r.fensterversand;
  const data = wrapped || r || {};
  const input = r.input || r || {};
  const customerTotal = deriveCustomerTotal(data);
  const row = {
    provider,
    brand: input.brand || input.manufacturer || r.brand || r.manufacturer || '',
    profile: input.profile || input.model || r.profile || r.model || '',
    size: input.size || r.size || `${input.width || r.width || ''}x${input.height || r.height || ''}`,
    glazing: input.glazing || input.glass || r.glazing || r.glass || '',
    opening: input.opening || input.openingType || r.opening || r.openingType || 'Dreh-Kipp',
    color: input.color || r.color || 'Weiß/Weiß',
    layout: input.layout || r.layout || '1flg',
    valid: data?.comparePrice?.valid ?? false,
    customerTotal,
    sourceDir: dir
  };
  row.key = buildRowKey(row);
  return row;
}

function loadProviderRows(provider, dir) {
  const json = readJson(path.join(resultsRoot, dir, 'results.json'));
  return (json.results || []).map(r => rowFromResult(provider, dir, r));
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFreshPrice(row) {
  return row.valid === true && isFiniteNumber(row.customerTotal);
}

function withinTolerance(fresh, published) {
  if (!isFiniteNumber(fresh) || !isFiniteNumber(published) || published === 0) return false;
  const deltaPct = Math.abs(fresh - published) / published * 100;
  return Number.isFinite(deltaPct) && deltaPct <= VERIFY_TOLERANCE_PCT;
}

const runResults = [];
for (const job of jobs) {
  const result = await run(job.script, job.args);
  runResults.push({ ...job, ...result });
  if (result.code !== 0) {
    console.warn(`WARN: ${job.script} failed with exit code ${result.code}`);
  }
}

const freshByKey = new Map();
const usableProviders = [];

for (const job of runResults) {
  if (job.code !== 0) continue;
  const dir = latestSample(job.prefix);
  if (!dir) {
    console.warn(`WARN: no fresh complete ${job.prefix} result found after ${startedAt.toISOString()}`);
    continue;
  }
  const rows = loadProviderRows(job.provider, dir);
  const pricedRows = rows.filter(isFreshPrice);
  if (pricedRows.length === 0) {
    console.warn(`WARN: ${dir} contains no valid fresh customer prices`);
    continue;
  }
  usableProviders.push(job.provider);
  for (const row of pricedRows) {
    if (!freshByKey.has(row.key)) freshByKey.set(row.key, {});
    freshByKey.get(row.key)[job.provider] = row.customerTotal;
  }
}

if (usableProviders.length < MIN_CONFIRMING_PROVIDERS) {
  console.error(`Need at least ${MIN_CONFIRMING_PROVIDERS} successful providers with fresh prices, got ${usableProviders.length}`);
  process.exit(1);
}

const publicPayload = readJson(publicDataPath);
const publicByKey = new Map((publicPayload.configs || []).map(config => [config.key, config]));
const entries = [];
const skipped = [];

for (const [key, freshPrices] of [...freshByKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const config = publicByKey.get(key);
  if (!config) {
    skipped.push({ key, reason: 'not_in_public_data' });
    continue;
  }

  const providers = Object.keys(freshPrices).filter(provider => isFiniteNumber(freshPrices[provider]));
  if (providers.length < MIN_CONFIRMING_PROVIDERS) {
    skipped.push({ key, reason: `only_${providers.length}_fresh_provider` });
    continue;
  }

  const mismatched = providers.some(provider => {
    const published = config.providers?.[provider]?.customerTotal;
    return !withinTolerance(freshPrices[provider], published);
  });

  entries.push({
    key,
    verifiedAt: new Date().toISOString(),
    result: mismatched ? 'mismatch' : 'verified',
    prices: providers.reduce((prices, provider) => {
      prices[provider] = freshPrices[provider];
      return prices;
    }, {})
  });
}

if (skipped.length) {
  console.warn('Skipped sample keys:', skipped);
}

const samples = entries.filter(entry => entry.result === 'verified').length;
const verification = {
  verifiedAt: new Date().toISOString().slice(0, 10),
  samples,
  note: `${samples} Konfigurationen live über die Anbieter-Konfiguratoren nachgeprüft.`,
  verifiedKeys: entries
};

const verificationTmpPath = `${verificationPath}.tmp`;
fs.writeFileSync(verificationTmpPath, `${JSON.stringify(verification, null, 2)}\n`);
fs.renameSync(verificationTmpPath, verificationPath);

console.log(JSON.stringify({
  checked: entries.length,
  verified: samples,
  mismatched: entries.length - samples,
  skipped: skipped.length
}, null, 2));
