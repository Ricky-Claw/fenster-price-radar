import fs from 'node:fs/promises';

const DFS_BASE = 'https://deutscher-fenstershop.de';
const FB_BASE = 'https://api.configurator.fensterblick.de';
const FV_BASE = 'https://www.fensterversand.com';
const glazings = ['2fach','3fach'];

const profiles = [
  {brand:'Drutex', profile:'Iglo 5 Classic', dfs:32, fb:'Drutex Iglo 5 Classic'},
  {brand:'Drutex', profile:'Iglo Energy Classic', dfs:35, fb:'Drutex Iglo Energy Classic'},
  {brand:'Aluplast', profile:'Ideal 4000', dfs:12, fb:'Aluplast Ideal 4000 Classic-Line', fv:'Aluplast Ideal 4000'},
  {brand:'Aluplast', profile:'Ideal 5000', dfs:82, fb:'Aluplast Ideal 5000 Soft-Line', fv:'Aluplast Ideal 5000'},
  {brand:'Aluplast', profile:'Ideal 7000', dfs:135, fb:'Aluplast Ideal 7000 Classic-Line', fv:'Aluplast Ideal 7000'},
  {brand:'Aluplast', profile:'Ideal 8000', dfs:14, fb:'Aluplast Ideal 8000 Classic-Line', fv:'Aluplast Ideal 8000'},
  {brand:'Gealan', profile:'Gealan S8000', dfs:87, fb:'Gealan S 8000'},
  {brand:'Gealan', profile:'Gealan S9000', dfs:66, fb:'Gealan S 9000'},
  {brand:'Salamander', profile:'Salamander 76MD', dfs:7, fb:'Salamander greenEvolution 76 MD'},
  {brand:'Salamander', profile:'Salamander 82', dfs:74, fb:'Salamander bluEvolution 82 MD Classic'},
  {brand:'Veka', profile:'Veka 82 MD', dfs:70, fv:'Veka Softline 82 MD'},
  {brand:'Kömmerling', profile:'Kömmerling 70', dfs:152, fv:'Kömmerling 70 AD'},
  {brand:'Kömmerling', profile:'Kömmerling 88', dfs:153, fv:'Kömmerling 88 MD'}
];

const dfsProfiles = JSON.parse(await fs.readFile('data/dfs/data_window_1_profile.json', 'utf8'));
const fbAliases = JSON.parse(await fs.readFile('data/fensterblick/profile-aliases.json', 'utf8'));
const fvAliases = JSON.parse(await fs.readFile('data/fensterversand/profile-aliases.json', 'utf8'));
const fvTemplate = JSON.parse(await fs.readFile('data/fensterversand/pvc-default-payload.json', 'utf8'));

async function dfsRows(profile) {
  const openType = 4;
  const body = { doprice:1, loadPrices:openType, stulp:0, bid:+profile.company_id, mid:+profile.material_id, pid:+profile.id, wid:1, opid:String(openType), size:{width:{},height:{}}, open_ids:[openType], dv:1 };
  const j = await postJson(`${DFS_BASE}/konfigurator/fenster`, body, DFS_BASE, `${DFS_BASE}/konfigurator/fenster`);
  return (j.result?.[openType] || []).map(r => ({width:+r.width, height:+r.height, price:+r.price})).filter(r => r.width && r.height && r.price > 0).sort((a,b)=>(a.width*a.height)-(b.width*b.height));
}

async function fbValid(aliasName, width, height) {
  if (!aliasName) return {offered:false, valid:true};
  const mapped = fbAliases[aliasName];
  if (!mapped) return {offered:false, valid:true};
  try {
    let j = await postJson(`${FB_BASE}/configurations/init-configuration`, {configurator_id:1, selectedIds:{material:10, profile:mapped.profileId}, country:'GERMANY'}, 'https://www.fensterblick.de', 'https://www.fensterblick.de/fenster-konfigurator.html');
    const prof = j.updates.materials[j.config_chain.material].profiles[j.config_chain.profile];
    const openingIndex = findOpening(prof, /Dreh-Kipp links/i, 5);
    if (openingIndex !== j.config_chain.opening_direction) j = await fbStep(j, 'opening_direction', openingIndex);
    const inputs = {...j.inputs, width, height, width_opening_direction:width, vane_widths:{vane_1_width:width,vane_2_width:0,vane_3_width:0,vane_4_width:0}};
    const priced = await postJson(`${FB_BASE}/configurations/process-input-change`, {configuration_id:j.configuration_id, configurator_id:1, config_chain:j.config_chain, ref_id_chain:j.ref_id_chain, inputs, country:'GERMANY'}, 'https://www.fensterblick.de', 'https://www.fensterblick.de/fenster-konfigurator.html');
    const actual = extractDims(priced.prices?.short_labels);
    return {offered:true, valid:Number(priced.prices?.total)>0 && actual?.width===width && actual?.height===height};
  } catch(e) { return {offered:true, valid:false, error:e.message}; }
}
async function fbStep(j,pos,idx){ return postJson(`${FB_BASE}/configurations/process-step-change`, {change_position:pos,new_step_index:idx,configurator_id:1,config_chain:j.config_chain,configuration_id:j.configuration_id,ref_id_chain:j.ref_id_chain,inputs:j.inputs,country:'GERMANY'}, 'https://www.fensterblick.de', 'https://www.fensterblick.de/fenster-konfigurator.html'); }
function findOpening(profile, rx, fallback){ const vt=profile.vane_types?.[0]; const i=(vt?.opening_directions||[]).findIndex(x=>rx.test(x.name||'')); return i>=0?i:fallback; }
function extractDims(labels){ const m=(labels||[]).find(l=>l.name==='Maße')?.value?.match(/(\d+)\s*mm\s*x\s*(\d+)\s*mm/i); return m?{width:Number(m[1]),height:Number(m[2])}:null; }

