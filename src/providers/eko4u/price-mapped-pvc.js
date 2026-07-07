// Eko4u (Eko-Okna Händlerportal): Einkaufspreise für Katalog-Konfigurationen.
// Login-pflichtig: EKO4U_LOGIN + EKO4U_PASSWORD aus Env oder .env (gitignored). Ohne Creds: sauberer Skip (Exit 0, kein Results-Ordner).
// Preisquelle: POST /?p=configurator.workshop mit voll serialisiertem form_configurator; PRICE = Herstellerpreis netto ("price from the manufacturer").
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'../../..');

loadDotEnv(path.join(root,'.env'));
const LOGIN=process.env.EKO4U_LOGIN;
const PASSWORD=process.env.EKO4U_PASSWORD;
if(!LOGIN||!PASSWORD){
 console.log('EKO4U_LOGIN/EKO4U_PASSWORD fehlen — Eko4u-Lauf übersprungen (keine Einkaufspreise in diesem Update).');
 process.exit(0);
}

const catalog=JSON.parse(await fs.readFile(path.join(root,'data/comparison-catalog.json'),'utf8')).configs;
const aliases=JSON.parse(await fs.readFile(path.join(root,'data/eko4u/profile-aliases.json'),'utf8'));
const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]||catalog.length);
const only=process.argv.find(a=>a.startsWith('--only='))?.split('=')[1];
const BASE='https://eko4u.com';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const P='WORKSHOP[CONFIGS][CONFIG][0]';
const GLAZING_2FACH='STD_4/16/4';
const GLAZING_3FACH='2S_001_02'; // 4/14Ar/4/14Ar/4 [Ug=0.6] Rw=32dB (40mm), Eko4u-Vorschlagsliste

