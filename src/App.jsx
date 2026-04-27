import React, {useEffect, useMemo, useState} from 'react';
import { createRoot } from 'react-dom/client';
import { Search, SlidersHorizontal, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, Download, RefreshCw, Calculator, Minus } from 'lucide-react';
import './styles.css';

const providers = [
  ['dfs','Deutscher-Fenstershop'],
  ['fensterblick','Fensterblick'],
  ['fensterversand','Fensterversand']
];
const eur = v => typeof v === 'number' ? v.toLocaleString('de-DE',{style:'currency',currency:'EUR'}) : '—';
const cls = (...a) => a.filter(Boolean).join(' ');
const isUnavailable = p => p && (p.status === 'unmatched' || p.reason === 'nicht_im_angebot' || p.reason === 'No profile alias match' || p.reason === 'No equivalent PVC profile in Fensterversand mapping');
const isIssue = p => p && !isUnavailable(p) && (p.warnings?.length || !p.valid);
const changeLabel = c => {
  const d = c?.weeklyChange?.dfs?.delta;
  if (typeof d !== 'number') return <span className="muted">neu/kein Verlauf</span>;
  if (d === 0) return <span className="trend flat">unverändert</span>;
  return <span className={cls('trend', d > 0 ? 'up' : 'down')}>{d > 0 ? '+' : ''}{eur(d)} · {d > 0 ? '+' : ''}{c.weeklyChange.dfs.deltaPct}%</span>;
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
function providerCell(row, id){
  const p=row.providers[id];
  if(!p) return <td className="muted">—</td>;
  if(!p.valid) return <td><span className="pill warn">{p.reason === 'nicht_im_angebot' || p.reason === 'No equivalent PVC profile in Fensterversand mapping' || p.reason === 'No profile alias match' || p.status === 'unmatched' ? 'nicht im Angebot' : p.status === 'priced' ? 'gerundet' : p.status}</span></td>;
  const ch=row.weeklyChange?.[id];
  return <td className="price">{eur(p.listTotal)}{ch ? <small className={cls('trend', ch.delta>0?'up':ch.delta<0?'down':'flat')}>{ch.delta>0?<TrendingUp size={13}/>:ch.delta<0?<TrendingDown size={13}/>:<Minus size={13}/>} {ch.delta>0?'+':''}{eur(ch.delta)} / {ch.deltaPct}% zur Vorwoche</small> : null}</td>;
}

function App(){
  const [payload,setPayload]=useState(null);
  const [q,setQ]=useState('');
  const [brand,setBrand]=useState('');
  const [profile,setProfile]=useState('');
  const [glazing,setGlazing]=useState('');
  const [onlyAction,setOnlyAction]=useState(false);
  const [active,setActive]=useState(null);
  const [quote,setQuote]=useState({profile:'aluplast-ideal-4000',width:1000,height:1200,glazing:'3fach',opening:'Dreh-Kipp',color:'weiß'});
  const [quoteResult,setQuoteResult]=useState(null);
  const [quoteLoading,setQuoteLoading]=useState(false);
  async function runQuote(){
    setQuoteLoading(true);
    try{
      const params=new URLSearchParams(quote);
      const r=await fetch(`/api/quote?${params}`,{cache:'no-store'});
      setQuoteResult(await r.json());
    } finally { setQuoteLoading(false); }
  }

  useEffect(()=>{ fetch(`/data/price-radar.json?v=${Date.now()}`, { cache: 'no-store' }).then(r=>r.json()).then(setPayload); },[]);
  const data=payload?.configs||[];
  const filtered=useMemo(()=>data.filter(r=>{
    const hay=[r.brand,r.profile,r.size,r.glazing,r.opening,r.color].join(' ').toLowerCase();
    if(q && !hay.includes(q.toLowerCase())) return false;
    if(brand && r.brand!==brand) return false;
    if(profile && r.profile!==profile) return false;
    if(glazing && r.glazing!==glazing) return false;
    if(onlyAction && r.delta===null) return false;
    return true;
  }),[data,q,brand,profile,glazing,onlyAction]);

  const stats=useMemo(()=>{
    const exact=data.filter(r=>r.dfsPrice && r.bestCompetitor);
    const cheaper=exact.filter(r=>r.delta<=0).length;
    const avg=exact.length ? exact.reduce((s,r)=>s+r.deltaPct,0)/exact.length : 0;
    const avgClass = avg <= 0 ? 'good' : avg <= 10 ? 'mid' : 'bad';
    const validDfs=data.filter(r=>r.providers.dfs?.valid).length;
    const changes=data.flatMap(r=>Object.values(r.weeklyChange||{})).filter(Boolean);
    const changed=changes.filter(c=>c.delta!==0).length;
    return {configs:data.length, exact:exact.length, cheaper, avg, avgClass, validDfs, changed};
  },[data]);

  if(!payload) return <div className="loading">Fensterradar v1 wird geladen…</div>;
  return <>
    <header className="topbar">
      <div className="brandmark"><span className="cube">FR</span><div><b>Fensterradar v1</b><small>Interner Wettbewerbsvergleich</small></div></div>
      <nav className="topnav"><a href="#radar" className="active">Preisradar</a><a href="/reports/mapping-audit.html" target="_blank" rel="noreferrer">DFS Audit</a></nav>
      <button className="ghost"><RefreshCw size={16}/> Weekly Update</button>
    </header>

    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Deutscher-Fenstershop · internes Tool</p>
          <h1>Fensterpreise schnell vergleichen. Sauber, diskret, nachvollziehbar.</h1>
          <p className="lead">Internes Preisradar für PVC-Fenster mit nachvollziehbaren Datenständen und sauber markierten Vergleichswerten.</p>
        </div>
        <div className="heroCard">
          <span>Letzter Datenstand</span>
          <b>{new Date(payload.generatedAt).toLocaleString('de-DE')}</b>
          <small>{payload.summary.rows} Provider-Zeilen aus {payload.summary.configs} Konfigurationen</small>
        </div>
      </section>


      <section className="panel quotePanel" id="konfigurator">
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
        {quoteResult && <div className="quoteResults">
          {providers.map(([id,name])=>{const p=quoteResult.providers?.[id]; return <div key={id} className={cls('quoteCard',p?.valid?'':'softWarn')}><small>{name}</small><b>{p?.valid?eur(p.listTotal):'—'}</b><span>{p?.reason === 'nicht_im_angebot' || p?.status === 'unmatched' ? 'nicht im Angebot' : (p?.status||'nicht verfügbar')}</span>{p?.warnings?.length?<em>{p.warnings.join(', ')}</em>:null}{p?.reason||p?.error?<em>{p.reason === 'nicht_im_angebot' ? 'Dieses Profil wird von diesem Anbieter nicht angeboten.' : (p.reason||p.error)}</em>:null}</div>})}
        </div>}
      </section>

      <section className="cards">
        <div className="card"><small>Konfigurationen</small><b>{stats.configs}</b><span>PVC V1 Katalog</span></div>
        <div className="card"><small>DFS exakt gültig</small><b>{stats.validDfs}</b><span>ohne Rasterwarnung</span></div>
        <div className="card"><small>Änderungen zur Vorwoche</small><b>{stats.changed}</b><span>Preisänderungen erkannt</span></div>
        <div className={cls('card','spread',stats.avgClass)}><small>DFS vs günstigster Wettbewerber</small><b>{stats.avg>0?'+':''}{stats.avg.toFixed(1)}%</b><span>{stats.avg<=0?'DFS im Schnitt günstiger/gleich':'DFS im Schnitt teurer'}</span></div>
      </section>

      <section className="panel" id="radar">
        <div className="panelHead">
          <div><h2>Preisradar</h2><p>Canonical: Brutto-Listenpreis vor Rabatt. Aktionsrabatte bleiben Metadaten.</p></div>
          <a className="download" href="/data/price-radar.json" download><Download size={16}/> JSON</a>
        </div>
        <div className="filters">
          <label className="search"><Search size={18}/><input placeholder="Suche: Marke, Profil, Größe…" value={q} onChange={e=>setQ(e.target.value)}/></label>
          <select value={brand} onChange={e=>{setBrand(e.target.value);setProfile('')}}><option value="">Alle Marken</option>{unique(data,'brand').map(x=><option key={x}>{x}</option>)}</select>
          <select value={profile} onChange={e=>setProfile(e.target.value)}><option value="">Alle Profile</option>{unique(data.filter(x=>!brand||x.brand===brand),'profile').map(x=><option key={x}>{x}</option>)}</select>
          <select value={glazing} onChange={e=>setGlazing(e.target.value)}><option value="">Alle Gläser</option>{unique(data,'glazing').map(x=><option key={x}>{x}</option>)}</select>
          <button className={cls('toggle',onlyAction&&'on')} onClick={()=>setOnlyAction(!onlyAction)}><SlidersHorizontal size={16}/> nur vergleichbar</button>
        </div>

        <div className="tableWrap"><table><thead><tr><th>Konfiguration</th>{providers.map(([id,name])=><th key={id}>{name}</th>)}<th>Abstand DFS</th><th>Entwicklung</th><th>Status</th></tr></thead><tbody>
          {filtered.map(row=><tr key={row.key} onClick={()=>setActive(row)}>
            <td><b>{row.brand} · {row.profile}</b><small>{row.size} · {row.glazing} · {row.opening} · {row.color}</small></td>
            {providers.map(([id])=><React.Fragment key={id}>{providerCell(row,id)}</React.Fragment>)}
            <td>{row.delta===null?<span className="muted">—</span>:<span className={cls('delta',row.delta<=0?'good':'bad')}>{row.delta<=0?<TrendingDown size={15}/>:<TrendingUp size={15}/>} {eur(row.delta)} / {row.deltaPct}%</span>}</td>
            <td>{changeLabel(row)}</td>
            <td>{Object.values(row.providers).some(isIssue)?<span className="quality warn"><AlertTriangle size={15}/> prüfen</span>:<span className="quality ok"><CheckCircle2 size={15}/> sauber</span>}</td>
          </tr>)}
        </tbody></table></div>
      </section>

      <details className="panel trendPanel" id="entwicklung">
        <summary className="panelHead trendSummary">
          <div><h2>Preisentwicklung</h2><p>Vergleich aktueller DFS-Listenpreise zur vorherigen gespeicherten Aktualisierung.</p></div>
          <span className="historyBadge">{stats.changed} Änderungen <span className="chevron">⌄</span></span>
        </summary>
        <div className="trendList">
          {data.filter(r=>r.weeklyChange?.dfs).slice(0,8).map(r=><div className="trendRow" key={r.key}><b>{r.brand} · {r.profile}</b><span>{r.size} · {r.glazing}</span>{changeLabel(r)}</div>)}
          {!data.some(r=>r.weeklyChange?.dfs) && <p className="emptyTrend">Noch kein Vorwochen-Snapshot vorhanden. Ab der nächsten wöchentlichen Aktualisierung erscheinen hier Preisänderungen.</p>}
        </div>
      </details>
    </main>

    {active && <aside className="drawer" onClick={()=>setActive(null)}><div onClick={e=>e.stopPropagation()}><button className="x" onClick={()=>setActive(null)}>×</button><h3>{active.brand} · {active.profile}</h3><p>{active.size} · {active.glazing} · {active.opening} · {active.color}</p>{providers.map(([id,name])=>{const p=active.providers[id]; return <section key={id} className="providerBox"><b>{name}</b>{p?<><span>{eur(p.listTotal)}</span><small>Status: {p.status} · valid: {String(p.valid)}</small>{p.warnings?.length?<em>{p.warnings.join(', ')}</em>:null}{p.reason?<em>{p.reason === 'nicht_im_angebot' || p.reason === 'No equivalent PVC profile in Fensterversand mapping' || p.reason === 'No profile alias match' ? 'Dieses Profil wird von diesem Anbieter nicht angeboten.' : p.reason}</em>:null}</>:<small>nicht vorhanden</small>}</section>})}</div></aside>}
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
