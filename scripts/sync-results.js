import fs from 'node:fs';
import path from 'node:path';
import { buildRowKey, deriveCustomerTotal } from '../src/pricing.js';
import { configVerification } from '../src/verification.js';

const root = path.resolve('results');
const out = path.resolve('public', 'data');
const catalogPath = path.resolve('data', 'comparison-catalog.json');
const expectedCatalogCount = (() => {
  try {
    const raw = readJson(catalogPath);
    return (Array.isArray(raw) ? raw : raw.configs || []).length;
  } catch { return 0; }
})();
const catalogKeys = (() => {
  try {
    const raw = readJson(catalogPath);
    const configs = Array.isArray(raw) ? raw : raw.configs || [];
    return new Set(configs.map(c => buildRowKey(c)));
  } catch { return new Set(); }
})();
const historyOut = path.join(out, 'history');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(historyOut, { recursive: true });
const previousPath = path.join(out, 'price-radar.json');
const generatedAt = new Date().toISOString();
const currentStamp = generatedAt.slice(0, 10);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function previousSnapshot() {
  const historyCandidates = fs.existsSync(historyOut)
    ? fs.readdirSync(historyOut)
      .filter(n => /^price-radar-\d{4}-\d{2}-\d{2}\.json$/.test(n) && !n.includes(currentStamp))
      .map(n => {
        const file = path.join(historyOut, n);
        try {
          const payload = readJson(file);
          return { file, label:n, payload, generatedAt:payload.generatedAt || '' };
        } catch { return null; }
      })
      .filter(Boolean)
      .filter(x => x.generatedAt && x.generatedAt < generatedAt && (x.payload.configs || []).length > 0)
      .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
    : [];
  const history = historyCandidates.at(-1);
  if (history) return history;

  if (fs.existsSync(previousPath)) {
    try {
      const payload = readJson(previousPath);
      if (payload.generatedAt && !payload.generatedAt.startsWith(currentStamp) && (payload.configs || []).length > 0) {
        return { file:previousPath, label:'price-radar.json', payload, generatedAt:payload.generatedAt };
      }
    } catch {}
  }
  return null;
}

const previous = previousSnapshot();
const previousPayload = previous?.payload || null;
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
    .filter(x => x.count >= expectedCatalogCount)
    .sort((a,b) => a.name.localeCompare(b.name));
  const selected = candidates.at(-1)?.name || null;
  if (!selected) throw new Error(`No complete ${prefix} result found for ${expectedCatalogCount} catalog rows. Run provider update with full limit first.`);
  return selected;
}

// Einkaufspreis-Provider: reine Zusatzinfo, zählt nie als Wettbewerber (kein bestCompetitor/min/max/Vergleichbarkeits-Gate).
const PURCHASE_PROVIDERS = new Set(['eko4u']);

function latestOptional(prefix) {
  try { return latest(prefix); }
  catch (e) {
    console.warn(`WARN: ${e.message} — Einkaufspreise (${prefix}) fehlen in diesem Sync.`);
    return null;
  }
}

const sources = {
  dfs: latest('dfs-mapped-pvc-'),
  fensterblick: latest('fensterblick-mapped-pvc-'),
  fensterversand: latest('fensterversand-mapped-pvc-'),
  eko4u: latestOptional('eko4u-mapped-')
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
    const discountedTotal = discountMeta.discountedTotalObserved ?? null;
    const customerTotal = deriveCustomerTotal(data);
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
      layout: input.layout || r.layout || '1flg',
      layoutLabel: input.layoutLabel || r.layoutLabel || '1-flügelig',
      productType: input.productType || r.productType || 'fenster',
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
      equivalence: data?.equivalence || null,
      warnings: data?.warnings || [],
      reason: data?.reason || data?.error || '',
      sourceDir: dir
    });
  }
}

const keys = new Map();
let purchaseErrorsSkipped = 0;
for (const row of rows) {
  const k = buildRowKey(row);
  if (catalogKeys.size && !catalogKeys.has(k)) continue;
  // Fehler beim Einkaufs-Provider dürfen den Radar nicht blockieren: Zeile weglassen (EK bleibt leer), sichtbar in summary.purchase.
  if (PURCHASE_PROVIDERS.has(row.provider) && row.status === 'error') { purchaseErrorsSkipped += 1; continue; }
  if (!keys.has(k)) keys.set(k, { key: k, brand: row.brand, profile: row.profile, material: row.material, size: row.size, sizeRole: row.sizeRole, width: row.width, height: row.height, glazing: row.glazing, opening: row.opening, color: row.color, layout: row.layout, layoutLabel: row.layoutLabel, productType: row.productType, providers: {} });
  keys.get(k).providers[row.provider] = row;
}

