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
  const candidates = fs.readdirSync(root)
    .filter(n => n.startsWith(prefix) && fs.existsSync(path.join(root, n, 'results.json')))
    .map(n => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(root, n, 'results.json'), 'utf8'));
        return { name:n, count:(j.results || []).length };
      } catch { return { name:n, count:0 }; }
    })
    .filter(x => x.count > 0)
    .sort((a,b) => (a.count - b.count) || a.name.localeCompare(b.name));
  return candidates.at(-1)?.name || null;
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
    const discountMeta = data?.discountMetadata || data?.discount || {};
    const explicitCustomerTotal = data?.customerPrice?.total ?? data?.customerTotal ?? null;
    const discountedTotal = discountMeta.discountedTotalObserved ?? null;
    const customerTotal = typeof explicitCustomerTotal === 'number' && Number.isFinite(explicitCustomerTotal) && explicitCustomerTotal > 0
      ? explicitCustomerTotal
      : (typeof discountedTotal === 'number' && Number.isFinite(discountedTotal) && discountedTotal > 0 ? discountedTotal : price);
    const discountObserved = discountMeta.observed === true || (
      typeof discountedTotal === 'number' && Number.isFinite(discountedTotal) && typeof price === 'number' && Math.abs(discountedTotal - price) > 0.01
    );
    rows.push({
      provider,
      brand: input.brand || input.manufacturer || r.brand || r.manufacturer || '',
      profile: input.profile || input.model || r.profile || r.model || '',
      material: input.material || r.material || 'Kunststoff',
      size: input.size || r.size || `${input.width || r.width || ''}x${input.height || r.height || ''}`,
      sizeRole: input.sizeRole || r.sizeRole || '',
      width: input.width || r.width || '',
      height: input.height || r.height || '',
      glazing: input.glazing || input.glass || r.glazing || r.glass || '',
      opening: input.opening || input.openingType || r.opening || r.openingType || 'Dreh-Kipp',
      color: input.color || r.color || 'Weiß/Weiß',
      status: data?.status || 'unknown',
      valid: data?.comparePrice?.valid ?? false,
      listTotal: price,
      customerTotal,
      discountMetadata: {
        ...discountMeta,
        observed: discountObserved,
        note: discountObserved ? 'live beobachteter Rabatt/Endpreis vom Anbieter' : 'kein Live-Rabatt beobachtet; Endpreis = Listenpreis'
      },
      warnings: data?.warnings || [],
      reason: data?.reason || data?.error || '',
      sourceDir: dir
    });
  }
}

const keys = new Map();
for (const row of rows) {
  const k = [row.brand, row.profile, row.size, row.glazing, row.opening, row.color].join('|');
  if (!keys.has(k)) keys.set(k, { key: k, brand: row.brand, profile: row.profile, material: row.material, size: row.size, sizeRole: row.sizeRole, glazing: row.glazing, opening: row.opening, color: row.color, providers: {} });
  keys.get(k).providers[row.provider] = row;
}

const configs = [...keys.values()].map(c => {
  const prices = Object.values(c.providers).filter(p => p.valid && typeof p.listTotal === 'number').map(p => p.listTotal);
  const customerPrices = Object.values(c.providers).filter(p => p.valid && typeof p.customerTotal === 'number').map(p => p.customerTotal);
  const dfs = c.providers.dfs?.valid ? c.providers.dfs.listTotal : null;
  const dfsCustomer = c.providers.dfs?.valid ? c.providers.dfs.customerTotal : null;
  const comp = Object.entries(c.providers)
    .filter(([k, p]) => k !== 'dfs' && p.valid && typeof p.customerTotal === 'number')
    .map(([k, p]) => ({ provider: k, price: p.customerTotal, listPrice: p.listTotal }))
    .sort((a, b) => a.price - b.price);
  const best = comp[0] || null;
  return {
    ...c,
    dfsPrice: dfs,
    dfsCustomerPrice: dfsCustomer,
    bestCompetitor: best,
    delta: dfsCustomer && best ? +(dfsCustomer - best.price).toFixed(2) : null,
    deltaPct: dfsCustomer && best ? +(((dfsCustomer - best.price) / best.price) * 100).toFixed(1) : null,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    minCustomerPrice: customerPrices.length ? Math.min(...customerPrices) : null,
    maxCustomerPrice: customerPrices.length ? Math.max(...customerPrices) : null
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
