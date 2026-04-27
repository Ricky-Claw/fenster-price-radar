import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'results', `dfs-mapped-pvc-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const BASE = 'https://deutscher-fenstershop.de';
const PROFILE_ALIASES = {
  'drutex|iglo 5 classic': 32, 'drutex|iglo 5': 31, 'drutex|iglo energy classic': 35, 'drutex|iglo energy': 34, 'drutex|iglo ext': 122, 'drutex|iglo premier': 126,
  'aluplast|ideal 4000': 12, 'aluplast|ideal 4000 classic': 12,
  'aluplast|ideal neo ad': 156, 'aluplast|ideal neo md': 130,
  'aluplast|ideal 8000': 14, 'aluplast|ideal 7000': 13, 'aluplast|ideal 5000': 11,
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
function glassGroup(c){ const s=norm(c.glazing || c.glass || '3fach'); if(s.includes('2')) return 1; return 2; }
async function readJson(p){ return JSON.parse(await fs.readFile(p,'utf8')); }
async function fetchJson(url, opts={}){ const r=await fetch(url, opts); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }
function parseAdd(price,type,w,h,current){ price=+price||0; if(!price) return 0; switch(type){ case '%': return current*price/100; case 'm2': return price*(w/1000)*(h/1000); case 'l': case 'm': return (w/1000*2+h/1000*2)*price; case 'lm': return (w/1000+h/1000)*price; case 'mw': return price*(w/1000); case 'mh': return price*(h/1000); default: return price; } }
async function priceMatrix({profile, openType, width, height}){
  const body={doprice:1,loadPrices:openType,stulp:0,bid:+profile.company_id,mid:+profile.material_id,pid:+profile.id,wid:1,opid:String(openType),size:{width:{},height:{}},open_ids:[openType],dv:1};
  const j=await fetchJson(`${BASE}/konfigurator/fenster`,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','origin':BASE,'referer':`${BASE}/konfigurator/fenster`},body:JSON.stringify(body)});
  const list=j.result?.[openType]||[];
  let row=list.find(x=>+x.width===+width && +x.height===+height) || list.find(x=>+x.width>=+width && +x.height>=+height);
  return {row, requested:{width,height}, actual: row?{width:+row.width,height:+row.height}:null};
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
  const m=await priceMatrix({profile,openType,width,height});
  if(!m.row) return {status:'invalid', reason:'price_row_not_found'};
  const def=+m.row.price;
  const gp=await glassPrice(profileId, gg, width, height, def);
  let net=def + gp.add;
  const percent=90; // window.myPricePercent on DFS configurator
  net += net*percent/100;
  const gross=+(net*1.19).toFixed(2);
  const warnings=[]; if(m.actual.width!==width||m.actual.height!==height) warnings.push(`dimension_rounded_to:${m.actual.width}x${m.actual.height}`);
  return {status:'priced', provider:'dfs', profileId, profileName:profile.name, brandId:profile.brand_id, openingTypeId:openType, glassGroupId:gg, baseNet:def, glassAddNet:+gp.add.toFixed(6), comparePrice:{listTotal:gross,currency:'EUR',valid:warnings.length===0}, warnings, source:{api:'/konfigurator/fenster', glass:`/json/data_window_glass_${profileId}.json`}};
}

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const limit=args.limit?+args.limit:30;
await fs.mkdir(OUT_DIR,{recursive:true});
const catalogRaw=await readJson(path.join(ROOT,'data/pvc-benchmark-from-excel.json'));
const catalog=(Array.isArray(catalogRaw)?catalogRaw:catalogRaw.configs||[]).slice(0,limit);
const profiles=await readJson(path.join(ROOT,'data/dfs/data_window_1_profile.json'));
const results=[];
for (const c of catalog) { try { results.push({...c, dfs: await priceOne(c, profiles)}); } catch(e){ results.push({...c, dfs:{status:'error', error:e.message}}); } }
const summary={total:results.length, priced:results.filter(r=>r.dfs.status==='priced').length, unmatched:results.filter(r=>r.dfs.status==='unmatched').length, errors:results.filter(r=>r.dfs.status==='error').length};
await fs.writeFile(path.join(OUT_DIR,'results.json'), JSON.stringify({summary,results},null,2));
console.log(JSON.stringify({outDir:OUT_DIR, summary},null,2));
