import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseEbookDir = path.join(repoRoot, 'public/ebooks/ruhiges-heimspiel');

function argValue(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

const configPath = path.resolve(argValue('--config', path.join(repoRoot, 'tools/ebook-maker/example-ebook.json')));
const noPdf = process.argv.includes('--no-pdf');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const outDir = path.resolve(argValue('--out', path.join(repoRoot, 'public/ebooks', config.slug || 'dfs-ebook')));
const assetsDir = path.join(outDir, 'assets');
mkdirSync(assetsDir, { recursive: true });

copyFileSync(path.join(baseEbookDir, 'styles.css'), path.join(outDir, 'styles.css'));
copyFileSync(path.join(baseEbookDir, 'assets/fenstershop-logo.png'), path.join(assetsDir, 'fenstershop-logo.png'));

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function renderBlock(block) {
  if (block.type === 'cards') {
    return `<div class="cards three">${(block.items || []).map((item) => `
      <article class="card"><span class="icon">${escapeHtml(item.icon || '✓')}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join('')}
    </div>`;
  }
  if (block.type === 'checklist') {
    return `<div class="checklist card wide-card">${(block.items || []).map((item) => `
      <label><input type="checkbox" checked> <span>${escapeHtml(item)}</span></label>`).join('')}
    </div>`;
  }
  if (block.type === 'timeline') {
    return `<div class="timeline">${(block.items || []).map((item, index) => `
      <article><span>${index + 1}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join('')}
    </div>`;
  }
  if (block.type === 'table') {
    return `<table class="window-table"><thead><tr>${(block.headers || []).map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${(block.rows || []).map((row) => `
      <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
  }
  if (block.type === 'note') {
    return `<aside class="note"><strong>Hinweis:</strong> ${escapeHtml(block.text)}</aside>`;
  }
  return `<div class="split card"><p>${escapeHtml(block.text || '')}</p></div>`;
}

function renderPage(page, pageNumber) {
  return `<section class="page">
    <header class="brand"><img src="assets/fenstershop-logo.png" alt="Deutscher Fenstershop" class="brand-logo"></header>
    <p class="section-label">${escapeHtml(page.label)}</p>
    <h2>${escapeHtml(page.title)}</h2>
    <p class="lead">${escapeHtml(page.lead)}</p>
    ${(page.blocks || []).map(renderBlock).join('\n')}
    <footer class="page-footer"><span>${escapeHtml(config.footerLabel || config.title)}</span><span>${String(pageNumber).padStart(2, '0')}</span></footer>
  </section>`;
}

const pages = config.pages || [];
const ctaNumber = pages.length + 2;
const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.title)} – Deutscher Fenstershop E-Book</title>
  <meta name="description" content="${escapeHtml(config.claim || config.subtitle || config.title)}">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="ebook" aria-label="${escapeHtml(config.title)}">
    <section class="page cover cover-page">
      <header class="brand brand--cover"><span class="brand-logo-shell"><img src="assets/fenstershop-logo.png" alt="Deutscher Fenstershop" class="brand-logo"></span></header>
      <div class="cover-grid">
        <div class="cover-copy">
          <p class="kicker">${escapeHtml(config.kicker || 'Deutscher Fenstershop Ratgeber')}</p>
          <h1>${escapeHtml(config.title)}</h1>
          <p class="subtitle">${escapeHtml(config.subtitle)}</p>
          <p class="claim">${escapeHtml(config.claim)}</p>
          <div class="pill-row">${(config.topics || []).map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}</div>
        </div>
        <div class="home-visual" aria-hidden="true"><div class="window-graphic"><span class="sun"></span><span class="ball"></span></div><div class="sofa"></div><div class="quiet-badge"><strong>Guide</strong><span>DFS</span></div></div>
      </div>
      <footer class="page-footer"><span>deutscher-fenstershop.de</span><span>01</span></footer>
    </section>
    ${pages.map((page, index) => renderPage(page, index + 2)).join('\n')}
    <section class="page cta-page">
      <header class="brand brand--cta"><span class="brand-logo-shell"><img src="assets/fenstershop-logo.png" alt="Deutscher Fenstershop" class="brand-logo"></span></header>
      <div class="cta-panel card">
        <p class="kicker">${escapeHtml(config.cta?.kicker || 'Nächster Schritt')}</p>
        <h2>${escapeHtml(config.cta?.title || 'Fensterprojekt vorbereiten')}</h2>
        <p>${escapeHtml(config.cta?.text || '')}</p>
        ${config.cta?.buttonUrl ? `<a class="cta-button" href="${escapeHtml(config.cta.buttonUrl)}">${escapeHtml(config.cta.buttonText || 'Mehr erfahren')}</a>` : ''}
        <div class="contact-grid">${(config.cta?.contacts || []).map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join('')}</div>
      </div>
      <div class="final-mark" aria-hidden="true"><span></span><span></span><span></span></div>
      <footer class="page-footer"><span>${escapeHtml(config.footerLabel || config.title)}</span><span>${String(ctaNumber).padStart(2, '0')}</span></footer>
    </section>
  </main>
</body>
</html>
`;

const htmlPath = path.join(outDir, 'index.html');
writeFileSync(htmlPath, html);

if (!noPdf) {
  const chromeCandidates = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].filter(Boolean);
  const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error('Kein Chromium/Chrome gefunden. Setze CHROME_PATH oder nutze --no-pdf.');
  const pdfPath = path.join(outDir, `${config.slug || 'dfs-ebook'}.pdf`);
  const result = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--print-to-pdf-no-header', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`PDF-Export fehlgeschlagen:\n${result.stderr || result.stdout}`);
  const pdf = readFileSync(pdfPath);
  if (pdf.slice(0, 4).toString() !== '%PDF') throw new Error(`Ungültige PDF-Signatur: ${pdfPath}`);
  console.log(`HTML: ${htmlPath}`);
  console.log(`PDF: ${pdfPath} (${pdf.length} bytes)`);
} else {
  console.log(`HTML: ${htmlPath}`);
  console.log('PDF: übersprungen (--no-pdf)');
}
