import fs from 'node:fs';
import path from 'node:path';

const dataPath = path.resolve('public', 'data', 'price-radar.json');
const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const twoSash = payload.configs.filter(c => (c.layout || '1flg') !== '1flg');
const failures = [];

function fail(row, provider, message) {
  failures.push({ key: row.key, provider, message });
}

for (const row of twoSash) {
  const validProviders = Object.entries(row.providers || {}).filter(([, p]) => p.valid);
  if (validProviders.length < 2) fail(row, 'row', `needs at least 2 valid equivalent providers, got ${validProviders.length}`);
  for (const [provider, p] of validProviders) {
    if (p.width && Number(p.width) !== Number(row.width)) fail(row, provider, `width mismatch ${p.width} != ${row.width}`);
    if (p.height && Number(p.height) !== Number(row.height)) fail(row, provider, `height mismatch ${p.height} != ${row.height}`);
    if (!p.equivalence?.layout || p.equivalence.layout !== row.layout) fail(row, provider, 'missing matching equivalence.layout proof');
    if (row.layout === '2flg_pfosten') {
      const proof = `${p.equivalence?.construction || ''} ${p.equivalence?.proof || ''}`.toLowerCase();
      if (!/pfosten|mittelpfosten|group|parameters\[2\]=22|2-flügel/.test(proof)) fail(row, provider, `missing Pfosten proof: ${proof || 'empty'}`);
    }
    if (row.layout === '2flg_stulp_dk_dreh') {
      const proof = `${p.equivalence?.construction || ''} ${p.equivalence?.proof || ''}`.toLowerCase();
      if (!/stulp/.test(proof)) fail(row, provider, `missing Stulp proof: ${proof || 'empty'}`);
      if (provider === 'fensterversand' && !/parameters\[2\]=2\+1.*parameters\[130\]=\[2,3\]/.test(proof)) fail(row, provider, `missing Fensterversand Stulp parameter proof: ${proof || 'empty'}`);
    }
    if (typeof p.customerTotal !== 'number' && typeof p.listTotal !== 'number') fail(row, provider, 'valid provider without numeric price');
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok:false, checked:twoSash.length, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checked: twoSash.length,
  rows: twoSash.map(row => ({
    key: row.key,
    layout: row.layout,
    validProviders: Object.entries(row.providers || {}).filter(([, p]) => p.valid).map(([id, p]) => ({ id, price:p.customerTotal ?? p.listTotal, proof:p.equivalence?.proof }))
  }))
}, null, 2));