const configs = [...keys.values()].map(c => {
  const competitorRows = Object.entries(c.providers).filter(([k]) => !PURCHASE_PROVIDERS.has(k)).map(([, p]) => p);
  const prices = competitorRows.filter(p => p.valid && typeof p.listTotal === 'number').map(p => p.listTotal);
  const customerPrices = competitorRows.filter(p => p.valid && typeof p.customerTotal === 'number').map(p => p.customerTotal);
  const dfs = c.providers.dfs?.valid ? c.providers.dfs.listTotal : null;
  const dfsCustomer = c.providers.dfs?.valid ? c.providers.dfs.customerTotal : null;
  const purchaseRow = c.providers.eko4u;
  const purchasePrice = purchaseRow?.valid && typeof purchaseRow.listTotal === 'number' ? purchaseRow.listTotal : null;
  const comp = Object.entries(c.providers)
    .filter(([k, p]) => k !== 'dfs' && !PURCHASE_PROVIDERS.has(k) && p.valid && typeof p.customerTotal === 'number')
    .map(([k, p]) => ({ provider: k, price: p.customerTotal, listPrice: p.listTotal }))
    .sort((a, b) => a.price - b.price);
  const best = comp[0] || null;
  return {
    ...c,
    dfsPrice: dfs,
    dfsCustomerPrice: dfsCustomer,
    purchasePrice,
    purchaseMargin: dfsCustomer && purchasePrice ? +(dfsCustomer - purchasePrice).toFixed(2) : null,
    purchaseMarginPct: dfsCustomer && purchasePrice ? +(((dfsCustomer - purchasePrice) / purchasePrice) * 100).toFixed(1) : null,
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
  return p && (p.status === 'unmatched' || p.reason === 'nicht_im_angebot' || p.reason === 'No profile alias match' || p.reason === 'No equivalent PVC profile in Fensterversand mapping' || p.warnings?.includes('fensterversand_two_sash_equivalence_not_proven'));
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
  // Balkontür ist neu und bislang nur bei einem Anbieter preislich verifiziert -> min. 1 statt 2, solange die anderen sauber "nicht im Angebot" melden.
  const minValid = c.productType && c.productType !== 'fenster' ? 1 : 2;
  return validCount >= minValid && required.every(isCleanProvider);
});
const comparableKeys = new Set(comparableConfigs.map(c => c.key));
const filteredList = configs.filter(c => !comparableKeys.has(c.key)).map(c => {
  const required = ['dfs','fensterblick','fensterversand'].map(k => c.providers[k]);
  const validCount = required.filter(isValidPrice).length;
  const hasDimensionWarning = required.some(p => p?.warnings?.some(w => String(w).startsWith('dimension_rounded')));
  const minValid = c.productType && c.productType !== 'fenster' ? 1 : 2;
  const reason = validCount < minValid
    ? `nur ${validCount} vergleichbarer Anbieter${hasDimensionWarning ? ' (Maß vom Anbieter angepasst)' : ''}`
    : 'nicht vergleichbar';
  return { brand: c.brand, profile: c.profile, size: c.size, glazing: c.glazing, layout: c.layout, validCount, reason };
});
for (const c of comparableConfigs) {
  const prev = previousByKey.get(c.key);
  c.previousGeneratedAt = previousPayload?.generatedAt || null;
  c.previousSnapshot = previous ? previous.label : null;
  c.weeklyChange = {};
  for (const provider of ['dfs','fensterblick','fensterversand','eko4u']) {
    const now = c.providers[provider];
    const old = prev?.providers?.[provider];
    if (now?.valid && old?.valid) {
      const currentCustomer = typeof now.customerTotal === 'number' && Number.isFinite(now.customerTotal) ? now.customerTotal : now.listTotal;
      const previousCustomer = typeof old.customerTotal === 'number' && Number.isFinite(old.customerTotal) ? old.customerTotal : old.listTotal;
      const hasCustomer = typeof currentCustomer === 'number' && typeof previousCustomer === 'number';
      const hasList = typeof now.listTotal === 'number' && typeof old.listTotal === 'number';
      if (!hasCustomer && !hasList) continue;
      const delta = hasCustomer ? +(currentCustomer - previousCustomer).toFixed(2) : null;
      const listDelta = hasList ? +(now.listTotal - old.listTotal).toFixed(2) : null;
      c.weeklyChange[provider] = {
        basis: 'customerTotal',
        previous: hasCustomer ? previousCustomer : null,
        current: hasCustomer ? currentCustomer : null,
        delta,
        deltaPct: hasCustomer && previousCustomer ? +((delta / previousCustomer) * 100).toFixed(1) : null,
        previousList: hasList ? old.listTotal : null,
        currentList: hasList ? now.listTotal : null,
        listDelta,
        listDeltaPct: hasList && old.listTotal ? +((listDelta / old.listTotal) * 100).toFixed(1) : null
      };
    }
  }
}
const verification = (() => {
  try { return readJson(path.resolve('data', 'verification.json')); } catch { return null; }
})();
for (const c of comparableConfigs) {
  const v = configVerification(verification?.verifiedKeys, c);
  if (v) c.verification = v;
}
const payload = {
  generatedAt,
  comparisonBaseline: previous ? { generatedAt: previous.generatedAt, snapshot: previous.label } : null,
  sources,
  summary: {
    rows: rows.length,
    configs: comparableConfigs.length,
    candidates: configs.length,
    filteredOut: configs.length - comparableConfigs.length,
    weeklyBaselineGeneratedAt: previousPayload?.generatedAt || null,
    purchase: sources.eko4u ? {
      provider: 'eko4u',
      source: sources.eko4u,
      priced: rows.filter(r => r.provider === 'eko4u' && r.valid).length,
      unmatched: rows.filter(r => r.provider === 'eko4u' && r.status === 'unmatched').length,
      errorsSkipped: purchaseErrorsSkipped
    } : { provider: 'eko4u', source: null, note: 'kein Eko4u-Lauf gefunden — Einkaufspreise leer' }
  },
  verification,
  configs: comparableConfigs,
  filtered: filteredList
};
fs.writeFileSync(path.join(out, 'price-radar.json'), JSON.stringify(payload, null, 2));
const stamp = generatedAt.slice(0, 10);
fs.writeFileSync(path.join(historyOut, `price-radar-${stamp}.json`), JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ summary: payload.summary, sources }, null, 2));
