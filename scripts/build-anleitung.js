// Generiert aus knowledge/ANLEITUNG.md eine ansehbare HTML-Seite + Download-Kopie
// unter public/ (beide gitignored — Single Source bleibt die Markdown-Datei,
// Build erzeugt die Artefakte frisch). Läuft als prebuild/predev.
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('knowledge', 'ANLEITUNG.md');
const outHtml = path.resolve('public', 'janela-wissen-anleitung.html');
const outMd = path.resolve('public', 'janela-wissen-anleitung.md');

const raw = fs.readFileSync(src, 'utf8');

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

// ponytail: Mini-Renderer für genau die Markdown-Teilmenge der Anleitung
// (Überschriften, Absätze, Listen, nummerierte Listen, Codeblöcke) —
// keine Markdown-Dependency für eine einzelne interne Seite.
const lines = raw.split('\n');
const html = [];
let inCode = false;
let listTag = null;

function closeList() {
  if (listTag) { html.push(`</${listTag}>`); listTag = null; }
}

for (const line of lines) {
  if (line.startsWith('```')) {
    closeList();
    html.push(inCode ? '</code></pre>' : '<pre><code>');
    inCode = !inCode;
    continue;
  }
  if (inCode) { html.push(escapeHtml(line)); continue; }

  const h = line.match(/^(#{1,3})\s+(.*)$/);
  if (h) { closeList(); html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

  const ul = line.match(/^-\s+(.*)$/);
  if (ul) {
    if (listTag !== 'ul') { closeList(); html.push('<ul>'); listTag = 'ul'; }
    html.push(`<li>${inline(ul[1])}</li>`);
    continue;
  }
  const ol = line.match(/^\d+\.\s+(.*)$/);
  if (ol) {
    if (listTag !== 'ol') { closeList(); html.push('<ol>'); listTag = 'ol'; }
    html.push(`<li>${inline(ol[1])}</li>`);
    continue;
  }
  if (!line.trim()) { closeList(); continue; }
  closeList();
  html.push(`<p>${inline(line)}</p>`);
}
closeList();

const page = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Janela — Firmenwissen pflegen (Anleitung)</title>
<style>
  :root { --blue:#003A66; --orange:#F47C26; --line:#E2E8F0; --muted:#64748B; }
  * { box-sizing: border-box; }
  body { margin:0; background:#F5F5F5; color:#1f2a3a; font-family:Arial,system-ui,sans-serif; line-height:1.6; }
  header { background:var(--blue); color:#fff; padding:22px 24px; }
  header .wrap, main { max-width:860px; margin:0 auto; }
  header h1 { margin:0; font-size:22px; font-family:Helvetica,Arial,sans-serif; }
  header p { margin:6px 0 0; color:#DCEAF4; font-size:14px; }
  main { background:#fff; border:1px solid var(--line); border-radius:10px; margin-top:24px; margin-bottom:60px; padding:34px 40px; }
  h1,h2,h3 { color:var(--blue); font-family:Helvetica,Arial,sans-serif; }
  h1 { font-size:26px; } h2 { font-size:20px; margin-top:34px; } h3 { font-size:16px; }
  code { background:#EAF6FF; color:var(--blue); border-radius:4px; padding:2px 6px; font-size:13px; }
  pre { background:#0f2136; color:#dcecfa; border-radius:8px; padding:16px 18px; overflow:auto; font-size:13px; }
  pre code { background:transparent; color:inherit; padding:0; }
  ul,ol { padding-left:22px; }
  li { margin:6px 0; }
  .toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
  .download { background:var(--orange); color:#fff; border-radius:6px; padding:11px 16px; font-weight:800; text-decoration:none; display:inline-flex; gap:8px; align-items:center; }
  .download:hover { background:#D86818; }
  @media (max-width:700px){ main { padding:22px 18px; margin:14px; } }
</style>
</head>
<body>
<header>
  <div class="wrap toolbar">
    <div>
      <h1>Janela — Firmenwissen pflegen</h1>
      <p>Anleitung für den Wissensordner · Quelle: knowledge/ANLEITUNG.md im GitHub-Repo</p>
    </div>
    <a class="download" href="/janela-wissen-anleitung.md" download="Janela-Anleitung-Firmenwissen.md">⬇ Anleitung herunterladen</a>
  </div>
</header>
<main>
${html.join('\n')}
</main>
</body>
</html>
`;

fs.writeFileSync(outHtml, page);
fs.copyFileSync(src, outMd);
console.log(`anleitung ok: ${path.relative(process.cwd(), outHtml)} + ${path.relative(process.cwd(), outMd)}`);