const outDir=path.join(root,'results',`eko4u-mapped-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const results=[];
const jar=new Map();

await login();
let processed=0;
for(const cfg of catalog.slice(0,limit)){
 if(only && !new RegExp(only,'i').test(`${cfg.brand} ${cfg.profile} ${cfg.layout} ${cfg.size}`)){continue;}
 processed++;
 const mapped=mapProfile(cfg);
 if(!mapped){results.push({provider:'Eko4u',input:cfg,status:'unmatched',reason:'nicht_im_angebot',note:'Kein Eko-Okna-System für dieses Profil (z.B. Drutex/Kömmerling/Veka nicht im Herstellerprogramm)'}); continue;}
 const lid=lidFor(cfg,mapped.alias);
 if(!lid){results.push({provider:'Eko4u',input:cfg,mappedProfile:mapped.name,status:'unmatched',reason:'nicht_im_angebot',note:`Bauart ${cfg.layout||'1flg'} für ${mapped.name} nicht gemappt`}); continue;}
 try{
  const priced=await priceConfig(cfg,mapped,lid);
  results.push(priced);
 }catch(e){
  results.push({provider:'Eko4u',input:cfg,mappedProfile:mapped.name,status:'error',error:String(e.message||e)});
 }
 await sleep(600);
}
await fs.mkdir(outDir,{recursive:true});
const outFile=path.join(outDir,'results.json');
await fs.writeFile(outFile,JSON.stringify({generatedAt:new Date().toISOString(),pricePolicy:'Eko4u Herstellerpreis netto (Einkauf); kein Wettbewerber im Radar-Vergleich',results},null,2));
console.log(JSON.stringify({outFile,processed,priced:results.filter(r=>r.status===200).length,unmatched:results.filter(r=>r.status==='unmatched').length,errors:results.filter(r=>r.status==='error').length,sample:results.filter(r=>r.status===200).slice(0,10).map(r=>({profile:r.input?.profile,layout:r.input?.layout,size:r.input?.size,ek:r.comparePrice?.listTotal,uw:r.equivalence?.uw}))},null,2));
if(results.some(r=>r.status==='error')) process.exitCode=1;

async function priceConfig(cfg,mapped,lid){
 const [w,h]=cfg.size.toLowerCase().split('x').map(Number);
 const init=await workshopInit(lid);
 if(hasError(init)) throw new Error(`Init ${lid}: ERROR_CODE ${init.ERROR_CODE} ${init.ERROR_MESSAGE||''}`);
 const baseForm=init.options||'';
 const overrides={[`${P}[WIDTH]`]:String(w),[`${P}[HEIGHT]`]:String(h)};
 const is3fach=/3\s*-?fach/i.test(cfg.glazing||'');
 const glazingCode=is3fach?GLAZING_3FACH:(mapped.alias.glazing2||GLAZING_2FACH);
 overrides[`${P}[GLAZING]`]=glazingCode;
 if(is3fach && mapped.alias.glazing3Beads) overrides[`${P}[GLAZING_BEADS]`]=mapped.alias.glazing3Beads;
 if(cfg.layout==='2flg_pfosten'){
  const ruFitting=fieldValue(baseForm,`${P}[SASH][2][FITTING]`);
  if(!ruFitting) throw new Error('Pfosten-Layout: SASH[2][FITTING] nicht im Formular gefunden');
  overrides[`${P}[SASH][1][FITTING]`]=ruFitting; // R_RU -> RU_RU (Dreh-Kipp + Dreh-Kipp)
 }
 const res=await workshopApply(baseForm,overrides);
 // ERROR_CODE 4 = Fertigungs-/Maßgrenze des Herstellers (z.B. "maximum sash surface exceeded (> 2,4 m2)",
 // "Window too low. Misses 92 mm") -> als "nicht im Angebot" werten und den Original-Grund in die Note schreiben.
 if(String(res?.ERROR_CODE)==='4'){
  const explanation=String(res?.ERROR_EXPLANATION||'').split('\n').filter(l=>l.trim()&&!/^Echec\s/i.test(l)).join(' | ').trim();
  return {provider:'Eko4u',input:cfg,mappedProfile:mapped.name,status:'unmatched',reason:'nicht_im_angebot',note:`Eko4u kann ${w}x${h} ${cfg.glazing||''} nicht fertigen: ${explanation||'Computation error'} (${lid})`};
 }
 if(hasError(res)) throw new Error(`Workshop ${lid}: ERROR_CODE ${res.ERROR_CODE} ${res.ERROR_MESSAGE||''}`);
 const form=res.options||'';
 const price=parsePrice(res.PRICE);
 const wEcho=Number(fieldValue(form,`${P}[WIDTH]`));
 const hEcho=Number(fieldValue(form,`${P}[HEIGHT]`));
 const glazingEcho=fieldValue(form,`${P}[GLAZING]`);
 const fit1=fieldValue(form,`${P}[SASH][1][FITTING]`);
 const fit2=fieldValue(form,`${P}[SASH][2][FITTING]`);
 const warnings=[];
 if(!(price>0)) warnings.push('zero_or_unavailable_price');
 if(wEcho!==w||hEcho!==h){
  return {provider:'Eko4u',input:cfg,mappedProfile:mapped.name,status:'unmatched',reason:'nicht_im_angebot',note:`Größe ${w}x${h} nicht konfigurierbar (Konfigurator meldet ${wEcho}x${hEcho})`,warnings};
 }
 if(glazingEcho!==glazingCode) warnings.push(`glazing_nicht_uebernommen:${glazingEcho}`);
 if(cfg.layout==='2flg_pfosten' && (!fit1||!/RU$/.test(fit1)||fit1!==fit2)) warnings.push(`pfosten_fittings_unbestaetigt:${fit1}/${fit2}`);
 if(cfg.layout==='2flg_stulp_dk_dreh' && !(fit1&&/R_?RU/i.test(fit1))) warnings.push(`stulp_fittings_unbestaetigt:${fit1||'-'}`); // Stulp trägt EIN kombiniertes Fitting, z.B. ROTO_NX_R_RU (Dreh + Dreh-Kipp)
 if(mapped.alias.varianteHinweis) warnings.push('aluprof_variante_si_nicht_explizit');
 const valid=price>0 && warnings.every(x=>x==='aluprof_variante_si_nicht_explizit');
 return {
  provider:'Eko4u',input:cfg,mappedProfile:mapped.name,status:200,
  comparePrice:{listTotal:price,currency:'EUR',discountApplied:false,valid},
  customerPrice:{total:price,currency:'EUR'},
  priceType:'einkauf_netto_hersteller',
  equivalence:{layout:cfg.layout||'1flg',opening:cfg.opening||'Dreh-Kipp',glazing:cfg.glazing,glazingCode:glazingEcho,fittings:[fit1,fit2].filter(Boolean).join(' + '),uw:res.UW||'',construction:`${lid}${cfg.layout==='2flg_pfosten'?' · 2-flügelig Mittelpfosten':''}${cfg.layout==='2flg_stulp_dk_dreh'?' · 2-flügelig Stulp':''}`,proof:`${res.details_info||''} | ${lid}${cfg.layout==='2flg_pfosten'?` | Pfosten, Beschlag ${fit1} + ${fit2}`:''}${cfg.layout==='2flg_stulp_dk_dreh'?` | Stulp, Beschlag ${fit1}`:''} | Glas ${glazingEcho} | UW ${res.UW||'?'}`},
  discountMetadata:{observed:false,note:'Einkaufspreis netto laut Eko4u-Konfigurator (Herstellerpreis); Rabatte/Konditionen nicht enthalten'},
  warnings
 };
}

function mapProfile(cfg){
 const hay=`${cfg.brand} ${cfg.profile}`.toLowerCase();
 const isAlu=cfg.productType==='aluminium';
 for(const [name,alias] of Object.entries(aliases)){
  if(name.startsWith('_')) continue;
  if((alias.material==='aluminium')!==isAlu) continue;
  if(new RegExp(alias.match,'i').test(hay)) return {name,alias};
 }
 return null;
}

function lidFor(cfg,alias){
 if(cfg.productType==='balkontuer') return alias.balkonLid||null;
 const item1=cfg.productType==='aluminium'?'RU_PRAWO':'RU LEWE';
 const layout=cfg.layout||'1flg';
 if(layout==='1flg') return alias.lib1?`${alias.lib1}@${item1}`:null;
 if(layout==='2flg_pfosten') return alias.lib2?`${alias.lib2}@R_RU`:null;
 if(layout==='2flg_stulp_dk_dreh') return alias.lib2?`${alias.lib2}@R_RU STULP`:null;
 return null;
}

async function login(){
 jar.clear();
 const home=await req('/');
 const csrf=home.match(/name="csrf_login" value="([a-f0-9]+)"/)?.[1];
 if(!csrf) throw new Error('Eko4u: Login-Seite ohne CSRF-Token');
 const fd=new FormData();
 fd.set('csrf_login',csrf); fd.set('login',LOGIN); fd.set('password',PASSWORD);
 const j=parseJson(await req('/?p=login.connexion',{method:'POST',body:fd,headers:{referer:BASE+'/'}}));
 if(!j.redirect) throw new Error(`Eko4u: Login fehlgeschlagen (${j.ERROR_CODE||'unbekannt'})`);
}

async function workshopInit(lid){
 await req('/?p=configurator&lid='+encodeURIComponent(lid)+'&fromCache=0');
 return workshopPost(new URLSearchParams({mid:lid,qid:'0',fromCache:'0'}));
}
async function workshopApply(optionsHtml,overrides){
 return workshopPost(serializeForm(optionsHtml,overrides));
}
async function workshopPost(body,retried=false){
 const text=await req('/?p=configurator.workshop',{method:'POST',body,headers:{'x-requested-with':'XMLHttpRequest'}});
 if(text.includes('csrf_login')&&!retried){ await login(); return workshopPost(body,true); } // Session abgelaufen -> einmal neu einloggen
 return parseJson(text);
}

function hasError(j){ return !['',0,'0',null,undefined].includes(j?.ERROR_CODE); }

function serializeForm(optionsHtml,overrides={}){
 const m=optionsHtml.match(/<form[^>]*id="form_configurator"[^>]*>([\s\S]*)<\/form>/);
 const frm=m?m[1]:optionsHtml;
 const pairs=[];
 const rx=/<input\b([^>]*)>/gi; let t;
 while((t=rx.exec(frm))){
  const attrs=t[1];
  const attr=n=>{const mm=attrs.match(new RegExp(`(?:^|\\s)${n}="([^"]*)"`));return mm?unescapeHtml(mm[1]):null;};
  const name=attr('name'); if(!name) continue;
  const type=(attr('type')||'text').toLowerCase();
  if(type==='checkbox'||type==='radio'){ if(/\schecked\b/.test(attrs)) pairs.push([name,attr('value')??'on']); }
  else if(['submit','button','image','file'].includes(type)) continue;
  else pairs.push([name,attr('value')??'']);
 }
 const seen=new Set(pairs.map(p=>p[0]));
 for(const k of Object.keys(overrides)) if(!seen.has(k)) pairs.push([k,overrides[k]]);
 const body=new URLSearchParams();
 for(const [k,v] of pairs) body.append(k,Object.hasOwn(overrides,k)?overrides[k]:v);
 return body;
}

