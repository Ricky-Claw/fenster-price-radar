import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const template = JSON.parse(await fs.readFile(path.join(root, 'data/fensterversand/pvc-default-payload.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(root, 'data/comparison-catalog.json'), 'utf8')).configs;
const aliases = JSON.parse(await fs.readFile(path.join(root, 'data/fensterversand/profile-aliases.json'), 'utf8'));

const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 20);
const outDir = path.join(root, 'results', `fensterversand-mapped-pvc-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(outDir, { recursive: true });

const results = [];
for (const cfg of catalog.slice(0, limit)) {
  const mapped = mapProfile(cfg);
  if (!mapped) { results.push({ provider:'Fensterversand', input:cfg, status:'unmatched', reason:'No equivalent PVC profile in Fensterversand mapping' }); continue; }
  const [w,h] = cfg.size.toLowerCase().split('x').map(Number);
  const payload = buildPayload({ width:w, height:h, brandId:mapped.brandId, profileId:mapped.profileId, glazing:cfg.glazing, color:cfg.color || 'weiß', opening:cfg.opening || 'Dreh-Kipp', layout:cfg.layout || '1flg' });
  const res = await fetch('https://www.fensterversand.com/configurator/update', {
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/plain, */*','origin':'https://www.fensterversand.com','referer':'https://www.fensterversand.com/?cid=25&t=fenster-kunststoff'},
    body: JSON.stringify({ configuration: payload.configuration, productId: 25 })
  });
  const json = await res.json().catch(async()=>({raw:await res.text()}));
  const percentages = json.price?.percentages || {};
  const profileDiscount = Number(percentages[mapped.profileId] || 0);
  const customerTotal = Number(json.price?.discountedTotal) || Number(json.price?.total);
  const listTotal = profileDiscount ? Number((customerTotal / (1 - profileDiscount / 100)).toFixed(2)) : Number(json.price?.total);
  results.push({
    provider:'Fensterversand', input:cfg, mappedProfile:mapped.name, status:res.status,
    comparePrice:{ listTotal, currency:'EUR', discountApplied:!!profileDiscount, valid: Number(json.price?.total) > 0 },
    customerPrice:{ total: customerTotal, currency:'EUR' },
    discountMetadata:{ observed:!!profileDiscount, observedDiscountPercent:profileDiscount/100, discountedTotalObserved: customerTotal, observedDiscount: profileDiscount, percentages, note:profileDiscount?`Fensterversand-Profilrabatt ${profileDiscount}% aus price.percentages`:'kein Profilrabatt in price.percentages' },
    warnings: Number(json.price?.total) > 0 ? [] : ['zero_or_unavailable_price'],
    dimensions: json.dimensions ? { x: json.dimensions.x, y: json.dimensions.y, qm: json.dimensions.qm, rm: json.dimensions.rm } : null,
    requestConfig: payload.configuration
  });
  await new Promise(r=>setTimeout(r,900));
}
const outFile=path.join(outDir,'results.json');
await fs.writeFile(outFile, JSON.stringify({generatedAt:new Date().toISOString(), pricePolicy:'comparePrice.listTotal only; discounts manual later', results}, null, 2));
console.log(JSON.stringify({outFile, matched:results.filter(r=>r.status===200).length, unmatched:results.filter(r=>r.status==='unmatched').length, sample:results.slice(0,8).map(r=>({input:r.input?.profile, size:r.input?.size, mapped:r.mappedProfile, status:r.status, price:r.comparePrice}))}, null, 2));

function buildPayload({width,height,brandId,profileId,glazing,color,opening,layout='1flg'}) {
  const p = structuredClone(template);
  const c = p.configuration['25'];
  c.a_132.value = 834; // Kunststoff
  c.a_2471.value = brandId;
  c.a_133.value = profileId;
  c.a_258.value = width;
  c.a_259.value = height;
  c.a_186.value = glazing === '2fach' ? 1238 : 1240; // conservative standard: Ug1.1 2fach / Ug0.7 3fach
  c.a_136.value = /anthrazit/i.test(color) ? 849 : 844; // current: same inside/outside field; outside-only needs separate attr later
  if (layout === '2flg_pfosten') {
    c.a_155.value = 8625; // Zweiteilig
    c.a_161 = c.a_161 || { aId:161, value:null, isCustom:false };
    c.a_161.value = 1045; // DK links + DK rechts, mit Mittelpfosten
  } else if (layout === '2flg_stulp') {
    c.a_155.value = 8625; // Zweiteilig
    c.a_161 = c.a_161 || { aId:161, value:null, isCustom:false };
    c.a_161.value = 1044; // DK links + Dreh rechts, Stulp-ähnliche zweiflügelige Ausführung
  } else {
    c.a_157.value = /fest/i.test(opening) ? 1020 : 1021; // default DK links
  }
  return p;
}
function mapProfile(cfg) {
  const s = `${cfg.brand} ${cfg.profile}`.toLowerCase().replace(/neo/,'neo').replace(/ö/g,'o');
  for (const [name, ids] of Object.entries(aliases)) {
    const n = name.toLowerCase().replace(/ö/g,'o');
    if (s.includes(n) || n.includes(cleanProfile(cfg.profile))) return { name, ...ids };
  }
  // fuzzy excel labels
  if (/ideal\s*4000/i.test(cfg.profile)) return { name:'Aluplast Ideal 4000', ...aliases['Aluplast Ideal 4000'] };
  if (/ideal\s*neo\s*md/i.test(cfg.profile)) return { name:'Aluplast Ideal Neo MD', ...aliases['Aluplast Ideal Neo MD'] };
  if (/ideal\s*8000/i.test(cfg.profile)) return { name:'Aluplast Ideal 8000', ...aliases['Aluplast Ideal 8000'] };
  if (/veka.*70/i.test(cfg.profile)) return { name:'Veka Softline 70 AD', ...aliases['Veka Softline 70 AD'] };
  if (/veka.*82/i.test(cfg.profile)) return { name:'Veka Softline 82 MD', ...aliases['Veka Softline 82 MD'] };
  if (/kommerling|kömmerling/i.test(cfg.profile) && /70/i.test(cfg.profile)) return { name:'Kömmerling 70 AD', ...aliases['Kömmerling 70 AD'] };
  if (/kommerling|kömmerling/i.test(cfg.profile) && /88/i.test(cfg.profile)) return { name:'Kömmerling 88 MD', ...aliases['Kömmerling 88 MD'] };
  return null;
}
function cleanProfile(p){ return String(p||'').toLowerCase().replace(/,?\s*[23]fach/g,'').trim(); }
