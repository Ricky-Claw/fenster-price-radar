import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('results');
const out = path.resolve('public', 'data');
const historyOut = path.join(out, 'history');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(historyOut, { recursive: true });
const previousPath = path.join(out, 'price-radar.json');
const previousPayload = fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, 'utf8')) : null;
const previousByKey = new Map((previousPayload?.configs || []).map(c => [c.key, c]));

function latest(prefix) {
  if (!fs.existsSync(root)) return null;
  return fs.readdirSync(root).filter(n => n.startsWith(prefix)).sort().at(-1) || null;
}

const sources = {
  dfs: latest('dfs-mapped-pvc-'),
  fensterblick: latest('fensterblick-mapped-pvc-'),
  fensterversand: latest('fensterversand-mapped-pvc-')
};

const rows = [];
for (const [provider, dir] of Object.entries(sources)) {
  if (!dir) continue;
  const p = path.join(root, dir, 'results.json');
  if (!fs.existsSync(p)) continue;
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const r of json.results || []) {
    const wrapped = r[provider] || r.dfs || r.fensterblick || r.fensterversand;
    const data = wrapped || r || {};
    const input = r.input || r || {};
    const price = data?.comparePrice?.listTotal ?? data?.listTotal ?? data?.price?.listTotal ?? null;
    rows.push({
      provider,
      brand: input.brand || input.manufacturer || r.brand || r.manufacturer || '',
      profile: input.profile || input.model || r.profile || r.model || '',
      material: input.material || r.material || 'Kunststoff',
      size: input.size || r.size || `${input.width || r.width || ''}x${input.height || r.height || ''}`,
      width: input.width || r.width || '',
      height: input.height || r.height || '',
      glazing: input.glazing || input.glass || r.glazing || r.glass || '',
      opening: input.opening || input.openingType || r.opening || r.openingType || 'Dreh-Kipp',
      color: input.color || r.color || 'Weiß/Weiß',
      status: data?.status || 'unknown',
      valid: data?.comparePrice?.valid ?? false,
      listTotal: price,
      warnings: data?.warnings || [],
      reason: data?.reason || data?.error || '',
      sourceDir: dir
    });
  }
}

const keys = new Map();
for (const row of rows) {
  const k = [row.brand, row.profile, row.size, row.glazing, row.opening, row.color].join('|');
  if (!keys.has(k)) keys.set(k, { key: k, brand: row.brand, profile: row.profile, material: row.material, size: row.size, glazing: row.glazing, opening: row.opening, color: row.color, providers: {} });
  keys.get(k).providers[row.provider] = row;
}

const configs = [...keys.values()].map(c => {
  const prices = Object.values(c.providers).filter(p => p.valid && typeof p.listTotal === 'number').map(p => p.listTotal);
  const dfs = c.providers.dfs?.valid ? c.providers.dfs.listTotal : null;
  const comp = Object.entries(c.providers)
    .filter(([k, p]) => k !== 'dfs' && p.valid && typeof p.listTotal === 'number')
    .map(([k, p]) => ({ provider: k, price: p.listTotal }))
    .sort((a, b) => a.price - b.price);
  const best = comp[0] || null;
  return {
    ...c,
    dfsPrice: dfs,
    bestCompetitor: best,
    delta: dfs && best ? +(dfs - best.price).toFixed(2) : null,
    deltaPct: dfs && best ? +(((dfs - best.price) / best.price) * 100).toFixed(1) : null,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null
  };
});

function isUnavailable(p) {
  return p && (p.status === 'unmatched' || p.reason === 'nicht_im_angebot' || p.reason === 'No profile alias match' || p.reason === 'No equivalent PVC profile in Fensterversand mapping');
}
function isValidPrice(p) {
  return p?.valid && typeof p.listTotal === 'number' && p.listTotal > 0;
}
function isCleanProvider(p) {
  return isValidPrice(p) || isUnavailable(p);
}
const comparableConfigs = configs.filter(c => {
  const required = ['dfs','fensterblick','fensterversand'].map(k => c.providers[k]);
  const validCount = required.filter(isValidPrice).length;
  return validCount >= 2 && required.every(isCleanProvider);
});
for (const c of comparableConfigs) {
  const prev = previousByKey.get(c.key);
  c.previousGeneratedAt = previousPayload?.generatedAt || null;
  c.weeklyChange = {};
  for (const provider of ['dfs','fensterblick','fensterversand']) {
    const now = c.providers[provider];
    const old = prev?.providers?.[provider];
    if (now?.valid && typeof now.listTotal === 'number' && old?.valid && typeof old.listTotal === 'number') {
      const delta = +(now.listTotal - old.listTotal).toFixed(2);
      c.weeklyChange[provider] = { previous: old.listTotal, current: now.listTotal, delta, deltaPct: old.listTotal ? +((delta / old.listTotal) * 100).toFixed(1) : null };
    }
  }
}
const generatedAt = new Date().toISOString();
const payload = {
  generatedAt,
  sources,
  summary: { rows: rows.length, configs: comparableConfigs.length, candidates: configs.length, filteredOut: configs.length - comparableConfigs.length },
  configs: comparableConfigs
};
fs.writeFileSync(path.join(out, 'price-radar.json'), JSON.stringify(payload, null, 2));
const stamp = generatedAt.slice(0, 10);
fs.writeFileSync(path.join(historyOut, `price-radar-${stamp}.json`), JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ summary: payload.summary, sources }, null, 2));
