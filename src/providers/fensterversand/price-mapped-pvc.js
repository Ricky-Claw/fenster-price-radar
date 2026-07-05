import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const template = JSON.parse(await fs.readFile(path.join(root, 'data/fensterversand/pvc-default-payload.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(root, 'data/comparison-catalog.json'), 'utf8')).configs;
const aliases = JSON.parse(await fs.readFile(path.join(root, 'data/fensterversand/profile-aliases.json'), 'utf8'));
const aluTemplate = JSON.parse(await fs.readFile(path.join(root, 'data/fensterversand/aluminium-default-payload.json'), 'utf8'));
const aluAliases = JSON.parse(await fs.readFile(path.join(root, 'data/fensterversand/aluminium-profile-aliases.json'), 'utf8'));

const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || 20);
const outDir = path.join(root, 'results', `fensterversand-mapped-pvc-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await fs.mkdir(outDir, { recursive: true });

const results = [];
for (const cfg of catalog.slice(0, limit)) {
  if (cfg.productType === 'balkontuer') { results.push({ provider:'Fensterversand', input:cfg, status:'unmatched', reason:'nicht_im_angebot' }); continue; }
  const isAlu = cfg.productType === 'aluminium';
  const mapped = isAlu ? mapAluProfile(cfg) : mapProfile(cfg);
  if (!mapped) { results.push({ provider:'Fensterversand', input:cfg, status:'unmatched', reason: isAlu ? 'nicht_im_angebot' : 'No equivalent PVC profile in Fensterversand mapping' }); continue; }
  const [w,h] = cfg.size.toLowerCase().split('x').map(Number);
  const payload = isAlu
    ? buildAluminiumPayload({ width:w, height:h, a2355:mapped.a_2355, a2375:mapped.a_2375 })
    : buildPayload({ width:w, height:h, brandId:mapped.brandId, profileId:mapped.profileId, glazing:cfg.glazing, color:cfg.color || 'weiß', opening:cfg.opening || 'Dreh-Kipp', layout:cfg.layout || '1flg' });
  const referer = isAlu ? 'https://www.fensterversand.com/?cid=25&t=fenster-aluminium-variabel' : 'https://www.fensterversand.com/?cid=25&t=fenster-kunststoff';
  const res = await fetch('https://www.fensterversand.com/configurator/update', {
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/plain, */*','origin':'https://www.fensterversand.com','referer':referer},
    body: JSON.stringify({ configuration: payload.configuration, productId: 25 })
  });
  const json = await res.json().catch(async()=>({raw:await res.text()}));
  const percentages = json.price?.percentages || {};
  const profileDiscount = isAlu ? Number(json.price?.discount || 0) : Number(percentages[mapped.profileId] || 0);
  const customerTotal = Number(json.price?.discountedTotal) || Number(json.price?.total);
  const listTotal = profileDiscount ? Number((customerTotal / (1 - profileDiscount / 100)).toFixed(2)) : Number(json.price?.total);
  results.push({
    provider:'Fensterversand', input:cfg, mappedProfile:mapped.name, status:res.status,
    comparePrice:{ listTotal, currency:'EUR', discountApplied:!!profileDiscount, valid: Number(json.price?.total) > 0 && fensterversandEquivalent(cfg.layout || '1flg', json) },
    customerPrice:{ total: customerTotal, currency:'EUR' },
    equivalence:fensterversandEquivalence(cfg.layout || '1flg', json),
    discountMetadata:{ observed:!!profileDiscount, observedDiscountPercent:profileDiscount/100, discountedTotalObserved: customerTotal, observedDiscount: profileDiscount, percentages, note:profileDiscount?`Fensterversand-Profilrabatt ${profileDiscount}% aus price.percentages`:'kein Profilrabatt in price.percentages' },
    warnings: Number(json.price?.total) > 0 ? (fensterversandEquivalent(cfg.layout || '1flg', json) ? [] : ['fensterversand_two_sash_equivalence_not_proven']) : ['zero_or_unavailable_price'],
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
  } else if (layout === '2flg_stulp_dk_dreh') {
    c.a_155.value = 8625; // Zweiteilig
    c.a_161 = c.a_161 || { aId:161, value:null, isCustom:false };
    c.a_161.value = 1044; // DK links + Dreh rechts, Stulp
  } else {
    c.a_157.value = /fest/i.test(opening) ? 1020 : 1021; // default DK links
  }
  return p;
}
// Aluminium-Profile: nur a_2355 (Profil) + a_2375 (Zusatzmerkmal, fehlt bei MB-45 komplett) unterscheiden sich
// zwischen den 3 Profilen (live per Browser-Netzwerkmitschnitt bestaetigt), alle anderen ~20 Attribute sind identisch.
function buildAluminiumPayload({ width, height, a2355, a2375 }) {
  const p = structuredClone(aluTemplate);
  const c = p.configuration['25'];
  c.a_258.value = width;
  c.a_259.value = height;
  c.a_2355.value = a2355;
  if (a2375 == null) delete c.a_2375;
  else { c.a_2375 = c.a_2375 || { aId:2375, value:null, isCustom:false }; c.a_2375.value = a2375; }
  return p;
}
function mapAluProfile(cfg) {
  const hay = `${cfg.brand} ${cfg.profile}`.toLowerCase();
  for (const [name, ids] of Object.entries(aluAliases)) {
    if (hay.includes(name.toLowerCase()) || name.toLowerCase().includes(cleanProfile(cfg.profile))) return { name, ...ids };
  }
  return null;
}
function fensterversandParams(json) { return json.information?.parameters || {}; }
function fensterversandEquivalent(layout, json) {
  if (layout === '1flg') return true;
  const p = fensterversandParams(json);
  if (layout === '2flg_pfosten') return p['2'] === '22' && p['130'] === '[1,1]';
  if (layout === '2flg_stulp_dk_dreh') return p['2'] === '2+1' && p['130'] === '[2,3]';
  return false;
}
function fensterversandEquivalence(layout, json) {
  const p = fensterversandParams(json);
  const construction = layout === '2flg_pfosten' ? '2-flügelig mit Mittelpfosten' : layout === '2flg_stulp_dk_dreh' ? '2-flügelig mit Stulp · Dreh-Kipp + Dreh' : '1-flügelig';
  return { layout, construction, proof: layout === '1flg' ? 'single-sash default' : `Fensterversand parameters proof: parameters[2]=${p['2'] || 'missing'}, parameters[130]=${p['130'] || 'missing'}` };
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
