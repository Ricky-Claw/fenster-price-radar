import React, {useEffect, useMemo, useState} from 'react';
import { createRoot } from 'react-dom/client';
import { Search, SlidersHorizontal, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, Download, RefreshCw } from 'lucide-react';
import './styles.css';

const providers = [
  ['dfs','Deutscher-Fenstershop'],
  ['fensterblick','Fensterblick'],
  ['fensterversand','Fensterversand']
];
const eur = v => typeof v === 'number' ? v.toLocaleString('de-DE',{style:'currency',currency:'EUR'}) : '—';
const cls = (...a) => a.filter(Boolean).join(' ');

function unique(data, key){ return [...new Set(data.map(x=>x[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'de')); }
function providerCell(row, id){
  const p=row.providers[id];
  if(!p) return <td className="muted">—</td>;
  if(!p.valid) return <td><span className="pill warn">{p.status === 'priced' ? 'gerundet' : p.status}</span></td>;
  return <td className="price">{eur(p.listTotal)}</td>;
}

function App(){
  const [payload,setPayload]=useState(null);
  const [q,setQ]=useState('');
  const [brand,setBrand]=useState('');
  const [profile,setProfile]=useState('');
  const [glazing,setGlazing]=useState('');
  const [onlyAction,setOnlyAction]=useState(false);
  const [active,setActive]=useState(null);

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
    const validDfs=data.filter(r=>r.providers.dfs?.valid).length;
    return {configs:data.length, exact:exact.length, cheaper, avg, validDfs};
  },[data]);

  if(!payload) return <div className="loading">Fensterradar v1 wird geladen…</div>;
  return <>
    <header className="topbar">
      <div className="brandmark"><span className="cube">FR</span><div><b>Fensterradar v1</b><small>Interner Wettbewerbsvergleich</small></div></div>
      <nav><a>Radar</a><a>Snapshots</a><a>Regeln</a><a>Datenqualität</a></nav>
      <button className="ghost"><RefreshCw size={16}/> Weekly Update</button>
    </header>

    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Deutscher-Fenstershop · internes Tool</p>
          <h1>Fensterpreise schnell vergleichen. Sauber, diskret, nachvollziehbar.</h1>
          <p className="lead">DFS-Listenpreise gegen Fensterblick und Fensterversand — mit Validitätswarnungen, Profil-Matching und Snapshot-Quellen.</p>
        </div>
        <div className="heroCard">
          <span>Letzter Datenstand</span>
          <b>{new Date(payload.generatedAt).toLocaleString('de-DE')}</b>
          <small>{payload.summary.rows} Provider-Zeilen aus {payload.summary.configs} Konfigurationen</small>
        </div>
      </section>

      <section className="cards">
        <div className="card"><small>Konfigurationen</small><b>{stats.configs}</b><span>PVC V1 Katalog</span></div>
        <div className="card"><small>DFS exakt gültig</small><b>{stats.validDfs}</b><span>ohne Rasterwarnung</span></div>
        <div className="card"><small>Direkt vergleichbar</small><b>{stats.exact}</b><span>DFS + Wettbewerber valide</span></div>
        <div className="card accent"><small>Ø Abstand</small><b>{stats.avg.toFixed(1)}%</b><span>gegen besten Wettbewerber</span></div>
      </section>

      <section className="panel">
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

        <div className="tableWrap"><table><thead><tr><th>Konfiguration</th>{providers.map(([id,name])=><th key={id}>{name}</th>)}<th>Abstand DFS</th><th>Status</th></tr></thead><tbody>
          {filtered.map(row=><tr key={row.key} onClick={()=>setActive(row)}>
            <td><b>{row.brand} · {row.profile}</b><small>{row.size} · {row.glazing} · {row.opening} · {row.color}</small></td>
            {providers.map(([id])=><React.Fragment key={id}>{providerCell(row,id)}</React.Fragment>)}
            <td>{row.delta===null?<span className="muted">—</span>:<span className={cls('delta',row.delta<=0?'good':'bad')}>{row.delta<=0?<TrendingDown size={15}/>:<TrendingUp size={15}/>} {eur(row.delta)} / {row.deltaPct}%</span>}</td>
            <td>{Object.values(row.providers).some(p=>p.warnings?.length||!p.valid)?<span className="quality warn"><AlertTriangle size={15}/> prüfen</span>:<span className="quality ok"><CheckCircle2 size={15}/> sauber</span>}</td>
          </tr>)}
        </tbody></table></div>
      </section>
    </main>

    {active && <aside className="drawer" onClick={()=>setActive(null)}><div onClick={e=>e.stopPropagation()}><button className="x" onClick={()=>setActive(null)}>×</button><h3>{active.brand} · {active.profile}</h3><p>{active.size} · {active.glazing} · {active.opening} · {active.color}</p>{providers.map(([id,name])=>{const p=active.providers[id]; return <section key={id} className="providerBox"><b>{name}</b>{p?<><span>{eur(p.listTotal)}</span><small>Status: {p.status} · valid: {String(p.valid)}</small>{p.warnings?.length?<em>{p.warnings.join(', ')}</em>:null}{p.reason?<em>{p.reason}</em>:null}</>:<small>nicht vorhanden</small>}</section>})}</div></aside>}
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
