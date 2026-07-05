const SERIES = [
  { key: 'dfs', label: 'Deutscher Fenstershop', color: '#003A66' },
  { key: 'fensterblick', label: 'Fensterblick', color: '#F47C26' },
  { key: 'fensterversand', label: 'Fensterversand', color: '#1F9D6C' },
];

function fmtDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}.${m}.`;
}

export default function TrendChart({ points }) {
  if (!points || points.length < 2) return <p className="emptyTrend">Noch nicht genug Verlaufsdaten für ein Diagramm.</p>;
  const width = 900, height = 300, padL = 44, padR = 16, padT = 16, padB = 30;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const values = points.flatMap(p => SERIES.map(s => p[s.key]).filter(v => typeof v === 'number'));
  const min = Math.min(100, ...values), max = Math.max(100, ...values);
  const pad = Math.max(2, (max - min) * 0.1);
  const yMin = Math.floor(min - pad), yMax = Math.ceil(max + pad);
  const x = i => padL + (innerW * i) / (points.length - 1);
  const y = v => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const linePath = key => {
    let d = '';
    let started = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (typeof v !== 'number') { started = false; return; }
      d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  };
  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className="trendChart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Preisindex-Verlauf je Anbieter, letzte drei Monate">
        {tickVals.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#E8EEF3" strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8496a6">{t.toFixed(0)}</text>
          </g>
        ))}
        <line x1={padL} x2={width - padR} y1={y(100)} y2={y(100)} stroke="#c7d2db" strokeWidth="1" strokeDasharray="4 3" />
        {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
          <text key={p.date} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="#8496a6">{fmtDate(p.date)}</text>
        ))}
        {SERIES.map(s => (
          <path key={s.key} d={linePath(s.key)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {SERIES.map(s => points.map((p, i) => typeof p[s.key] === 'number' && (
          <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(p[s.key])} r="3" fill={s.color}>
            <title>{`${s.label} · ${fmtDate(p.date)} · Index ${p[s.key].toFixed(1)}`}</title>
          </circle>
        )))}
      </svg>
      <div className="trendChartLegend">
        {SERIES.map(s => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <p className="trendChartNote">Preisindex je Anbieter (Basis 100 bei erster Erfassung jeder Konfiguration) — zeigt die relative Preisbewegung, unabhängig vom Katalog-Wachstum. Kein Absolutpreis.</p>
    </div>
  );
}