function fieldValue(html,name){
 const mm=html.match(new RegExp(`name="${escapeRx(name)}"[^>]*value="([^"]*)"`));
 return mm?unescapeHtml(mm[1]):null;
}

async function req(pathname,{method='GET',body,headers={}}={}){
 for(let attempt=0;;attempt++){
  try{
   const res=await fetch(BASE+pathname,{method,body,redirect:'follow',headers:{'user-agent':UA,accept:'*/*',cookie:cookieHeader(),...headers}});
   storeCookies(res);
   if(!res.ok) throw new Error(`${pathname} HTTP ${res.status}`);
   return await res.text();
  }catch(e){
   if(attempt>=2) throw e;
   await sleep(1500*(attempt+1));
  }
 }
}
function cookieHeader(){ return [...jar.entries()].map(([k,v])=>`${k}=${v}`).join('; '); }
function storeCookies(res){
 const list=typeof res.headers.getSetCookie==='function'?res.headers.getSetCookie():(res.headers.get('set-cookie')?[res.headers.get('set-cookie')]:[]);
 for(const c of list){ const kv=c.split(';')[0]; const i=kv.indexOf('='); if(i>0) jar.set(kv.slice(0,i).trim(),kv.slice(i+1)); }
}

function parseJson(text){ return JSON.parse(text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ')); } // Eko4u liefert rohe Steuerzeichen in JSON-Strings (SVG)
function parsePrice(s){
 if(typeof s!=='string') return null;
 let t=s.replace(/[^\d.,-]/g,'');
 if(!t) return null;
 if(t.includes(',')&&t.includes('.')) t=t.replace(/,/g,'');
 else if(t.includes(',')) t=t.replace(',','.');
 const n=Number(t);
 return Number.isFinite(n)?+n.toFixed(2):null;
}
function unescapeHtml(s){ return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }
function escapeRx(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function loadDotEnv(file){
 try{
  for(const line of fssync.readFileSync(file,'utf8').split('\n')){
   const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
   if(m && process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'');
  }
 }catch{}
}
