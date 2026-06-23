import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'results', `dfs-mapped-pvc-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const BASE = 'https://deutscher-fenstershop.de';
const PROFILE_ALIASES = {
  'drutex|iglo 5 classic': 32, 'drutex|iglo 5': 31, 'drutex|iglo energy classic': 35, 'drutex|iglo energy': 34, 'drutex|iglo ext': 122, 'drutex|iglo premier': 126,
  'aluplast|ideal 4000': 12, 'aluplast|ideal 4000 classic': 12,
  'aluplast|ideal neo ad': 156, 'aluplast|ideal neo md': 130,
  'aluplast|ideal 8000': 14, 'aluplast|ideal 7000': 135, 'aluplast|ideal 5000': 82,
  'kommerling|kömmerling 70 ad': 152, 'kömmerling|kömmerling 70 ad': 152,
  'kommerling|kömmerling 70': 152, 'kömmerling|kömmerling 70': 152,
  'kommerling|kömmerling 88 md': 153, 'kömmerling|kömmerling 88 md': 153,
  'kommerling|kömmerling 88': 153, 'kömmerling|kömmerling 88': 153,
  'gealan|gealan s8000': 87, 'gealan|gealan s 8000': 87, 'gealan|gealan s9000': 66, 'gealan|gealan s 9000': 66,
  'salamander|salamander 76md': 7, 'salamander|salamander 76 md': 7, 'salamander|salamander 82': 74,
  'veka|veka 76': 57, 'veka|veka 82 md': 70, 'veka|veka 82': 70,
};
const OPEN_TYPE = { fest: 6, fixed: 6, 'dreh-kipp': 4, drehkipp: 4, dk: 4 };
const GLASS_GROUP = { '2fach': 1, '2-fach': 1, 'double': 1, '3fach': 2, '3-fach': 2, 'triple': 2 };

function norm(s=''){ return String(s).toLowerCase().replace(/ö/g,'o').replace(/ü/g,'u').replace(/ä/g,'a').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim(); }
function pickProfileId(c){
  const brand = norm(c.brand || c.manufacturer || '');
  const profile = norm(c.profile || c.model || '');
  for (const [k,id] of Object.entries(PROFILE_ALIASES)) {
    const [b,p] = k.split('|').map(norm);
    if (brand.includes(b) && profile.includes(p)) return id;
  }
  return null;
}
function openingId(c){ const s=norm(c.opening || c.openingType || 'dreh-kipp'); if(s.includes('fest')) return 6; return 4; }
async function layoutRequest(c, openType, profileId) {
  if (c.layout === '2flg_pfosten') {
    const group = await twoSashGroup(profileId, { stulp:'0', openTypes:['3','4'] });
    if (!group) return null;
    return { windowTypeId:6, stulp:0, loadPrices:+group, opid:String(group), openIds:[3,4], mode:'combined' };
  }
  if (c.layout === '2flg_stulp_dk_dreh') {
    const group = await twoSashGroup(profileId, { stulp:'1', openTypes:['3','2'] });
    if (!group) return null;
    const combinedGroup = await dfsCombinedStulpGroup(profileId, +group, [3,2]);
    if (!combinedGroup) return null;
    return { windowTypeId:6, stulp:1, loadPrices:+combinedGroup, opid:String(combinedGroup), openIds:[3,2], mode:'combined', stulpOrientation:'dk_dreh' };
  }
  return { windowTypeId:1, stulp:0, loadPrices:openType, opid:String(openType), openIds:[openType], mode:'single' };
}
async function twoSashGroup(profileId, { stulp, openTypes }) {
  const json = await fetchJson(`${BASE}/json/data_window_1_${profileId}_opentype.json?t=1.22`);
  for (const arr of Object.values(json || {})) {
    const groups = {};
    for (const x of arr || []) {
      if (String(x.window_type_id) !== '6' || String(x.stulp) !== stulp || !openTypes.includes(String(x.open_type))) continue;
      (groups[x.group_id] ||= new Set()).add(String(x.open_type));
    }
    for (const [group, ops] of Object.entries(groups)) if (openTypes.every(op => ops.has(op))) return group;
  }
  return null;
}
async function dfsCombinedStulpGroup(profileId, group, openIds) {
  // DFS opentype rows expose sash group ids, while /konfigurator/fenster often expects the hidden combined group id.
  // For current PVC two-sash stulp DK+Dreh groups this is group-4 when a combined result bucket exists.
  for (const candidate of [group, group - 4]) {
    if (!Number.isFinite(candidate) || candidate <= 0) continue;
    const body={doprice:1,loadPrices:candidate,stulp:1,bid:0,mid:0,pid:+profileId,wid:6,opid:String(candidate),size:{width:{},height:{}},open_ids:openIds,dv:1};
    // bid/mid are not required for shape probing; a real price call below will include them.
    // Avoid probing with incomplete ids here by returning the known candidate order; priceMatrix validates row existence.
    if (candidate === group - 4) return candidate;
  }
  return null;
}
function glassGroup(c){ const s=norm(c.glazing || c.glass || '3fach'); if(s.includes('2')) return 1; return 2; }
async function readJson(p){ return JSON.parse(await fs.readFile(p,'utf8')); }
async function fetchJson(url, opts={}){ const r=await fetch(url, opts); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
function parseAdd(price,type,w,h,current){ price=+price||0; if(!price) return 0; switch(type){ case '%': return current*price/100; case 'm2': return price*(w/1000)*(h/1000); case 'l': case 'm': return (w/1000*2+h/1000*2)*price; case 'lm': return (w/1000+h/1000)*price; case 'mw': return price*(w/1000); case 'mh': return price*(h/1000); default: return price; } }
const DFS_DEFAULT_PRICE_PERCENT = 90;
let dfsConfiguratorCache = null;
let dfsDiscountScrapeFailed = false;
const dfsBrandDiscountCache = new Map();
async function dfsConfiguratorValues() {
  if (!dfsConfiguratorCache) dfsConfiguratorCache = fetchDfsConfiguratorValues();
  return dfsConfiguratorCache;
}
async function fetchDfsConfiguratorValues() {
  try {
    const r = await fetch(`${BASE}/konfigurator/fenster`, { headers:{ 'user-agent':'Mozilla/5.0 FensterRadar/1.0', accept:'text/html' } });
    if (!r.ok) throw new Error(`${r.status} ${BASE}/konfigurator/fenster`);
    const parsed = parseDfsConfiguratorHtml(await r.text());
    dfsDiscountScrapeFailed = false;
    return parsed;
  } catch {
    dfsDiscountScrapeFailed = true;
    return { myPricePercent: DFS_DEFAULT_PRICE_PERCENT, materialDiscounts: new Map() };
  }
}
function parseDfsConfiguratorHtml(html) {
  const priceMatch = html.match(/myPricePercent\s*=\s*parseFloat\('([\d.]+)'\)/);
  const myPricePercent = Number(priceMatch?.[1]);
  return {
    myPricePercent: Number.isFinite(myPricePercent) ? myPricePercent : DFS_DEFAULT_PRICE_PERCENT,
    materialDiscounts: parseDfsMaterialDiscounts(html)
  };
}
function parseDfsMaterialDiscounts(html) {
  const materialJson = extractBalancedObject(html, /material_discount\s*=/);
  const campaigns = JSON.parse(materialJson);
  const discounts = new Map();
  for (const campaign of Object.values(campaigns || {})) {
    if (!campaign || String(campaign.status) !== '1') continue;
    const brandId = campaign.brand_id == null ? '' : String(campaign.brand_id);
    const materialId = campaign.material_id == null ? '' : String(campaign.material_id);
    const sum = Number(campaign.sum);
    if (!brandId || !materialId || !(sum > 0)) continue;
    const name = String(campaign.name || '').trim();
    discounts.set(`${brandId}|${materialId}`, { sum, date: campaign.date || dmyFromDateEnd(campaign.date_end), source: name ? `window.material_discount: ${name}` : 'window.material_discount', status: String(campaign.status) });
  }
  return discounts;
}
function extractBalancedObject(text, assignmentPattern) {
  const assignment = assignmentPattern.exec(text);
  if (!assignment) throw new Error('material_discount assignment not found');
  const open = text.indexOf('{', assignment.index + assignment[0].length);
  if (open < 0) throw new Error('material_discount object not found');
  let depth = 0, inString = false, quote = '', escaped = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) { inString = false; quote = ''; }
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  throw new Error('material_discount object is not balanced');
}
function dmyFromDateEnd(value) {
  const m = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}
function parseDmyDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const day = +m[1], month = +m[2], year = +m[3];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function annotateDiscount(discount, runDate = new Date()) {
  if (!discount || !(+discount.sum > 0)) return null;
  const discountValidUntil = discount.discountValidUntil || discount.date || null;
  if (!discountValidUntil) return { ...discount, discountValidUntil, active: true };
  const validUntilDate = parseDmyDate(discountValidUntil);
  if (!validUntilDate) return { ...discount, discountValidUntil, active: false, inactiveReason: 'invalid_date' };
  const active = validUntilDate >= startOfDay(runDate);
  return { ...discount, discountValidUntil, active, inactiveReason: active ? null : 'expired' };
}
async function dfsDiscount(profile) {
  const { materialDiscounts } = await dfsConfiguratorValues();
  const materialDiscount = materialDiscounts.get(`${profile.brand_id}|${profile.material_id}`);
  let brandDiscount = null;
  if (!dfsBrandDiscountCache.has(profile.brand_id)) {
    try {
      const json = await fetchJson(`${BASE}/windows/company-discout?bid=${profile.brand_id}&conf=windows`, { headers: { accept: 'application/json' } });
      dfsBrandDiscountCache.set(profile.brand_id, json.discount ? JSON.parse(json.discount) : null);
    } catch { dfsBrandDiscountCache.set(profile.brand_id, null); }
  }
  brandDiscount = dfsBrandDiscountCache.get(profile.brand_id);
  const candidates = [materialDiscount, brandDiscount].map(d => annotateDiscount(d)).filter(Boolean);
  const activeCandidates = candidates.filter(d => d.active);
  return (activeCandidates.length ? activeCandidates : candidates).sort((a,b)=>(+b.sum)-(+a.sum))[0] || null;
}
async function priceMatrix({profile, openType, width, height, layout}){
  const lr = await layoutRequest(layout ? { layout } : {}, openType, profile.id);
  if (!lr) return { row:null, layoutRequest:null, requested:{width,height}, actual:null };
  const body={doprice:1,loadPrices:lr.loadPrices,stulp:lr.stulp,bid:+profile.company_id,mid:+profile.material_id,pid:+profile.id,wid:lr.windowTypeId,opid:lr.opid,size:{width:{},height:{}},open_ids:lr.openIds,dv:1};
  const j=await fetchJson(`${BASE}/konfigurator/fenster`,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','origin':BASE,'referer':`${BASE}/konfigurator/fenster`},body:JSON.stringify(body)});
  const pick = list => (list || []).find(x=>+x.width===+width && +x.height===+height) || (list || []).find(x=>+x.width>=+width && +x.height>=+height);
  if (lr.mode === 'combined') {
    const row = pick(j.result?.[''] || j.result?.[lr.loadPrices]);
    return {row, layoutRequest:lr, requested:{width,height}, actual: row?{width:+row.width,height:+row.height}:null};
  }
  if (lr.mode === 'sum') {
    const parts = lr.openIds.map(id => pick(j.result?.[id])).filter(Boolean);
    const row = parts.length === lr.openIds.length ? { ...parts[0], price: parts.reduce((s, x) => s + (+x.price || 0), 0) } : null;
    return {row, layoutRequest:lr, requested:{width,height}, actual: row?{width:+row.width,height:+row.height}:null};
  }
  const row=pick(j.result?.[openType]);
  return {row, layoutRequest:lr, requested:{width,height}, actual: row?{width:+row.width,height:+row.height}:null};
}
async function glassPrice(profileId, groupId, width, height, defPrice){
  const pid = (profileId===56||profileId===144) ? 37 : profileId;
  const glass = await fetchJson(`${BASE}/json/data_window_glass_${pid}.json?t=1.22`);
  for (const top of Object.values(glass[0]||{})) for (const item of Object.values(top||{})) {
    if (+item.group_id===+groupId && (+item.is_default===1 || +item.is_def===1 || groupId)) return {item, add: parseAdd(item.price,item.price_type,width,height,defPrice)};
  }
  return {item:null, add:0};
}
async function priceOne(c, profiles){
  const profileId=pickProfileId(c); if(!profileId) return {status:'unmatched', reason:'profile_not_mapped'};
  const profile=profiles.find(p=>+p.id===+profileId); if(!profile) return {status:'unmatched', reason:'profile_id_missing'};
  const sizeText = typeof c.size === 'string' ? c.size : '';
  const mSize = sizeText.match(/(\d+)\s*x\s*(\d+)/i);
  const width=+(c.width||c.size?.width||mSize?.[1]), height=+(c.height||c.size?.height||mSize?.[2]), openType=openingId(c), gg=glassGroup(c);
  const m=await priceMatrix({profile,openType,width,height,layout:c.layout || '1flg'});
  if(!m.row) return {status:'invalid', reason:'price_row_not_found'};
  const def=+m.row.price;
  const gp=await glassPrice(profileId, gg, width, height, def);
  let net=def + gp.add;
  const { myPricePercent } = await dfsConfiguratorValues();
  const percent=myPricePercent; // window.myPricePercent on DFS configurator
  net += net*percent/100;
  const gross=+(net*1.19).toFixed(2);
  const discount = await dfsDiscount(profile);
  const discountPercent = discount?.active ? +discount.sum : 0;
  const customerTotal = discountPercent ? +(gross * (1 - discountPercent / 100)).toFixed(2) : gross;
  const discountMetadata = discountPercent
    ? {observed:true,observedDiscountPercent:discountPercent/100,discountedTotalObserved:customerTotal,discountValidUntil:discount.discountValidUntil || null,note:`DFS-Aktionsrabatt ${discountPercent}% bis ${discount.discountValidUntil || 'unbekannt'}`,source:discount.source || 'company-discout'}
    : {observed:false,observedDiscountPercent:0,discountedTotalObserved:null,discountValidUntil:discount?.discountValidUntil || null,note:discount?.inactiveReason === 'expired' ? `Rabatt abgelaufen am ${discount.discountValidUntil} — Endpreis = Liste` : (discount?.inactiveReason === 'invalid_date' ? `Rabattdatum ungültig (${discount.discountValidUntil}) — Endpreis = Liste` : 'kein Live-Rabatt beobachtet; Endpreis = Listenpreis'),source:discount?.source || 'company-discout'};
  const warnings=[]; if(dfsDiscountScrapeFailed) warnings.push('dfs_discount_scrape_failed'); if(m.actual.width!==width||m.actual.height!==height) warnings.push(`dimension_rounded_to:${m.actual.width}x${m.actual.height}`);
  return {status:'priced', provider:'dfs', profileId, profileName:profile.name, brandId:profile.brand_id, openingTypeId:openType, layout:c.layout || '1flg', equivalence:{layout:c.layout||'1flg', construction:c.layout==='2flg_pfosten'?'2-flügelig mit Mittelpfosten':(c.layout==='2flg_stulp_dk_dreh'?'2-flügelig mit Stulp · Dreh-Kipp + Dreh':'1-flügelig'), width, height, glazing:c.glazing, color:c.color, proof:c.layout==='2flg_pfosten'?`DFS returned combined result bucket for window type 6 / group ${m.layoutRequest?.opid}`:(c.layout==='2flg_stulp_dk_dreh'?`DFS returned combined stulp result bucket for window type 6 / group ${m.layoutRequest?.opid} / openTypes 3+2`:'single-sash default')}, layoutRequest:m.layoutRequest, glassGroupId:gg, baseNet:def, glassAddNet:+gp.add.toFixed(6), comparePrice:{listTotal:gross,currency:'EUR',valid:warnings.length===0}, customerPrice:{total:customerTotal,currency:'EUR'}, discountMetadata, warnings, source:{api:'/konfigurator/fenster', glass:`/json/data_window_glass_${profileId}.json`}};
}

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const limit=args.limit?+args.limit:30;
await fs.mkdir(OUT_DIR,{recursive:true});
const catalogRaw=await readJson(path.join(ROOT,'data/comparison-catalog.json'));
const catalog=(Array.isArray(catalogRaw)?catalogRaw:catalogRaw.configs||[]).slice(0,limit);
const profiles=await readJson(path.join(ROOT,'data/dfs/data_window_1_profile.json'));
const results=[];
for (const c of catalog) { try { results.push({...c, dfs: await priceOne(c, profiles)}); } catch(e){ results.push({...c, dfs:{status:'error', error:e.message}}); } }
const summary={total:results.length, priced:results.filter(r=>r.dfs.status==='priced').length, unmatched:results.filter(r=>r.dfs.status==='unmatched').length, errors:results.filter(r=>r.dfs.status==='error').length};
await fs.writeFile(path.join(OUT_DIR,'results.json'), JSON.stringify({summary,results},null,2));
console.log(JSON.stringify({outDir:OUT_DIR, summary},null,2));