async function fvValid(aliasName, width, height) {
  if (!aliasName) return {offered:false, valid:true};
  const mapped = fvAliases[aliasName];
  if (!mapped) return {offered:false, valid:true};
  try {
    const p = structuredClone(fvTemplate); const c = p.configuration['25'];
    c.a_132.value=834; c.a_2471.value=mapped.brandId; c.a_133.value=mapped.profileId; c.a_258.value=width; c.a_259.value=height; c.a_186.value=1240; c.a_136.value=844; c.a_157.value=1021;
    const j = await postJson(`${FV_BASE}/configurator/update`, {configuration:p.configuration, productId:25}, FV_BASE, `${FV_BASE}/?cid=25&t=fenster-kunststoff`);
    const dims = j.dimensions || {};
    const exact = !dims.x || (+dims.x === width && +dims.y === height);
    return {offered:true, valid:Number(j.price?.total)>0 && exact};
  } catch(e) { return {offered:true, valid:false, error:e.message}; }
}

async function postJson(url, body, origin, referer) {
  const r = await fetch(url, {method:'POST', headers:{'content-type':'application/json', accept:'application/json, text/plain, */*', origin, referer}, body:JSON.stringify(body)});
  if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  return r.json();
}

function isRealisticWindow(row) {
  const ratio = row.height / row.width;
  return ratio >= 1.0 && ratio <= 1.85;
}
function nearest(rows, targetArea, used) {
  return rows
    .filter(r => !used.has(`${r.width}x${r.height}`) && isRealisticWindow(r))
    .sort((a,b)=>{
      const areaA = Math.abs(a.width*a.height-targetArea);
      const areaB = Math.abs(b.width*b.height-targetArea);
      const ratioA = Math.abs((a.height/a.width) - 1.35) * 180000;
      const ratioB = Math.abs((b.height/b.width) - 1.35) * 180000;
      return (areaA + ratioA) - (areaB + ratioB);
    })[0];
}
async function commonRows(profile, rows) {
  const cache = new Map();
  async function valid(r) {
    const key = `${r.width}x${r.height}`;
    if (cache.has(key)) return cache.get(key);
    const [fb, fv] = await Promise.all([fbValid(profile.fb, r.width, r.height), fvValid(profile.fv, r.width, r.height)]);
    const ok = fb.valid && fv.valid;
    cache.set(key, ok);
    await new Promise(res=>setTimeout(res, 120));
    return ok;
  }
  const realisticRows = rows.filter(isRealisticWindow);
  const asc = [];
  for (const r of realisticRows) { if (await valid(r)) { asc.push(r); break; } }
  const desc = [];
  for (const r of [...realisticRows].reverse()) { if (await valid(r)) { desc.push(r); break; } }
  if (!asc.length || !desc.length) return [];
  const min = asc[0], max = desc[0];
  const validPool = [];
  const minArea=min.width*min.height, maxArea=max.width*max.height;
  for (const r of realisticRows) {
    const area=r.width*r.height;
    if (area <= minArea || area >= maxArea) continue;
    if (await valid(r)) validPool.push(r);
    if (validPool.length > 120) break;
  }
  const used = new Set([`${min.width}x${min.height}`, `${max.width}x${max.height}`]);
  const mid1 = nearest(validPool, minArea + (maxArea-minArea)*0.38, used); if(mid1) used.add(`${mid1.width}x${mid1.height}`);
  const mid2 = nearest(validPool, minArea + (maxArea-minArea)*0.66, used);
  return [
    {row:min, sizeRole:'kleinster gemeinsamer Nenner'},
    {row:mid1, sizeRole:'gemeinsame mittlere Größe 1'},
    {row:mid2, sizeRole:'gemeinsame mittlere Größe 2'},
    {row:max, sizeRole:'größter gemeinsamer Nenner'}
  ].filter(x=>x.row);
}

const configs=[]; const sizeMatrix={};
for (const p of profiles) {
  const dfsProfile = dfsProfiles.find(x=>+x.id===+p.dfs);
  const rows = await dfsRows(dfsProfile);
  const sizes = await commonRows(p, rows);
  sizeMatrix[`${p.brand}|${p.profile}`] = { dfsProfileId:p.dfs, dfsProfileName:dfsProfile.name, providers:{dfs:true, fensterblick:!!p.fb, fensterversand:!!p.fv}, dfsAvailableRows:rows.length, selected:sizes.map(s=>({size:`${s.row.width}x${s.row.height}`, sizeRole:s.sizeRole})) };
  for (const {row,sizeRole} of sizes) for (const glazing of glazings) configs.push({brand:p.brand, profile:`${p.profile}, ${glazing}`, material:'PVC', size:`${row.width}x${row.height}`, width:row.width, height:row.height, sizeRole, glazing, color:'weiß', opening:'Dreh-Kipp', sourceSheet:'generated-v5-common-provider-size-radar'});
  console.log(p.brand, p.profile, sizeMatrix[`${p.brand}|${p.profile}`].selected);
}
await fs.writeFile('data/comparison-catalog.json', JSON.stringify({generatedAt:new Date().toISOString(), scope:'V5 common-provider size radar: smallest/largest common exact size across DFS and offered competitor providers; 2 middle exact common sizes; 2fach/3fach, DK, white', sizeMatrix, configs}, null, 2));
console.log(`wrote ${configs.length} configs`);
