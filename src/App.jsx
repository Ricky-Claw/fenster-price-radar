import React, {useEffect, useMemo, useRef, useState} from 'react';
import { createRoot } from 'react-dom/client';
import { Search, SlidersHorizontal, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, Download, RefreshCw, Calculator, CalendarDays, Megaphone, Save, Trash2, ClipboardList } from 'lucide-react';
import { ACTION_CALENDAR, createActionComment, currentActionCalendarVersion } from './actionCalendar.js';
import { providerProfileLink, rowConfigLink } from './configLinks.js';
import TrendChart from './TrendChart.jsx';
import './styles.css';

const providers = [
  ['dfs','Deutscher-Fenstershop'],
  ['fensterblick','Fensterblick'],
  ['fensterversand','Fensterversand']
];
const layouts = [
  ['','Alle Bauarten'],
  ['1flg','1-flügelig'],
  ['2flg_pfosten','2-flg Pfosten'],
  ['2flg_stulp_dk_dreh','2-flg Stulp'],
  ['balkontuer','Balkontür']
];
const LAYOUT_TILE_HINT = {'1flg':'Einflügelige Standardfenster','2flg_pfosten':'Zweiflügelig mit Mittelpfosten','2flg_stulp_dk_dreh':'Zweiflügelig mit Stulp','balkontuer':'Bislang nur bei Fensterblick verifiziert'};
const UPDATE_POLL_MAX_MS = 15 * 60 * 1000;
const eur = v => typeof v === 'number' ? v.toLocaleString('de-DE',{style:'currency',currency:'EUR'}) : '—';
const formatPercent = value => Number(value || 0).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1});
const cls = (...a) => a.filter(Boolean).join(' ');
const isUnavailable = p => p && (p.status === 'unmatched' || p.reason === 'nicht_im_angebot' || p.reason === 'No profile alias match' || p.reason === 'No equivalent PVC profile in Fensterversand mapping');
const isIssue = p => p && !isUnavailable(p) && (p.warnings?.length || !p.valid);
const shortProvider = id => id === 'dfs' ? 'DFS' : id === 'fensterblick' ? 'FB' : id === 'fensterversand' ? 'FV' : id;
const changeValue = change => typeof change?.delta === 'number' ? change.delta : change?.listDelta;
const hasPriceChange = change => typeof changeValue(change) === 'number' && changeValue(change) !== 0;
const daysSince = value => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
};
const isoWeek = value => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const year = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return { week, year };
};
const providerDisplayName = id => id === 'dfs' ? 'Deutscher Fenstershop' : providers.find(([providerId]) => providerId === id)?.[1] || id;
const priceBasisLabel = change => change?.basis === 'customerTotal' ? 'Kundenpreis' : 'Listenpreis';
const singleChangeLabel = (change, providerId) => {
  const d = changeValue(change);
  if (typeof d !== 'number') return <span className="muted">neu/kein Verlauf</span>;
  if (d === 0) return <span className="trend flat">unverändert</span>;
  const pct = typeof change.deltaPct === 'number' ? change.deltaPct : change.listDeltaPct;
  return <span className={cls('trend', d > 0 ? 'up' : 'down')}>{providerId ? `${shortProvider(providerId)} ` : ''}{d > 0 ? '+' : ''}{eur(d)}{typeof pct === 'number' ? ` · ${d > 0 ? '+' : ''}${pct}%` : ''}</span>;
};
const providerChangeLine = change => {
  if(!change) return <small className="muted">Vorwochenvergleich nicht verfügbar</small>;
  if(!hasPriceChange(change)) return <small className="trend flat inlineTrend">zur Vorwoche unverändert</small>;
  return <small className="providerChange"><span>{priceBasisLabel(change)} zur Vorwoche</span>{singleChangeLabel(change)}</small>;
};
const changeSummary = (payload, data) => {
  const changedRows = data.filter(row => Object.values(row.weeklyChange||{}).some(hasPriceChange)).length;
  const changedEntries = data.flatMap(row => Object.values(row.weeklyChange||{})).filter(hasPriceChange);
  const byProvider = providers.map(([id,name]) => [name, data.filter(row => hasPriceChange(row.weeklyChange?.[id])).length]).filter(([,count])=>count);
  const from = payload?.comparisonBaseline?.generatedAt ? new Date(payload.comparisonBaseline.generatedAt).toLocaleDateString('de-DE') : 'Vorwoche';
  const to = payload?.generatedAt ? new Date(payload.generatedAt).toLocaleDateString('de-DE') : 'heute';
  return {from,to,changedRows,changedEntries:changedEntries.length,byProvider};
};
const rowChangeLabel = row => {
  const changes = providers
    .map(([id]) => [id, row.weeklyChange?.[id]])
    .filter(([, change]) => change);
  const changed = changes.filter(([, change]) => hasPriceChange(change));
  if (!changes.length) return <span className="muted">neu/kein Verlauf</span>;
  if (!changed.length) return <span className="trend flat">unverändert</span>;
  return <span className="changeStack">{changed.slice(0,3).map(([id, change]) => <React.Fragment key={id}>{singleChangeLabel(change, id)}</React.Fragment>)}</span>;
};
const quoteProfiles = [
  ['drutex-iglo-5-classic','Drutex · Iglo 5 Classic'],
  ['drutex-iglo-energy-classic','Drutex · Iglo Energy Classic'],
  ['drutex-iglo-ext','Drutex · Iglo EXT'],
  ['aluplast-ideal-neo-md','Aluplast · Ideal Neo MD'],
  ['aluplast-ideal-4000','Aluplast · Ideal 4000'],
  ['aluplast-ideal-8000','Aluplast · Ideal 8000'],
  ['gealan-s8000','Gealan · S 8000 IQ'],
  ['gealan-s9000','Gealan · S 9000'],
  ['salamander-76-md','Salamander · GreenEvo 76 3D'],
  ['salamander-82-md','Salamander · bluEvolution 82 MD'],
  ['veka-softline-70-ad','Veka · Softline 70 AD'],
  ['veka-softline-76-md','Veka · Softline 76 MD'],
  ['veka-softline-82-md','Veka · Softline 82 MD'],
  ['kommerling-70-ad','Kömmerling · 70 AD'],
  ['kommerling-88-md','Kömmerling · 88 MD']
];

