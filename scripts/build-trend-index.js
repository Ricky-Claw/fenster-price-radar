// Baut public/data/price-trend-index.json: Preisindex je Anbieter über alle History-Snapshots.
// Index statt Durchschnittspreis, weil der Katalog über die Zeit gewachsen ist (52 -> 144 Konfigs) -
// ein reiner Preisdurchschnitt würde beim Katalog-Wachstum künstliche Sprünge zeigen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const historyDir = path.join(root, 'public/data/history');
const outFile = path.join(root, 'public/data/price-trend-index.json');
const PROVIDERS = ['dfs', 'fensterblick', 'fensterversand'];

function configKey(c) {
  return `${c.brand}|${c.profile}|${c.size}|${c.glazing}|${c.layout || '1flg'}`;
}
function price(p) {
  if (!p || !p.valid) return null;
  const v = p.customerTotal ?? p.listTotal;
  return typeof v === 'number' && v > 0 ? v : null;
}

const files = fs.readdirSync(historyDir).filter(f => /^price-radar-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const current = JSON.parse(fs.readFileSync(path.join(root, 'public/data/price-radar.json'), 'utf8'));
const currentDate = current.generatedAt.slice(0, 10);
const snapshots = files.map(f => ({ date: f.match(/(\d{4}-\d{2}-\d{2})/)[1], data: JSON.parse(fs.readFileSync(path.join(historyDir, f), 'utf8')) }));
if (!snapshots.some(s => s.date === currentDate)) snapshots.push({ date: currentDate, data: current });
snapshots.sort((a, b) => a.date.localeCompare(b.date));

// je Konfig+Anbieter: Preis am ersten Auftreten merken (Basis fuer den Index)
const baseline = new Map();
const points = [];
for (const snap of snapshots) {
  const perProvider = { dfs: [], fensterblick: [], fensterversand: [] };
  for (const c of snap.data.configs || []) {
    const key = configKey(c);
    for (const provider of PROVIDERS) {
      const v = price(c.providers?.[provider]);
      if (v == null) continue;
      const baseKey = `${key}|${provider}`;
      if (!baseline.has(baseKey)) baseline.set(baseKey, v);
      const base = baseline.get(baseKey);
      if (base > 0) perProvider[provider].push((v / base) * 100);
    }
  }
  const point = { date: snap.date };
  for (const provider of PROVIDERS) {
    const arr = perProvider[provider];
    point[provider] = arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
    point[`${provider}Count`] = arr.length;
  }
  points.push(point);
}

fs.writeFileSync(outFile, JSON.stringify({ generatedAt: current.generatedAt, note: 'Preisindex je Anbieter, Basis 100 beim ersten Auftreten jeder Konfiguration (mittelt relative Preisbewegung, robust gegen Katalog-Wachstum).', points }, null, 2));
console.log(JSON.stringify({ outFile, snapshotCount: points.length, from: points[0]?.date, to: points[points.length - 1]?.date }, null, 2));
