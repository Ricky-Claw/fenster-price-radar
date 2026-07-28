import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './lib/validate.mjs';

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

// ---------------------------------------------------------------------------
// Validierung — bricht ab, bevor ein unsauberes E-Book entsteht.
// Regeln geteilt mit MCP-Tool ebook_validate: tools/ebook-maker/lib/validate.mjs
// ---------------------------------------------------------------------------

const validationErrors = validateConfig(config);
if (validationErrors.length) {
  console.error(`Konfiguration ungültig (${configPath}):`);
  validationErrors.forEach((message) => console.error(`  - ${message}`));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Rendern
// ---------------------------------------------------------------------------

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
  <style>
    /* Cover-Motiv v2 (generator-owned): elegantes Fenster statt Sofa/Fussball aus "Ruhiges Heimspiel" */
    .fx-window { position: absolute; right: 0; top: 10mm; width: 70mm; height: 96mm; border-radius: 22px; background: #fff; box-shadow: var(--shadow); }
    .fx-glass { position: absolute; inset: 7px; border-radius: 16px; border: 6px solid #d9ecfb; background: linear-gradient(180deg, #cfe6fa 0%, #eaf4fd 55%, #f8fbff 100%); overflow: hidden; }
    .fx-glass::before, .fx-glass::after { content: ""; position: absolute; background: #fff; box-shadow: 0 0 6px rgba(12,45,87,.12); z-index: 3; }
    .fx-glass::before { left: 50%; top: 0; bottom: 0; width: 6px; transform: translateX(-50%); }
    .fx-glass::after { left: 0; right: 0; top: 58%; height: 6px; transform: translateY(-50%); }
    .fx-hill { position: absolute; left: -12%; right: -6%; bottom: -7mm; height: 20mm; background: rgba(12,45,87,.09); border-radius: 50% 50% 0 0; }
    .fx-hill.two { left: 34%; right: -22%; height: 26mm; background: rgba(12,45,87,.13); }
    .fx-sun { position: absolute; right: 8mm; top: 8mm; width: 15mm; height: 15mm; background: var(--orange); border-radius: 50%; box-shadow: 0 0 0 12px rgba(244,123,32,.16), 0 0 0 22px rgba(244,123,32,.07); z-index: 1; }
    .fx-shine { position: absolute; top: -12%; bottom: -12%; left: 10%; width: 11mm; background: rgba(255,255,255,.34); transform: skewX(-18deg); border-radius: 8px; z-index: 2; }
    .fx-shine::after { content: ""; position: absolute; top: 0; bottom: 0; left: 15mm; width: 4mm; background: rgba(255,255,255,.26); }
    .fx-sill { position: absolute; right: -3mm; top: 105mm; width: 80mm; height: 6.5mm; background: #fff; border-radius: 6px; box-shadow: 0 14px 30px rgba(0,0,0,.22); }
    .fx-plant { position: absolute; top: 87mm; right: 46mm; width: 16mm; height: 18mm; z-index: 4; }
    .fx-plant i { position: absolute; bottom: 7mm; left: 50%; width: 5.5mm; height: 11mm; background: var(--blue); border-radius: 50% 50% 50% 50% / 70% 70% 30% 30%; transform-origin: 50% 100%; }
    .fx-plant i:nth-child(1) { transform: translateX(-50%) rotate(-30deg); }
    .fx-plant i:nth-child(2) { transform: translateX(-50%); height: 13mm; }
    .fx-plant i:nth-child(3) { transform: translateX(-50%) rotate(30deg); }
    .fx-plant b { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 9mm; height: 7.5mm; background: var(--orange); border-radius: 4px 4px 9px 9px; }
    .cover .quiet-badge { bottom: auto; top: 116mm; left: auto; right: 14mm; }
  </style>
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
        <div class="home-visual" aria-hidden="true"><div class="fx-window"><div class="fx-glass"><span class="fx-hill"></span><span class="fx-hill two"></span><span class="fx-sun"></span><span class="fx-shine"></span></div></div><div class="fx-sill"></div><div class="fx-plant"><i></i><i></i><i></i><b></b></div><div class="quiet-badge"><strong>Guide</strong><span>DFS</span></div></div>
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

// Mockbild-Job für Codex ImageGen 2: Cover als Referenzbild, Bild entsteht in
// EINEM Durchgang komplett durchs Bild-Generierungs-Tool — programmatische
// Komposition (sharp/Canvas/Textur-Mapping) ist verboten, nur Skalieren erlaubt.
const mockupJob = {
  task: 'dfs-ebook-mockup',
  engine: 'codex-imagegen-2',
  ebook: { slug: config.slug, titel: config.title },
  input: { cover: 'assets/cover.png', beschreibung: 'Echtes A4-Cover (Seite 1) des E-Books, als Bild beigefuegt' },
  output: { datei: `public/ebooks/${config.slug}/assets/mockup.png`, groesse: '1024x1024', format: 'png' },
  stil: {
    ansicht: '3D-Buch-/Broschueren-Mockup, leicht schraege 3/4-Ansicht von vorne, Softcover',
    licht: 'weiches Licht von links oben, dezenter Schlagschatten',
    hintergrund: 'hell und neutral (#FFFFFF bis #F5F5F5), kein Farbverlauf, kein Showroom-Kitsch',
    bildaufbau: 'Buch mittig, ca. 70-80% der Bildhoehe',
  },
  harteRegeln: [
    'Das Bild entsteht in EINEM Durchgang komplett ueber das interne Bild-Generierungs-Tool (ImageGen 2).',
    'KEINE programmatische Komposition: kein sharp/Canvas/Textur-Mapping des Covers auf eine Buchform. Nach der Generierung ist nur Skalieren/Zuschneiden auf exakt 1024x1024 erlaubt.',
    'Cover-Inhalt (Text, Logo, Farben, Layout) 1:1 vom Referenzbild uebernehmen — Text NICHT neu setzen, NICHTS hinzufuegen, NICHTS weglassen, keine Schreibweise korrigieren.',
    'Titeltext muss buchstabengleich mit dem Cover sein. Abweichung = komplett neu generieren, NIE nachbearbeiten.',
    'Kein zusaetzlicher Text, keine Badges, keine Sticker, kein Wasserzeichen.',
  ],
  ablage: 'Roh-PNG aus ~/.codex/generated_images/<id>/ auf 1024x1024 bringen und als output.datei speichern.',
};
writeFileSync(path.join(outDir, 'mockup-job.json'), `${JSON.stringify(mockupJob, null, 2)}\n`);

if (!noPdf) {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error('Kein Chromium/Chrome gefunden. Setze CHROME_PATH oder nutze --no-pdf.');
  const pdfPath = path.join(outDir, `${config.slug || 'dfs-ebook'}.pdf`);
  const result = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--print-to-pdf-no-header', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`PDF-Export fehlgeschlagen:\n${result.stderr || result.stdout}`);
  const pdf = readFileSync(pdfPath);
  if (pdf.slice(0, 4).toString() !== '%PDF') throw new Error(`Ungültige PDF-Signatur: ${pdfPath}`);

  // Ground-Truth-Check: jede section.page muss genau eine PDF-Seite ergeben.
  // Mehr Seiten = Inhalt übergelaufen → Layout kaputt.
  const expectedPages = pages.length + 2; // Cover + Inhalt + CTA
  const pdfPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pdfPages === 0) {
    console.warn('Warnung: PDF-Seitenzahl nicht lesbar — Überlauf-Check übersprungen.');
  } else if (pdfPages !== expectedPages) {
    throw new Error(`PDF hat ${pdfPages} Seiten, erwartet ${expectedPages} — eine Seite läuft über. Inhalte kürzen.`);
  }

  // Cover als PNG (A4 bei 96dpi) — Referenzbild für das Codex-Mockbild.
  const coverPath = path.join(assetsDir, 'cover.png');
  const coverResult = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=794,1123', `--screenshot=${coverPath}`, `file://${htmlPath}`], { encoding: 'utf8' });
  if (coverResult.status !== 0 || !existsSync(coverPath)) throw new Error(`Cover-Export fehlgeschlagen:\n${coverResult.stderr || coverResult.stdout}`);

  console.log(`HTML: ${htmlPath}`);
  console.log(`PDF: ${pdfPath} (${pdf.length} bytes, ${pdfPages} Seiten)`);
  console.log(`Cover: ${coverPath}`);
  console.log(`Mockup-Job: ${path.join(outDir, 'mockup-job.json')} (Codex ImageGen 2: codex exec -i ${path.join(outDir, 'assets/cover.png')} - < ${path.join(outDir, 'mockup-job.json')})`);
} else {
  console.log(`HTML: ${htmlPath}`);
  console.log('PDF: übersprungen (--no-pdf)');
}
