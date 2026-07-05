import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../../..');
const catalog=JSON.parse(await fs.readFile(path.join(root,'data/comparison-catalog.json'),'utf8')).configs;
const aliases=JSON.parse(await fs.readFile(path.join(root,'data/fensterblick/profile-aliases.json'),'utf8'));
const doorAliases=JSON.parse(await fs.readFile(path.join(root,'data/fensterblick/balkontuer-profile-aliases.json'),'utf8'));
const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]||30);
const outDir=path.join(root,'results',`fensterblick-mapped-pvc-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(outDir,{recursive:true});
const results=[];
for(const cfg of catalog.slice(0,limit)){
 const isDoor=cfg.productType==='balkontuer';
 const mapped=isDoor?mapDoorProfile(cfg):mapProfile(cfg);
 if(!mapped){results.push({provider:'Fensterblick',input:cfg,status:'unmatched',reason:isDoor?'nicht_im_angebot':'No profile alias match'}); continue;}
 const [w,h]=cfg.size.toLowerCase().split('x').map(Number);
 try{ const priced=await price({profileId:mapped.profileId,width:w,height:h,glazing:cfg.glazing,opening:cfg.opening||'Dreh-Kipp links',color:cfg.color||'weiß',layout:cfg.layout||'1flg',configuratorId:isDoor?2:1});
  const actualDims=extractDims(priced.prices?.short_labels);
  const dimsMatch=actualDims?.width===w && actualDims?.height===h;
  const warn=[]; if(Number(priced.prices?.total)<=0) warn.push('zero_or_unavailable_price'); if(!dimsMatch) warn.push(`dimension_adjusted_by_configurator:${actualDims?.width}x${actualDims?.height}`);
  // ponytail: FB klemmt out-of-range Maße auf eine andere Größe -> Größe schlicht nicht im Angebot, kein valider Vergleich.
  if(!dimsMatch){ results.push({provider:'Fensterblick',input:cfg,mappedProfile:mapped.name,status:'unmatched',reason:'nicht_im_angebot',note:`Größe ${w}x${h} nicht konfigurierbar (Anbieter würde ${actualDims?.width}x${actualDims?.height} liefern)`,warnings:warn}); continue; }
  const listTotal = Number(priced.prices?.total);
  const discount = Number(priced.discount_percent || 0);
  const discountedTotal = discount ? Number((listTotal * (1 - discount)).toFixed(2)) : null;
  const labels = priced.prices?.short_labels || [];
  const labelText = labels.map(l=>`${l.name}:${l.value}`).join(' | ');
  // Balkontür ist einflügelig wie '1flg' (eigener Produkttyp, keine 2fluegelige Fenster-Bauart) -> gleiche Aequivalenzregel.
  const equivalent = ['1flg','balkontuer'].includes(cfg.layout || '1flg') || (/2-Flügel/i.test(labelText) && (/Pfosten/i.test(labelText) || /Stulp/i.test(labelText)));
  results.push({provider:'Fensterblick',input:cfg,mappedProfile:mapped.name,status:200,comparePrice:{listTotal,currency:'EUR',discountApplied:!!discount,valid:listTotal>0 && dimsMatch && equivalent},customerPrice:{total:discountedTotal || listTotal,currency:'EUR'},equivalence:{layout:cfg.layout||'1flg',construction:labels.find(l=>l.name==='Typ')?.value || '',opening:labels.find(l=>l.name==='Öffnung')?.value || '',proof:labelText},discountMetadata:{observed:!!discount,observedDiscountPercent:discount,discountedTotalObserved: discountedTotal,note:discount?'Live-Rabatt vom Anbieter beobachtet':'kein Live-Rabatt beobachtet; Endpreis = Listenpreis'},labels,actualDimensions:actualDims,configChain:priced.config_chain,refIdChain:priced.ref_id_chain,warnings: equivalent ? warn : [...warn,'fensterblick_two_sash_label_not_proven']});
 }catch(e){results.push({provider:'Fensterblick',input:cfg,mappedProfile:mapped.name,status:'error',error:String(e.message||e)});} 
 await new Promise(r=>setTimeout(r,900));
}
const outFile=path.join(outDir,'results.json');
await fs.writeFile(outFile,JSON.stringify({generatedAt:new Date().toISOString(),pricePolicy:'comparePrice.listTotal only; discounts manual later',results},null,2));
console.log(JSON.stringify({outFile,priced:results.filter(r=>r.status===200).length,unmatched:results.filter(r=>r.status==='unmatched').length,errors:results.filter(r=>r.status==='error').length,sample:results.slice(0,12).map(r=>({input:r.input?.profile,size:r.input?.size,mapped:r.mappedProfile,status:r.status,price:r.comparePrice?.listTotal,labels:r.labels?.map(l=>`${l.name}:${l.value}`).join(' | ')}))},null,2));
async function price({profileId,width,height,glazing,opening,color,layout='1flg',configuratorId=1}){
 let j=await post('/configurations/init-configuration',{configurator_id:configuratorId,selectedIds:{material:10,profile:profileId},country:'GERMANY'});
 const profile=j.updates.materials[j.config_chain.material].profiles[j.config_chain.profile];
 const glazingIndex=/3fach/i.test(glazing)? findIndex(profile.glazings,/3-fach Verglasung$/i,2) : findIndex(profile.glazings,/2-fach Verglasung$/i,0);
 if(glazingIndex!==j.config_chain.glazing) j=await step(j,'glazing',glazingIndex,configuratorId);
 // Balkontür (configuratorId 2): einflügelig, Standard-Öffnung des Anbieters uebernehmen - keine Dreh-Kipp/Pfosten-Logik der Fenster.
 if(configuratorId===1){
  if(layout !== '1flg') j=await step(j,'vane_type',1,configuratorId);
  const openingIndex = layout === '2flg_pfosten' ? findOpeningFromUpdates(j,/Dreh-Kipp \+ Dreh-Kipp \(Pfosten\)/i,7)
   : layout === '2flg_stulp_dk_dreh' ? findOpeningFromUpdates(j,/Dreh-Kipp \+ Dreh \(Stulp\)/i,8)
   : /fest/i.test(opening)?0:findOpening(profile, /Dreh-Kipp links/i, 5);
  if(openingIndex!==j.config_chain.opening_direction) j=await step(j,'opening_direction',openingIndex,configuratorId);
 }
 // colors: default white. anthracite outside/interior white needs exact split later.
 if(/anthrazit/i.test(color)) j=await step(j,'color_outer',findIndex(profile.colors,/Anthrazitgrau \(AP 40\)/i,1),configuratorId);
 const half=Math.floor(width/2);
 const inputs={...j.inputs,width,height,width_opening_direction:width,vane_widths:{vane_1_width:layout==='1flg'?width:half,vane_2_width:layout==='1flg'?0:width-half,vane_3_width:0,vane_4_width:0}};
 return post('/configurations/process-input-change',{configuration_id:j.configuration_id,configurator_id:configuratorId,config_chain:j.config_chain,ref_id_chain:j.ref_id_chain,inputs,country:'GERMANY'});
}
async function step(j,pos,idx,configuratorId=1){return post('/configurations/process-step-change',{change_position:pos,new_step_index:idx,configurator_id:configuratorId,config_chain:j.config_chain,configuration_id:j.configuration_id,ref_id_chain:j.ref_id_chain,inputs:j.inputs,country:'GERMANY'});}
async function post(url,body){const r=await fetch('https://api.configurator.fensterblick.de'+url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','origin':'https://www.fensterblick.de','referer':'https://www.fensterblick.de/fenster-konfigurator.html'},body:JSON.stringify(body)}); if(!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.json();}
function findIndex(arr,rx,fallback){const i=(arr||[]).findIndex(x=>rx.test(x.name||'')); return i>=0?i:fallback;}
function findOpening(profile,rx,fallback){const vt=profile.vane_types?.[0]; const i=(vt?.opening_directions||[]).findIndex(x=>rx.test(x.name||'')); return i>=0?i:fallback;}
function findOpeningFromUpdates(j,rx,fallback){const i=(j.updates?.opening_directions||[]).findIndex(x=>rx.test(x.name||'')); return i>=0?i:fallback;}
function mapProfile(cfg){const hay=`${cfg.brand} ${cfg.profile}`.toLowerCase();
 for(const [name,ids] of Object.entries(aliases)){const n=name.toLowerCase(); if(hay.includes(n)||n.includes(clean(cfg.profile))) return {name,...ids};}
 if(/iglo\s*5\s*classic/i.test(cfg.profile)) return {name:'Drutex Iglo 5 Classic',...aliases['Drutex Iglo 5 Classic']};
 if(/iglo\s*energy\s*classic/i.test(cfg.profile)) return {name:'Drutex Iglo Energy Classic',...aliases['Drutex Iglo Energy Classic']};
 if(/iglo\s*energy/i.test(cfg.profile)) return {name:'Drutex Iglo Energy',...aliases['Drutex Iglo Energy']};
 if(/iglo\s*ext/i.test(cfg.profile)) return {name:'Drutex Iglo EXT',...aliases['Drutex Iglo EXT']};
 if(/ideal\s*neo\s*md/i.test(cfg.profile)) return {name:'Aluplast Ideal Neo MD',...aliases['Aluplast Ideal Neo MD']};
 if(/ideal\s*neo\s*ad/i.test(cfg.profile)) return {name:'Aluplast Ideal Neo AD',...aliases['Aluplast Ideal Neo AD']};
 if(/ideal\s*4000/i.test(cfg.profile)) return {name:'Aluplast Ideal 4000 Classic-Line',...aliases['Aluplast Ideal 4000 Classic-Line']};
 if(/ideal\s*8000/i.test(cfg.profile)) return {name:'Aluplast Ideal 8000 Classic-Line',...aliases['Aluplast Ideal 8000 Classic-Line']};
 if(/gealan\s*s?\s*8000/i.test(cfg.profile)) return {name:'Gealan S 8000',...aliases['Gealan S 8000']};
 if(/gealan\s*s?\s*9000/i.test(cfg.profile)) return {name:'Gealan S 9000',...aliases['Gealan S 9000']};
 if(/salamander.*76/i.test(cfg.profile)) return {name:'Salamander greenEvolution 76 MD',...aliases['Salamander greenEvolution 76 MD']};
 if(/salamander.*82/i.test(cfg.profile)) return {name:'Salamander bluEvolution 82 MD Classic',...aliases['Salamander bluEvolution 82 MD Classic']};
 return null;}
function clean(p){return String(p||'').toLowerCase().replace(/,?\s*[23]fach/g,'').trim();}
function mapDoorProfile(cfg){const hay=`${cfg.brand} ${cfg.profile}`.toLowerCase();
 for(const [name,ids] of Object.entries(doorAliases)){const n=name.toLowerCase(); if(hay.includes(n)||n.includes(clean(cfg.profile))) return {name,...ids};}
 return null;}
function extractDims(labels){const m=(labels||[]).find(l=>l.name==='Maße')?.value?.match(/(\d+)\s*mm\s*x\s*(\d+)\s*mm/i); return m?{width:Number(m[1]),height:Number(m[2])}:null;}