function unique(data, key){ return [...new Set(data.map(x=>x[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'de')); }
function discountText(p){
  const meta=p?.discountMetadata || {};
  if(!meta.observed) return 'kein Rabatt';
  const pct = typeof meta.observedDiscountPercent === 'number' ? `${Math.round(meta.observedDiscountPercent*100)}%` : (typeof meta.observedDiscount === 'number' && meta.observedDiscount ? `${meta.observedDiscount}` : 'Rabatt');
  return pct;
}
function stopRowClick(e){ e.stopPropagation(); }
function cheapestProviderIds(row){
  const priced = providers
    .map(([id]) => ({ id, total: row.providers[id]?.customerTotal ?? row.providers[id]?.listTotal, valid: row.providers[id]?.valid }))
    .filter(p => p.valid && typeof p.total === 'number');
  if (!priced.length) return new Set();
  const min = Math.min(...priced.map(p => p.total));
  return new Set(priced.filter(p => p.total === min).map(p => p.id));
}
function providerCell(row, id, cheapestIds){
  const p=row.providers[id];
  const change=row.weeklyChange?.[id];
  if(!p) return <td className="muted">—</td>;
  const href = providerProfileLink(row, id);
  const isCheapest = cheapestIds.has(id);
  if(!p.valid) return <td><a className="providerLink" href={href} target="_blank" rel="noreferrer" onClick={stopRowClick}><span className="pill warn">{p.reason === 'nicht_im_angebot' || p.reason === 'No equivalent PVC profile in Fensterversand mapping' || p.reason === 'No profile alias match' || p.status === 'unmatched' ? 'nicht im Angebot' : p.status === 'priced' ? 'gerundet' : p.status}</span></a>{change ? providerChangeLine(change) : null}</td>;
  return <td className={cls('price', isCheapest && 'bestPrice')}><a className="providerLink" href={href} target="_blank" rel="noreferrer" onClick={stopRowClick}><b>{eur(p.customerTotal ?? p.listTotal)}{isCheapest ? <span className="bestMarker">Billigster</span> : null}</b><small>Liste {eur(p.listTotal)} · {discountText(p)}</small></a>{providerChangeLine(change)}</td>;
}

function LoginPage(){
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  async function submit(e){
    e.preventDefault();
    setLoading(true); setError('');
    try{
      const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
      if(!r.ok){ const body=await r.json().catch(()=>({})); throw new Error(body.error==='login_not_configured'?'Login ist noch nicht konfiguriert.':'Passwort stimmt nicht.'); }
      const next=new URLSearchParams(window.location.search).get('next')||'/';
      window.location.href=next;
    }catch(err){setError(err.message)}finally{setLoading(false)}
  }
  return <main className="loginShell">
    <section className="loginCard">
      <div className="loginMark">FR</div>
      <p className="eyebrow">Interner Zugang</p>
      <h1>Fensterradar Login</h1>
      <p className="lead">Bitte Passwort eingeben, um das interne Preisradar zu öffnen.</p>
      <form onSubmit={submit} className="loginForm">
        <label><span>Passwort</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoFocus autoComplete="current-password" /></label>
        {error?<small className="loginError">{error}</small>:null}
        <button type="submit" disabled={loading||!password}>{loading?'Prüfe…':'Einloggen'}</button>
      </form>
    </section>
  </main>;
}

function ActionCalendar(){
  const storageKey = `actionCalendarComments:${currentActionCalendarVersion}`;
  const [comments,setComments]=useState(()=>{
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch { return {}; }
  });
  const [forms,setForms]=useState(()=>Object.fromEntries(ACTION_CALENDAR.map(action=>[action.id,{author:'',channel:action.channels[0]||'Allgemein',status:'Geplant',note:''}])));
  const statusOptions=['Geplant','In Arbeit','Erledigt','Freigabe offen','Blockiert'];
  function persist(next){
    setComments(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }
  function updateForm(actionId, patch){
    setForms(prev=>({...prev,[actionId]:{...prev[actionId],...patch}}));
  }
  function saveComment(actionId){
    const form=forms[actionId]||{};
    if(!String(form.note||'').trim()) return;
    const comment=createActionComment({actionId,...form});
    const next={...comments,[actionId]:[comment,...(comments[actionId]||[])]};
    persist(next);
    updateForm(actionId,{note:''});
  }
  function deleteComment(actionId, commentId){
    const next={...comments,[actionId]:(comments[actionId]||[]).filter(comment=>comment.id!==commentId)};
    persist(next);
  }
  const exportedComments=encodeURIComponent(JSON.stringify({version:currentActionCalendarVersion,comments},null,2));
  return <section className="actionCalendar" id="aktionskalender">
    <div className="actionHero">
      <div>
        <p className="eyebrow">Aktionskalender 2026 · Version {currentActionCalendarVersion}</p>
        <h2>Nach der WM wird Energieberatung zur Hauptaktion.</h2>
        <p>Der Kalender führt die laufende Heimspiel-Kampagne sauber zu Ende und setzt danach die große Aktion <strong>Deutscher Fenstershop x Förderheld</strong> für Website, E-Mail, Social Media und Ads.</p>
      </div>
      <div className="actionHeroCard">
        <CalendarDays size={26}/>
        <b>Förderheld ab 20.07.</b>
        <span>Große Aktion mit klaren Design Rules, Wording und Team-Log.</span>
      </div>
    </div>
    <div className="actionToolbar">
      <span><ClipboardList size={17}/> Kommentare werden lokal im Browser gespeichert und enthalten automatisch Zeitpunkt, Autor, Kanal und Status.</span>
      <a className="download" href={`data:application/json;charset=utf-8,${exportedComments}`} download={`aktionskalender-kommentare-${currentActionCalendarVersion}.json`}><Download size={16}/> Kommentare exportieren</a>
    </div>
    <div className="actionList">
      {ACTION_CALENDAR.map(action=>{
        const form=forms[action.id]||{};
        const actionComments=comments[action.id]||[];
        return <article key={action.id} className={cls('actionItem',action.scale==='Große Aktion'&&'major')}>
          <div className="actionTop">
            <div>
              <span className="actionPhase">{action.phase}</span>
              <h3>{action.title}</h3>
              <p>{action.partner} · {action.dateRange}</p>
            </div>
            <strong>{action.scale}</strong>
          </div>
          <div className="actionStory">
            <div>
              <small>Claim</small>
              <b>{action.claim}</b>
              <p>{action.story}</p>
            </div>
            <div>
              <small>Angebot / Rahmen</small>
              <p>{action.offer}</p>
              <em>{action.timingNote}</em>
            </div>
          </div>
          <div className="channelRow">{action.channels.map(channel=><span key={channel}>{channel}</span>)}</div>
          <div className="ruleGrid">
            <section>
              <h4><Megaphone size={16}/> Design Rules</h4>
              <ul>{action.designRules.map(rule=><li key={rule}>{rule}</li>)}</ul>
            </section>
            <section>
              <h4>Wording: so schreiben</h4>
              <ul>{action.wording.do.map(rule=><li key={rule}>{rule}</li>)}</ul>
            </section>
            <section>
              <h4>Wording: vermeiden</h4>
              <ul>{action.wording.dont.map(rule=><li key={rule}>{rule}</li>)}</ul>
            </section>
          </div>
          <div className="deliverables">
            {action.deliverables.map(item=><span key={item}>{item}</span>)}
          </div>
          <div className="commentBox">
            <div>
              <h4>Team-Log: wer hat was wann gemacht?</h4>
              <p>{action.commentPrompts.join(' · ')}</p>
            </div>
            <div className="commentForm">
              <input value={form.author||''} onChange={e=>updateForm(action.id,{author:e.target.value})} placeholder="Wer?" />
              <select value={form.channel||action.channels[0]} onChange={e=>updateForm(action.id,{channel:e.target.value})}>{['Allgemein',...action.channels].map(channel=><option key={channel}>{channel}</option>)}</select>
              <select value={form.status||'Geplant'} onChange={e=>updateForm(action.id,{status:e.target.value})}>{statusOptions.map(status=><option key={status}>{status}</option>)}</select>
              <textarea value={form.note||''} onChange={e=>updateForm(action.id,{note:e.target.value})} placeholder="Was wurde gemacht, vorbereitet, freigegeben oder blockiert?" rows="3" />
              <button type="button" className="download" onClick={()=>saveComment(action.id)}><Save size={16}/> Kommentar speichern</button>
            </div>
            <div className="commentList">
              {actionComments.map(comment=><div className="commentEntry" key={comment.id}>
                <div><b>{comment.author}</b><span>{new Date(comment.createdAt).toLocaleString('de-DE')} · {comment.channel} · {comment.status}</span></div>
                <p>{comment.note}</p>
                <button type="button" onClick={()=>deleteComment(action.id,comment.id)} aria-label="Kommentar löschen"><Trash2 size={15}/></button>
              </div>)}
              {!actionComments.length?<p className="emptyComment">Noch keine Einträge für diese Aktion.</p>:null}
            </div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function App(){
  const [payload,setPayload]=useState(null);
  const [trendIndex,setTrendIndex]=useState(null);
  const [staleClosedStamp,setStaleClosedStamp]=useState(()=>localStorage.getItem('priceRadarStaleClosed') || '');
  const [q,setQ]=useState('');
  const [brand,setBrand]=useState('');
  const [profile,setProfile]=useState('');
  const [glazing,setGlazing]=useState('');
  const [layout,setLayout]=useState('1flg');
  const [onlyAction,setOnlyAction]=useState(false);
  const [active,setActive]=useState(null);
  const [quote,setQuote]=useState({profile:'aluplast-ideal-4000',width:1000,height:1200,glazing:'3fach',opening:'Dreh-Kipp',color:'weiß'});
  const [quoteResult,setQuoteResult]=useState(null);
  const [quoteLoading,setQuoteLoading]=useState(false);
  const [margin,setMargin]=useState({gross:342.51,discount:15,cost:170,target:30});
  const [updateState,setUpdateState]=useState('idle');
  const [updateMessage,setUpdateMessage]=useState('');
  const [activeView,setActiveView]=useState('radar');
  const [trendProvider,setTrendProvider]=useState('dfs');
  const [menuOpen,setMenuOpen]=useState(false);
  const updatePollRef=useRef(null);
  const updateDoneResetRef=useRef(null);
  const updateErrorCountRef=useRef(0);
  const updatePollStartedAtRef=useRef(null);
  const payloadGeneratedAtRef=useRef(null);

  async function loadPricePayload(){
    const r=await fetch(`/data/price-radar.json?v=${Date.now()}`, { cache: 'no-store' });
    if(!r.ok) throw new Error('price_data_unreachable');
    const next=await r.json();
    setPayload(next);
    return next;
  }
  function clearUpdatePoll(){
    if(updatePollRef.current){
      clearInterval(updatePollRef.current);
      updatePollRef.current=null;
    }
    updatePollStartedAtRef.current=null;
  }
  function clearDoneReset(){
    if(updateDoneResetRef.current){
      clearTimeout(updateDoneResetRef.current);
      updateDoneResetRef.current=null;
    }
  }
  function scheduleUpdateIdleReset(){
    clearDoneReset();
    updateDoneResetRef.current=setTimeout(()=>{
      setUpdateState('idle');
      setUpdateMessage('');
      updateDoneResetRef.current=null;
    },6000);
  }
  function newerThanLoaded(nextGeneratedAt){
    const nextMs=Date.parse(nextGeneratedAt || '');
    const currentMs=Date.parse(payloadGeneratedAtRef.current || '');
    return Number.isFinite(nextMs) && (!Number.isFinite(currentMs) || nextMs > currentMs);
  }
  async function readJson(response){
    try { return await response.json(); }
    catch { return {}; }
  }
  function updateFailureMessage(status, fallback){
    if(status===401) return 'Bitte neu einloggen';
    if(status===503) return 'Aktualisierung noch nicht konfiguriert';
    if(status===502) return 'Dienst nicht erreichbar';
    return fallback;
  }
  function notePollError(message='Dienst nicht erreichbar'){
    updateErrorCountRef.current+=1;
    if(updateErrorCountRef.current>=3){
      clearUpdatePoll();
      setUpdateState('error');
      setUpdateMessage(message);
      return;
    }
    setUpdateMessage(`${message} (${updateErrorCountRef.current}/3)`);
  }
  async function pollUpdateStatus(){
    if(updatePollStartedAtRef.current && Date.now() - updatePollStartedAtRef.current > UPDATE_POLL_MAX_MS){
      clearUpdatePoll();
      setUpdateState('idle');
      setUpdateMessage('Aktualisierung dauert länger als erwartet — später erneut prüfen');
      return;
    }
    try{
      const response=await fetch('/api/trigger-update',{method:'GET',cache:'no-store'});
      const body=await readJson(response);
      if(!response.ok){
        const message=updateFailureMessage(response.status,'Dienst nicht erreichbar');
        if(response.status===401 || response.status===503){
          clearUpdatePoll();
          setUpdateState('error');
          setUpdateMessage(message);
          return;
        }
        notePollError(message);
        return;
      }
      updateErrorCountRef.current=0;
      if(body?.running){
        setUpdateState('running');
        setUpdateMessage('Aktualisierung läuft…');
        return;
      }
      clearUpdatePoll();
      if(typeof body?.lastExit === 'number' && body.lastExit !== 0){
        setUpdateState('error');
        setUpdateMessage(`Letzter Lauf fehlgeschlagen (Code ${body.lastExit}) — bitte Logs prüfen`);
        return;
      }
      if(newerThanLoaded(body?.dataGeneratedAt)){
        await loadPricePayload();
        setUpdateState('done');
        setUpdateMessage('Preise aktualisiert');
      }else{
        setUpdateState('done');
        setUpdateMessage('Lauf beendet');
      }
      scheduleUpdateIdleReset();
    }catch{
      notePollError('Dienst nicht erreichbar');
    }
  }
  function startUpdatePolling(){
    clearUpdatePoll();
    updateErrorCountRef.current=0;
    updatePollStartedAtRef.current=Date.now();
    updatePollRef.current=setInterval(()=>{ pollUpdateStatus(); },20000);
  }
  async function handleWeeklyUpdate(){
    if(updateState==='starting' || updateState==='running') return;
    clearDoneReset();
    setUpdateState('starting');
    setUpdateMessage('Starte Aktualisierung…');
    try{
      const response=await fetch('/api/trigger-update',{method:'POST',cache:'no-store'});
      const body=await readJson(response);
      if(!response.ok){
        clearUpdatePoll();
        setUpdateState('error');
        setUpdateMessage(updateFailureMessage(response.status,'Dienst nicht erreichbar'));
        return;
      }
      if(body?.started || body?.running){
        setUpdateState('running');
        setUpdateMessage('Aktualisierung läuft…');
        startUpdatePolling();
        pollUpdateStatus();
        return;
      }
      setUpdateState('done');
      setUpdateMessage(body?.reason ? String(body.reason) : 'Lauf beendet');
      scheduleUpdateIdleReset();
    }catch{
      clearUpdatePoll();
      setUpdateState('error');
      setUpdateMessage('Dienst nicht erreichbar');
    }
  }
  async function runQuote(){
    setQuoteLoading(true);
    try{
      const params=new URLSearchParams(quote);
      const r=await fetch(`/api/quote?${params}`,{cache:'no-store'});
      setQuoteResult(await r.json());
    } finally { setQuoteLoading(false); }
  }

  useEffect(()=>{
    payloadGeneratedAtRef.current=payload?.generatedAt || null;
  },[payload?.generatedAt]);

  useEffect(()=>{
    const isLoginRoute = window.location.pathname === '/login';
    if(isLoginRoute) return;
    loadPricePayload();
    fetch(`/data/price-trend-index.json?v=${Date.now()}`, { cache: 'no-store' }).then(r=>r.ok ? r.json() : null).then(setTrendIndex).catch(()=>setTrendIndex(null));
  },[]);
  useEffect(()=>()=>{ clearUpdatePoll(); clearDoneReset(); },[]);
  useEffect(()=>{
    if(!menuOpen) return;
    function handleMenuKeydown(event){
      if(event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', handleMenuKeydown);
    return () => window.removeEventListener('keydown', handleMenuKeydown);
  },[menuOpen]);
  const data=payload?.configs||[];
  const excludedConfigs = Array.isArray(payload?.filtered) ? payload.filtered : [];
  const filtered=useMemo(()=>data.filter(r=>{
    const hay=[r.brand,r.profile,r.size,r.glazing,r.opening,r.color,r.layoutLabel].join(' ').toLowerCase();
    if(q && !hay.includes(q.toLowerCase())) return false;
    if(brand && r.brand!==brand) return false;
    if(profile && r.profile!==profile) return false;
    if(glazing && r.glazing!==glazing) return false;
    if(layout && (r.layout || '1flg')!==layout) return false;
    if(onlyAction && r.delta===null) return false;
    return true;
  }),[data,q,brand,profile,glazing,layout,onlyAction]);

  const stats=useMemo(()=>{
    const exact=data.filter(r=>r.dfsPrice && r.bestCompetitor);
    const cheaper=exact.filter(r=>r.delta<=0).length;
    const avg=exact.length ? exact.reduce((s,r)=>s+r.deltaPct,0)/exact.length : 0;
    const avgClass = avg <= 0 ? 'good' : avg <= 10 ? 'mid' : 'bad';
    const validDfs=data.filter(r=>r.providers.dfs?.valid).length;
    const providerValid = Object.fromEntries(providers.map(([id]) => [id, data.filter(r=>r.providers[id]?.valid).length]));
    const changes=data.flatMap(r=>Object.values(r.weeklyChange||{})).filter(Boolean);
    const changed=changes.filter(hasPriceChange).length;
    const changedConfigs=data.filter(r=>Object.values(r.weeklyChange||{}).some(hasPriceChange)).length;
    const up=changes.filter(c=>changeValue(c)>0).length;
    const down=changes.filter(c=>changeValue(c)<0).length;
    const layoutCounts = Object.fromEntries(layouts.filter(([id])=>id).map(([id]) => [id, data.filter(r=>(r.layout||'1flg')===id).length]));
    return {configs:data.length, exact:exact.length, cheaper, avg, avgClass, validDfs, providerValid, changed, changedConfigs, up, down, layoutCounts};
  },[data]);

  const marginGrossList = Number(margin.gross || 0);
  const marginDiscount = Math.min(Math.max(Number(margin.discount || 0),0),99);
  const marginCustomerGross = marginGrossList * (1 - marginDiscount / 100);
  const marginNet = marginCustomerGross / 1.19;
  const marginContribution = marginNet - Number(margin.cost || 0);
  const marginPct = marginNet > 0 ? (marginContribution / marginNet) * 100 : 0;
  const target = Number(margin.target || 0);
  const minNet = target < 100 ? Number(margin.cost || 0) / (1 - target / 100) : 0;
  const minGross = minNet * 1.19;
  const maxDiscount = marginGrossList > 0 ? Math.max(0, (1 - minGross / marginGrossList) * 100) : 0;
  const marginState = marginPct >= target ? 'good' : marginPct >= target - 5 ? 'mid' : 'bad';

  const tickerStamp = payload?.generatedAt?.slice(0,10) || '';
  const dataAgeDays = daysSince(payload?.generatedAt);
  const staleBannerClosed = staleClosedStamp === tickerStamp;
  const showStaleBanner = typeof dataAgeDays === 'number' && dataAgeDays > 7 && !staleBannerClosed;
  const weeklySummary = changeSummary(payload, data);
  const generatedWeek = isoWeek(payload?.generatedAt);
  const weekLabel = generatedWeek ? `KW ${generatedWeek.week} ${generatedWeek.year}` : 'KW offen';
  const weeklyChangeText = stats.changed ? `${stats.changed} Anbieter-Preisänderungen in ${stats.changedConfigs} Konfigurationen zur Vorwoche` : 'keine Preisänderungen zur Vorwoche';
  const dfsPositionText = `DFS im Schnitt ${formatPercent(Math.abs(stats.avg))} % ${stats.avg <= 0 ? 'günstiger/gleich' : 'teurer'}`;
  const weeklyRangeText = `${weeklySummary.from} → ${weeklySummary.to}`;
  const selectedTrendProviderName = providerDisplayName(trendProvider);
  const trendEntries = useMemo(() => {
    const name = providerDisplayName(trendProvider);
    return data
      .map(row => ({ row, id: trendProvider, name, change: row.weeklyChange?.[trendProvider] }))
      .filter(({ change }) => change && typeof changeValue(change) === 'number')
      .sort((a, b) => Math.abs(changeValue(b.change) || 0) - Math.abs(changeValue(a.change) || 0));
  }, [data, trendProvider]);
  const trendChangedCount = trendEntries.filter(({ change }) => hasPriceChange(change)).length;
  const visibleTrendEntries = trendChangedCount ? trendEntries.filter(({ change }) => hasPriceChange(change)) : trendEntries;
  function closeStaleBanner(){
    localStorage.setItem('priceRadarStaleClosed', tickerStamp);
    setStaleClosedStamp(tickerStamp);
  }
  function selectView(view){
    setActiveView(view);
    setMenuOpen(false);
  }
  function downloadCsv(){
    const configs = Array.isArray(payload?.configs) ? payload.configs : [];
    if(!payload || !configs.length) return;
    const generatedAt = payload.generatedAt ? new Date(payload.generatedAt) : null;
    if(!generatedAt || Number.isNaN(generatedAt.getTime())) return;
    const pad = value => String(value).padStart(2,'0');
    const stamp = `${pad(generatedAt.getDate())}.${pad(generatedAt.getMonth()+1)}.${generatedAt.getFullYear()} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}`;
    const fileDate = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth()+1)}-${pad(generatedAt.getDate())}`;
    const csvText = value => {
      if(value === null || value === undefined) return '';
      const text = String(value);
      return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
    };
    const csvNumber = value => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2).replace('.',',') : '';
    const providerValue = (row, id, key) => {
      const provider = row.providers?.[id];
      return provider?.valid ? csvNumber(provider[key]) : '';
    };
    const rows = [
      ['Fensterradar-Export','Stand:',stamp],
      ['Marke','Profil','Größe','Glas','Öffnung','Farbe','Bauart','DFS Endpreis','DFS Liste','DFS Rabatt %','Fensterblick Endpreis','Fensterblick Liste','Fensterversand Endpreis','Fensterversand Liste','Günstigster','Abstand DFS €','Abstand %','DFS Δ Woche','FB Δ Woche','FV Δ Woche']
    ];
    configs.forEach(row => {
      const validProviders = providers
        .map(([id,name]) => ({ id, name, total: row.providers?.[id]?.customerTotal, valid: row.providers?.[id]?.valid }))
        .filter(provider => provider.valid && typeof provider.total === 'number' && Number.isFinite(provider.total));
      const cheapest = validProviders.length ? validProviders.reduce((best, provider) => provider.total < best.total ? provider : best).name : '';
      rows.push([
        row.brand,
        row.profile,
        row.size,
        row.glazing,
        row.opening,
        row.color,
        row.layoutLabel || row.layout || '',
        providerValue(row,'dfs','customerTotal'),
        providerValue(row,'dfs','listTotal'),
        row.providers?.dfs?.valid ? csvNumber(row.providers.dfs.discountMetadata?.observedDiscountPercent * 100) : '',
        providerValue(row,'fensterblick','customerTotal'),
        providerValue(row,'fensterblick','listTotal'),
        providerValue(row,'fensterversand','customerTotal'),
        providerValue(row,'fensterversand','listTotal'),
        cheapest,
        csvNumber(row.delta),
        csvNumber(row.deltaPct),
        csvNumber(row.weeklyChange?.dfs?.delta),
        csvNumber(row.weeklyChange?.fensterblick?.delta),
        csvNumber(row.weeklyChange?.fensterversand?.delta)
      ]);
    });
    const csv = `\uFEFF${rows.map(row => row.map(csvText).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv.replace(/^\uFEFF/, '')], { type:'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fensterradar-preise-${fileDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),0);
  }

  const dataGeneratedLabel = payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString('de-DE') : 'kein Datenstand';
  const dataFreshnessLabel = typeof dataAgeDays === 'number' ? (dataAgeDays === 0 ? 'heute aktualisiert' : `${dataAgeDays} Tage alt`) : 'Datenstand offen';
  const freshnessTone = typeof dataAgeDays === 'number' && dataAgeDays > 7 ? 'stale' : 'fresh';
  const isLoginRoute = window.location.pathname === '/login';
  const updateBusy = updateState === 'starting' || updateState === 'running';
  if(!payload && !isLoginRoute) return <div className="loading">Fensterradar v1 wird geladen…</div>;
  if (isLoginRoute) return <LoginPage />;
  return <>
    <header className="topbar">
      <button type="button" className="brandmark brandHome" aria-label="Zur Startseite" onClick={()=>{selectView('radar');window.scrollTo({top:0,behavior:'smooth'});}}>
        <svg className="radarLogo" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
          <defs><linearGradient id="frLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0a5f8f"/><stop offset="1" stopColor="#003A66"/></linearGradient></defs>
          <rect x="2.5" y="2.5" width="35" height="35" rx="9" fill="url(#frLogo)"/>
          <rect x="11" y="11" width="18" height="18" rx="2" fill="none" stroke="#eaf6ff" strokeWidth="2"/>
          <line x1="20" y1="11" x2="20" y2="29" stroke="#eaf6ff" strokeWidth="2"/>
          <line x1="11" y1="20" x2="29" y2="20" stroke="#eaf6ff" strokeWidth="2"/>
          <path d="M20 20 L20 11 A9 9 0 0 1 27.9 15.5 Z" fill="#F47C26" opacity="0.9"/>
          <circle cx="20" cy="20" r="1.9" fill="#F47C26"/>
        </svg>
        <div><b>Fensterradar</b><small>Preisvergleich</small></div>
      </button>
      <div className="topbarActions">
        <div className={cls('freshnessBadge', freshnessTone)} title={`Datenstand: ${dataGeneratedLabel}`}>
          <span>Datenstand</span>
          <b>{dataFreshnessLabel}</b>
          <small>{dataGeneratedLabel}</small>
        </div>
        <div className="updateControl">
          <button type="button" className={cls('primaryAction','updateButton',updateBusy && 'isRunning')} onClick={handleWeeklyUpdate} disabled={updateBusy} aria-busy={updateBusy}>
            <RefreshCw className={updateBusy ? 'spin' : ''} size={16}/>
            {updateBusy ? 'Aktualisierung läuft…' : updateState === 'done' ? 'Aktualisiert ✓' : 'Weekly Update'}
          </button>
          {updateMessage?<small className={cls('updateStatus',updateState)} role="status" aria-live="polite">{updateMessage}</small>:null}
        </div>
        <button type="button" className={cls('hamburgerButton', menuOpen && 'open')} aria-label="Ansichtsmenü öffnen" aria-expanded={menuOpen} aria-controls="view-menu" onClick={()=>setMenuOpen(open=>!open)}>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>
      </div>
      <nav id="view-menu" className={cls('viewMenu', menuOpen && 'open')} aria-label="Ansichten">
        <button type="button" className={activeView==='radar' ? 'active' : ''} onClick={()=>selectView('radar')}>Radar</button>
        <button type="button" className={activeView==='konfigurator' ? 'active' : ''} onClick={()=>selectView('konfigurator')}>Konfigurator</button>
        <button type="button" className={activeView==='margenrechner' ? 'active' : ''} onClick={()=>selectView('margenrechner')}>Margenrechner</button>
        <button type="button" className={activeView==='entwicklung' ? 'active' : ''} onClick={()=>selectView('entwicklung')}>Preisentwicklung</button>
        <a href="#aktionskalender" className={activeView==='aktionskalender' ? 'active' : ''} onClick={event=>{event.preventDefault();selectView('aktionskalender');}}>Aktionskalender</a>
        <a href="/aufmass.html" target="_blank" rel="noopener" onClick={()=>setMenuOpen(false)}>Aufmaß per Sprache</a>
      </nav>
    </header>
    {menuOpen ? <button type="button" className="menuBackdrop" aria-label="Ansichtsmenü schließen" onClick={()=>setMenuOpen(false)} /> : null}

    <main className={cls('appMain', `view-${activeView}`)}>
      {activeView === 'radar' && <>
        <section className="viewIntro radarIntro">
          <div>
            <h1>Preisradar</h1>
            <p className="lead">Kunden-Endpreise, Rabatte und Wochenänderungen im direkten Anbieter-Vergleich.</p>
          </div>
          <div className="exportControls">
            <a className="download" href="/data/price-radar.json" download><Download size={16}/> JSON exportieren</a>
            <button type="button" className="download" onClick={downloadCsv}><Download size={16}/> CSV (Excel)</button>
          </div>
        </section>
        <section className="weeklyChangeBanner" aria-label="Wochenvergleich zur Vorwoche">
          <strong>{weekLabel}</strong>
          <span>{weeklyChangeText}</span>
          <span>{dfsPositionText}</span>
          <small>{weeklyRangeText}</small>
          {payload?.verification && <span className="verifyBadge" title={payload.verification.note || ''}>✓ {payload.verification.samples} Stichproben verifiziert · {new Date(payload.verification.verifiedAt).toLocaleDateString('de-DE')}</span>}
        </section>
        {showStaleBanner && <section className="dfsAlert warning" role="alert">
          <div>
            <strong>Daten veraltet</strong>
            <span>Daten sind {dataAgeDays} Tage alt. Bitte aktuellen Weekly-Lauf prüfen.</span>
          </div>
          <button type="button" onClick={closeStaleBanner} aria-label="Hinweis zu alten Preisdaten ausblenden">×</button>
        </section>}
        <section className="panel radarPanel" id="radar">
          <div className="filters">
            <label className="search"><Search size={18}/><input placeholder="Suche: Marke, Profil, Größe…" value={q} onChange={e=>setQ(e.target.value)}/></label>
            <select value={brand} onChange={e=>{setBrand(e.target.value);setProfile('')}}><option value="">Alle Marken</option>{unique(data,'brand').map(x=><option key={x}>{x}</option>)}</select>
            <select value={profile} onChange={e=>setProfile(e.target.value)}><option value="">Alle Profile</option>{unique(data.filter(x=>!brand||x.brand===brand),'profile').map(x=><option key={x}>{x}</option>)}</select>
            <select value={glazing} onChange={e=>setGlazing(e.target.value)}><option value="">Alle Gläser</option>{unique(data,'glazing').map(x=><option key={x}>{x}</option>)}</select>
            <button className={cls('toggle',onlyAction&&'on')} onClick={()=>setOnlyAction(!onlyAction)}><SlidersHorizontal size={16}/> nur vergleichbar</button>
          </div>
          <div className="layoutChooser" aria-label="Fensterbauart auswählen">{layouts.filter(([id])=>id).map(([id,label])=>{const count=stats.layoutCounts?.[id]||0; return <button key={id} type="button" className={cls('layoutChoice', layout===id&&'active')} onClick={()=>setLayout(id)}><small>{label}</small><b>{count}</b><span>{LAYOUT_TILE_HINT[id]||''}</span></button>})}</div>
          <div className="kpiStrip" aria-label="Preisradar Kennzahlen">
            <span><b>{stats.configs}</b> Konfigurationen</span>
            <span><b>{filtered.length}</b> sichtbar</span>
            <span><b>{stats.validDfs}</b> DFS gültig</span>
            <span><b>{weeklySummary.changedEntries}</b> Anbieter-Änderungen</span>
            <span className={cls('kpiSpread',stats.avgClass)}><b>{stats.avg>0?'+':''}{stats.avg.toFixed(1)}%</b> DFS vs günstigster</span>
          </div>
          {excludedConfigs.length ? <details className="filteredNotice">
            <summary><strong><AlertTriangle size={16}/> {excludedConfigs.length} Konfigurationen aktuell nicht vergleichbar</strong><small>Aus dem Preisradar ausgeschlossen, damit keine falschen Preise angezeigt werden.</small></summary>
            <ul>{excludedConfigs.map((item,index)=><li key={`${item.brand}-${item.profile}-${item.size}-${index}`}><span>{item.brand} · {item.profile} · {item.size}</span><em>{item.reason || 'nicht vergleichbar'}</em></li>)}</ul>
          </details> : null}

          <div className="tableWrap"><table><thead><tr><th>Konfiguration</th>{providers.map(([id,name])=><th key={id}>{name}</th>)}<th>Abstand DFS</th><th>Entwicklung</th><th>Status</th></tr></thead><tbody>
            {filtered.map(row=>{
              const cheapestIds = cheapestProviderIds(row);
              return <tr key={row.key} onClick={()=>setActive(row)}>
              <td><a className="configTitleLink" href={rowConfigLink(row)} target="_blank" rel="noreferrer" onClick={stopRowClick}><b>{row.brand} · {row.profile}</b></a><div className="configMeta"><span className="sizeBadge">{row.size}</span><span className={cls('layoutBadge',(row.layout||'1flg')!=='1flg'&&'twoSash')}>{row.layoutLabel || '1-flügelig'}</span><span>{row.sizeRole || 'Vergleichsgröße'}</span></div><small>{row.glazing} · {row.opening} · {row.color}</small></td>
              {providers.map(([id])=><React.Fragment key={id}>{providerCell(row,id,cheapestIds)}</React.Fragment>)}
              <td>{row.delta===null?<span className="muted">—</span>:<span className={cls('delta',row.delta<=0?'good':'bad')}>{row.delta<=0?<TrendingDown size={15}/>:<TrendingUp size={15}/>} {eur(row.delta)} / {row.deltaPct}%</span>}</td>
              <td>{rowChangeLabel(row)}</td>
              <td>{Object.values(row.providers).some(isIssue)?<span className="quality warn"><AlertTriangle size={15}/> prüfen</span>:<span className="quality ok"><CheckCircle2 size={15}/> sauber</span>}</td>
            </tr>})}
          </tbody></table></div>
        </section>
      </>}

      {activeView === 'konfigurator' && <section className="panel quotePanel" id="konfigurator">
        <div className="panelHead">
          <div><h2>Live-Konfiguration</h2><p>V1: PVC, weiß/weiß, 1-flügel, Fest oder Dreh-Kipp. Breite/Höhe frei eingeben, Preise live bei allen verfügbaren Anbietern holen.</p></div>
          <button className="download" onClick={runQuote} disabled={quoteLoading}><Calculator size={16}/> {quoteLoading?'Berechne…':'Preise berechnen'}</button>
        </div>
        <div className="quoteGrid">
          <label><span>Fensterprofil</span><select value={quote.profile} onChange={e=>setQuote({...quote,profile:e.target.value})}>{quoteProfiles.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
          <label><span>Breite mm</span><input type="number" min="300" max="3000" value={quote.width} onChange={e=>setQuote({...quote,width:e.target.value})}/></label>
          <label><span>Höhe mm</span><input type="number" min="300" max="2600" value={quote.height} onChange={e=>setQuote({...quote,height:e.target.value})}/></label>
          <label><span>Glas</span><select value={quote.glazing} onChange={e=>setQuote({...quote,glazing:e.target.value})}><option>2fach</option><option>3fach</option></select></label>
          <label><span>Öffnung</span><select value={quote.opening} onChange={e=>setQuote({...quote,opening:e.target.value})}><option>Dreh-Kipp</option><option>Fest</option></select></label>
        </div>
        {quoteResult && (()=>{
          const ql=quoteProfiles.find(([qid])=>qid===quote.profile);
          const [qBrand='',qProfile='']=(ql?.[1]||'').split(' · ');
          const quoteRow={brand:qBrand.trim(),profile:qProfile.trim(),width:Number(quote.width),height:Number(quote.height),glazing:quote.glazing,opening:quote.opening,layout:'1flg',providers:quoteResult.providers};
          return <div className="quoteResults">
          {providers.map(([id,name])=>{const p=quoteResult.providers?.[id]; return <div key={id} className={cls('quoteCard',p?.valid?'':'softWarn')}><small>{name}</small><b>{p?.valid?eur(p.customerTotal ?? p.listTotal):'—'}</b>{p?.valid?<span>Endpreis Kunde · Liste {eur(p.listTotal)} · {discountText(p)}</span>:<span>{p?.reason === 'nicht_im_angebot' || p?.status === 'unmatched' ? 'nicht im Angebot' : (p?.status||'nicht verfügbar')}</span>}{p?.warnings?.length?<em>{p.warnings.join(', ')}</em>:null}{p?.reason||p?.error?<em>{p.reason === 'nicht_im_angebot' ? 'Dieses Profil wird von diesem Anbieter nicht angeboten.' : (p.reason||p.error)}</em>:null}{p?.valid?<a className="quoteViewLink" href={providerProfileLink(quoteRow,id)} target="_blank" rel="noreferrer">→ beim Anbieter ansehen</a>:null}</div>})}
        </div>;})()}
      </section>}

      {activeView === 'margenrechner' && <section className="panel marginPanel" id="margenrechner">
        <div className="panelHead">
          <div><h2>Margenrechner</h2><p>Direkt unter dem Konfigurator: Listenpreis, Rabatt und Kosten variieren, um Zielmarge und Mindestpreis zu prüfen.</p></div>
          <span className={cls('marginStatus', marginState)}>{marginPct.toFixed(1)}% Marge</span>
        </div>
        <div className="marginGrid">
          <label><span>Listenpreis brutto</span><input type="number" value={margin.gross} onChange={e=>setMargin({...margin,gross:e.target.value})}/></label>
          <label><span>Rabattierung %</span><input type="number" min="0" max="99" value={margin.discount} onChange={e=>setMargin({...margin,discount:e.target.value})}/></label>
          <label><span>Variable Kosten netto</span><input type="number" value={margin.cost} onChange={e=>setMargin({...margin,cost:e.target.value})}/></label>
          <label><span>Zielmarge %</span><input type="number" value={margin.target} onChange={e=>setMargin({...margin,target:e.target.value})}/></label>
          <div className="marginResult"><small>Kunden-Endpreis</small><b>{eur(marginCustomerGross)}</b><span>nach {marginDiscount.toFixed(1)}% Rabatt</span></div>
          <div className="marginResult"><small>Netto-Verkauf</small><b>{eur(marginNet)}</b></div>
          <div className="marginResult"><small>Deckungsbeitrag</small><b>{eur(marginContribution)}</b></div>
          <div className="marginResult"><small>Mindestpreis brutto</small><b>{eur(minGross)}</b><span>max. Rabatt {maxDiscount.toFixed(1)}%</span></div>
        </div>
      </section>}

      {activeView === 'aktionskalender' && <ActionCalendar />}

      {activeView === 'entwicklung' && <section className="panel trendChartPanel">
        <div className="panelHead"><div><h2>Preisindex — letzte drei Monate</h2><p>Relative Preisbewegung je Anbieter über alle vergleichbaren Konfigurationen.</p></div></div>
        <div style={{padding:'22px 30px'}}><TrendChart points={trendIndex?.points}/></div>
      </section>}

      {activeView === 'entwicklung' && <details className="panel trendPanel" id="entwicklung" open={trendChangedCount > 0}>
        <summary className="panelHead trendSummary">
          <div><h2>Preisentwicklung</h2><p>Wochenvergleich {weeklySummary.from} → {weeklySummary.to}: aktuelle Kunden-Endpreise für {selectedTrendProviderName} zur Vorwoche.</p></div>
          <span className="historyBadge">{trendChangedCount} Änderungen <span className="chevron">⌄</span></span>
        </summary>
        <div className="trendTabs" role="tablist" aria-label="Anbieter für Preisentwicklung auswählen">
          {providers.map(([id])=><button key={id} type="button" role="tab" aria-selected={trendProvider===id} className={trendProvider===id ? 'active' : ''} onClick={()=>setTrendProvider(id)}>{providerDisplayName(id)}</button>)}
        </div>
        <div className="trendList">
          {visibleTrendEntries.slice(0,24).map(({row,id,name,change})=><div className="trendRow" key={`${row.key}-${id}`}><b>{row.brand} · {row.profile}</b><span>{name} · {row.size} · {row.glazing} · vorher {eur(change.previous)} → jetzt {eur(change.current)}</span>{singleChangeLabel(change)}</div>)}
          {!visibleTrendEntries.length && <p className="emptyTrend">Keine Preisentwicklung zur Vorwoche für {selectedTrendProviderName} gefunden oder noch kein Vorwochen-Snapshot vorhanden.</p>}
        </div>
      </details>}
    </main>

    <footer className="siteFooter">
      Persönliches Werkzeug zur privaten Nutzung — reiner Preisvergleich. Steht in keiner Verbindung zu den genannten Anbietern oder Firmen und gehört zu keiner von ihnen. Alle Marken-, Produkt- und Firmennamen sind Eigentum ihrer jeweiligen Inhaber und dienen nur der Kennzeichnung.
    </footer>

    {active && <aside className="drawer" onClick={()=>setActive(null)}><div onClick={e=>e.stopPropagation()}><button className="x" onClick={()=>setActive(null)}>×</button><h3>{active.brand} · {active.profile}</h3><p>{active.size} · {active.sizeRole || 'Vergleichsgröße'} · {active.glazing} · {active.opening} · {active.color}</p>{providers.map(([id,name])=>{const p=active.providers[id]; return <section key={id} className="providerBox"><b>{name}</b>{p?<><span>{p.valid ? eur(p.customerTotal ?? p.listTotal) : eur(p.listTotal)}</span><small>Liste: {eur(p.listTotal)} · Rabatt: {discountText(p)}</small>{providerChangeLine(active.weeklyChange?.[id])}<small>Status: {p.status} · valid: {String(p.valid)}</small>{p.discountMetadata?.note?<em>{p.discountMetadata.note}</em>:null}{p.warnings?.length?<em>{p.warnings.join(', ')}</em>:null}{p.reason?<em>{p.reason === 'nicht_im_angebot' || p.reason === 'No equivalent PVC profile in Fensterversand mapping' || p.reason === 'No profile alias match' ? 'Dieses Profil wird von diesem Anbieter nicht angeboten.' : p.reason}</em>:null}</>:<small>nicht vorhanden</small>}</section>})}</div></aside>}
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
