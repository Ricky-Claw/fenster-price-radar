import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DFS_BASE = 'https://deutscher-fenstershop.de';
const FV_BASE = 'https://www.fensterversand.com';
const FB_BASE = 'https://api.configurator.fensterblick.de';

const PROFILES = [
  { id:'drutex-iglo-5-classic', brand:'Drutex', profile:'Iglo 5 Classic', dfs:32, fb:'Drutex Iglo 5 Classic' },
  { id:'drutex-iglo-energy-classic', brand:'Drutex', profile:'Iglo Energy Classic', dfs:35, fb:'Drutex Iglo Energy Classic' },
  { id:'aluplast-ideal-neo-md', brand:'Aluplast', profile:'Ideal Neo MD', dfs:130, fb:'Aluplast Ideal Neo MD', fv:'Aluplast Ideal Neo MD' },
  { id:'aluplast-ideal-4000', brand:'Aluplast', profile:'Ideal 4000', dfs:12, fb:'Aluplast Ideal 4000 Classic-Line', fv:'Aluplast Ideal 4000' },
  { id:'aluplast-ideal-8000', brand:'Aluplast', profile:'Ideal 8000', dfs:14, fb:'Aluplast Ideal 8000 Classic-Line', fv:'Aluplast Ideal 8000' },
  { id:'kommerling-70-ad', brand:'Kömmerling', profile:'Kömmerling 70 AD', dfs:40, fv:'Kömmerling 70 AD' },
  { id:'kommerling-88-md', brand:'Kömmerling', profile:'Kömmerling 88 MD', dfs:39, fv:'Kömmerling 88 MD' },
  { id:'veka-softline-70-ad', brand:'Veka', profile:'Softline 70 AD', fv:'Veka Softline 70 AD' },
  { id:'veka-softline-82-md', brand:'Veka', profile:'Softline 82 MD', fv:'Veka Softline 82 MD' }
];

let cache = {};
async function json(file){ if(!cache[file]) cache[file]=JSON.parse(await fs.readFile(path.join(ROOT,file),'utf8')); return cache[file]; }
function money(v){ return typeof v==='number' && Number.isFinite(v) ? Math.round(v*100)/100 : null; }
function parseAdd(price,type,w,h,current){ price=+price||0; if(!price) return 0; switch(type){ case '%': return current*price/100; case '-%': return -Math.abs(current*price/100); case 'm2': return price*(w/1000)*(h/1000); case 'l': case 'm': return (w/1000*2+h/1000*2)*price; case 'lm': return (w/1000+h/1000)*price; case 'mw': return price*(w/1000); case 'mh': return price*(h/1000); default: return price; } }
function openingId(opening){ return /fest/i.test(opening) ? 6 : 4; }
function fvOpening(opening){ return /fest/i.test(opening) ? 1020 : 1021; }
function glassGroup(glazing){ return /2/.test(glazing) ? 1 : 2; }

export default async function handler(req,res){
  try{
    const q=req.query || Object.fromEntries(new URL(req.url,'http://x').searchParams.entries());
    const profile=PROFILES.find(p=>p.id===q.profile) || PROFILES[0];
    const width=Number(q.width||600), height=Number(q.height||600);
    const glazing=String(q.glazing||'3fach');
    const opening=String(q.opening||'Dreh-Kipp');
    const color=String(q.color||'weiß');
    if(width<300||width>3000||height<300||height>2600) return res.status(400).json({error:'width/height out of V1 range'});
    const [dfs,fensterblick,fensterversand]=await Promise.allSettled([
      quoteDfs({profile,width,height,glazing,opening}),
      quoteFb({profile,width,height,glazing,opening,color}),
      quoteFv({profile,width,height,glazing,opening,color})
    ]);
    const providers={ dfs: normResult(dfs), fensterblick:normResult(fensterblick), fensterversand:normResult(fensterversand) };
    const valid=Object.entries(providers).filter(([,p])=>p.valid && typeof p.listTotal==='number');
    res.setHeader('cache-control','no-store');
    res.json({ generatedAt:new Date().toISOString(), input:{profile, width,height,glazing,opening,color}, providers, best: valid.sort((a,b)=>a[1].listTotal-b[1].listTotal)[0] || null });
  }catch(e){ res.status(500).json({error:e.message}); }
}
function normResult(r){ return r.status==='fulfilled' ? r.value : {status:'error',valid:false,error:r.reason?.message||String(r.reason)}; }

async function quoteDfs({profile,width,height,glazing,opening}){
  if(!profile.dfs) return {status:'unmatched',valid:false,reason:'profile_not_available'};
  const profiles=await json('data/dfs/data_window_1_profile.json');
  const p=profiles.find(x=>+x.id===+profile.dfs);
  if(!p) return {status:'unmatched',valid:false,reason:'dfs_profile_missing'};
  const openType=openingId(opening);
  const body={doprice:1,loadPrices:openType,stulp:0,bid:+p.company_id,mid:+p.material_id,pid:+p.id,wid:1,opid:String(openType),size:{width:{},height:{}},open_ids:[openType],dv:1};
  const r=await fetch(`${DFS_BASE}/konfigurator/fenster`,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','origin':DFS_BASE,'referer':`${DFS_BASE}/konfigurator/fenster`},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`DFS HTTP ${r.status}`);
  const j=await r.json();
  const list=j.result?.[openType]||[];
  const row=list.find(x=>+x.width===width && +x.height===height) || list.find(x=>+x.width>=width && +x.height>=height);
  if(!row) return {status:'invalid',valid:false,reason:'price_row_not_found'};
  const base=+row.price;
  const glass=await dfsGlass(profile.dfs, glassGroup(glazing), width, height, base);
  let net=base+glass.add;
  net += net*0.90;
  const listTotal=money(net*1.19);
  const warnings=[]; if(+row.width!==width||+row.height!==height) warnings.push(`dimension_rounded_to:${row.width}x${row.height}`);
  return {status:'priced',valid:warnings.length===0,listTotal,currency:'EUR',warnings,parts:{baseNet:base,glassAddNet:money(glass.add)}};
}
async function dfsGlass(profileId, groupId, width, height, defPrice){
  const pid=(profileId===56||profileId===144)?37:profileId;
  const glass=await fetch(`${DFS_BASE}/json/data_window_glass_${pid}.json?t=1.22`).then(r=>r.json());
  for(const top of Object.values(glass[0]||{})) for(const item of Object.values(top||{})) if(+item.group_id===+groupId) return {item,add:parseAdd(item.price,item.price_type,width,height,defPrice)};
  return {item:null,add:0};
}

async function quoteFb({profile,width,height,glazing,opening,color}){
  if(!profile.fb) return {status:'unmatched',valid:false,reason:'profile_not_available'};
  const aliases=await json('data/fensterblick/profile-aliases.json');
  const mapped=aliases[profile.fb];
  if(!mapped) return {status:'unmatched',valid:false,reason:'alias_missing'};
  let j=await fbPost('/configurations/init-configuration',{configurator_id:1,selectedIds:{material:10,profile:mapped.profileId},country:'GERMANY'});
  const prof=j.updates.materials[j.config_chain.material].profiles[j.config_chain.profile];
  const glazingIndex=/2/.test(glazing)?findIndex(prof.glazings,/2-fach Verglasung$/i,0):findIndex(prof.glazings,/3-fach Verglasung$/i,2);
  if(glazingIndex!==j.config_chain.glazing) j=await fbStep(j,'glazing',glazingIndex);
  const openingIndex=/fest/i.test(opening)?0:findOpening(prof,/Dreh-Kipp links/i,5);
  if(openingIndex!==j.config_chain.opening_direction) j=await fbStep(j,'opening_direction',openingIndex);
  if(/anthrazit/i.test(color)) j=await fbStep(j,'color_outer',findIndex(prof.colors,/Anthrazitgrau/i,1));
  const inputs={...j.inputs,width,height,width_opening_direction:width,vane_widths:{vane_1_width:width,vane_2_width:0,vane_3_width:0,vane_4_width:0}};
  const priced=await fbPost('/configurations/process-input-change',{configuration_id:j.configuration_id,configurator_id:1,config_chain:j.config_chain,ref_id_chain:j.ref_id_chain,inputs,country:'GERMANY'});
  const actual=extractDims(priced.prices?.short_labels);
  const dimsMatch=actual?.width===width && actual?.height===height;
  const total=Number(priced.prices?.total);
  const warnings=[]; if(!dimsMatch) warnings.push(`dimension_adjusted_by_configurator:${actual?.width}x${actual?.height}`); if(total<=0) warnings.push('zero_or_unavailable_price');
  return {status:'priced',valid:total>0&&dimsMatch,listTotal:money(total),currency:'EUR',warnings,discountMetadata:{observedDiscountPercent:priced.discount_percent,discountedTotalObserved:priced.discount_percent?money(total*(1-priced.discount_percent)):null}};
}
async function fbStep(j,pos,idx){ return fbPost('/configurations/process-step-change',{change_position:pos,new_step_index:idx,configurator_id:1,config_chain:j.config_chain,configuration_id:j.configuration_id,ref_id_chain:j.ref_id_chain,inputs:j.inputs,country:'GERMANY'}); }
async function fbPost(url,body){ const r=await fetch(FB_BASE+url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','origin':'https://www.fensterblick.de','referer':'https://www.fensterblick.de/fenster-konfigurator.html'},body:JSON.stringify(body)}); if(!r.ok) throw new Error(`Fensterblick ${url} HTTP ${r.status}`); return r.json(); }
function findIndex(arr,rx,fallback){ const i=(arr||[]).findIndex(x=>rx.test(x.name||'')); return i>=0?i:fallback; }
function findOpening(profile,rx,fallback){ const vt=profile.vane_types?.[0]; const i=(vt?.opening_directions||[]).findIndex(x=>rx.test(x.name||'')); return i>=0?i:fallback; }
function extractDims(labels){ const m=(labels||[]).find(l=>l.name==='Maße')?.value?.match(/(\d+)\s*mm\s*x\s*(\d+)\s*mm/i); return m?{width:Number(m[1]),height:Number(m[2])}:null; }

async function quoteFv({profile,width,height,glazing,opening,color}){
  if(!profile.fv) return {status:'unmatched',valid:false,reason:'profile_not_available'};
  const template=await json('data/fensterversand/pvc-default-payload.json');
  const aliases=await json('data/fensterversand/profile-aliases.json');
  const mapped=aliases[profile.fv];
  if(!mapped) return {status:'unmatched',valid:false,reason:'alias_missing'};
  const p=structuredClone(template); const c=p.configuration['25'];
  c.a_132.value=834; c.a_2471.value=mapped.brandId; c.a_133.value=mapped.profileId; c.a_258.value=width; c.a_259.value=height;
  c.a_186.value=/2/.test(glazing)?1238:1240; c.a_136.value=/anthrazit/i.test(color)?849:844; c.a_157.value=fvOpening(opening);
  const r=await fetch(`${FV_BASE}/configurator/update`,{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/plain, */*','origin':FV_BASE,'referer':`${FV_BASE}/?cid=25&t=fenster-kunststoff`},body:JSON.stringify({configuration:p.configuration,productId:25})});
  if(!r.ok) throw new Error(`Fensterversand HTTP ${r.status}`);
  const j=await r.json(); const total=Number(j.price?.total); const warnings=total>0?[]:['zero_or_unavailable_price'];
  return {status:'priced',valid:total>0,listTotal:money(total),currency:'EUR',warnings,discountMetadata:{discountedTotalObserved:money(Number(j.price?.discountedTotal)),observedDiscount:Number(j.price?.discount)}};
}
