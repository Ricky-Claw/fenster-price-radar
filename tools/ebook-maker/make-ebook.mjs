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

// ---------------------------------------------------------------------------
// Validierung — bricht ab, bevor ein unsauberes E-Book entsteht.
// Limits sind aus dem A4-Layout in styles.css abgeleitet (feste Seitenhöhe 297mm).
// ---------------------------------------------------------------------------

const LIMITS = {
  title: 60,
  subtitle: 90,
  claim: 200,
  kicker: 40,
  topics: { max: 4, chars: 24 },
  page: { label: 24, title: 60, lead: 260, blocksMax: 3 },
  cards: { items: 3, title: 40, text: 150 },
  checklist: { min: 3, max: 8, chars: 90 },
  timeline: { items: 3, title: 40, text: 140 },
  table: { headersMin: 2, headersMax: 4, rowsMax: 7, cell: 60 },
  note: 220,
  text: 400,
  cta: { title: 60, text: 300, buttonText: 60, contactsMax: 3 },
};

// ponytail: grobe mm-Schätzung pro Block; Ground Truth ist der PDF-Seitenzahl-Check unten.
const HEIGHT_BUDGET_MM = 235;
const HEAD_MM = 70; // Label + h2 + Lead
const BLOCK_GAP_MM = 9;

function blockHeightMm(block) {
  if (block.type === 'cards') return 62;
  if (block.type === 'checklist') return 12 + (block.items?.length || 0) * 11;
  if (block.type === 'timeline') return 70;
  if (block.type === 'table') return 16 + (block.rows?.length || 0) * 11;
  if (block.type === 'note') return 24;
  return 34; // text
}

function validateConfig(cfg) {
  const errors = [];
  const err = (msg) => errors.push(msg);
  const need = (value, name) => {
    if (!value || (typeof value === 'string' && !value.trim())) err(`Pflichtfeld fehlt: ${name}`);
  };
  const maxLen = (value, limit, name) => {
    if (typeof value === 'string' && value.length > limit) err(`${name} zu lang (${value.length} > ${limit} Zeichen)`);
  };

  need(cfg.slug, 'slug');
  if (cfg.slug && !/^[a-z0-9-]+$/.test(cfg.slug)) err(`slug muss kebab-case sein: "${cfg.slug}"`);
  need(cfg.title, 'title');
  need(cfg.subtitle, 'subtitle');
  need(cfg.claim, 'claim');
  maxLen(cfg.title, LIMITS.title, 'title');
  maxLen(cfg.subtitle, LIMITS.subtitle, 'subtitle');
  maxLen(cfg.claim, LIMITS.claim, 'claim');
  maxLen(cfg.kicker, LIMITS.kicker, 'kicker');

  const topics = cfg.topics || [];
  if (topics.length > LIMITS.topics.max) err(`topics: max. ${LIMITS.topics.max} Pills (${topics.length} angegeben)`);
  topics.forEach((topic, i) => maxLen(topic, LIMITS.topics.chars, `topics[${i}]`));

  if (cfg.cta) {
    maxLen(cfg.cta.title, LIMITS.cta.title, 'cta.title');
    maxLen(cfg.cta.text, LIMITS.cta.text, 'cta.text');
    maxLen(cfg.cta.buttonText, LIMITS.cta.buttonText, 'cta.buttonText');
    if (cfg.cta.buttonUrl && !/^https:\/\//.test(cfg.cta.buttonUrl)) err(`cta.buttonUrl muss mit https:// beginnen: "${cfg.cta.buttonUrl}"`);
    if ((cfg.cta.contacts || []).length > LIMITS.cta.contactsMax) err(`cta.contacts: max. ${LIMITS.cta.contactsMax} Einträge`);
  }

  const pages = cfg.pages || [];
  if (!pages.length) err('pages: mindestens eine Inhaltsseite nötig');

  pages.forEach((page, p) => {
    const where = `pages[${p}] („${page.title || page.label || '?'}“)`;
    need(page.label, `${where}.label`);
    need(page.title, `${where}.title`);
    need(page.lead, `${where}.lead`);
    maxLen(page.label, LIMITS.page.label, `${where}.label`);
    maxLen(page.title, LIMITS.page.title, `${where}.title`);
    maxLen(page.lead, LIMITS.page.lead, `${where}.lead`);

    const blocks = page.blocks || [];
    if (!blocks.length) err(`${where}: mindestens ein Block nötig`);
    if (blocks.length > LIMITS.page.blocksMax) err(`${where}: max. ${LIMITS.page.blocksMax} Blöcke (${blocks.length} angegeben)`);

    let heightMm = HEAD_MM;
    blocks.forEach((block, b) => {
      const at = `${where}.blocks[${b}]`;
      const type = block.type || 'text';
      heightMm += blockHeightMm(block) + BLOCK_GAP_MM;

      if (type === 'cards') {
        const items = block.items || [];
        if (items.length !== LIMITS.cards.items) err(`${at}: cards braucht genau ${LIMITS.cards.items} Karten (3-Spalten-Raster), ${items.length} angegeben`);
        items.forEach((item, i) => {
          need(item.title, `${at}.items[${i}].title`);
          need(item.text, `${at}.items[${i}].text`);
          maxLen(item.title, LIMITS.cards.title, `${at}.items[${i}].title`);
          maxLen(item.text, LIMITS.cards.text, `${at}.items[${i}].text`);
        });
      } else if (type === 'checklist') {
        const items = block.items || [];
        if (items.length < LIMITS.checklist.min || items.length > LIMITS.checklist.max) {
          err(`${at}: checklist braucht ${LIMITS.checklist.min}–${LIMITS.checklist.max} Punkte, ${items.length} angegeben`);
        }
        items.forEach((item, i) => maxLen(item, LIMITS.checklist.chars, `${at}.items[${i}]`));
      } else if (type === 'timeline') {
        const items = block.items || [];
        if (items.length !== LIMITS.timeline.items) err(`${at}: timeline braucht genau ${LIMITS.timeline.items} Schritte (3-Spalten-Raster), ${items.length} angegeben`);
        items.forEach((item, i) => {
          need(item.title, `${at}.items[${i}].title`);
          maxLen(item.title, LIMITS.timeline.title, `${at}.items[${i}].title`);
          maxLen(item.text, LIMITS.timeline.text, `${at}.items[${i}].text`);
        });
      } else if (type === 'table') {
        const headers = block.headers || [];
        const rows = block.rows || [];
        if (headers.length < LIMITS.table.headersMin || headers.length > LIMITS.table.headersMax) {
          err(`${at}: table braucht ${LIMITS.table.headersMin}–${LIMITS.table.headersMax} Spalten, ${headers.length} angegeben`);
        }
        if (!rows.length || rows.length > LIMITS.table.rowsMax) err(`${at}: table braucht 1–${LIMITS.table.rowsMax} Zeilen, ${rows.length} angegeben`);
        rows.forEach((row, r) => {
          if (row.length !== headers.length) err(`${at}.rows[${r}]: ${row.length} Zellen, aber ${headers.length} Spalten`);
          row.forEach((cell, c) => maxLen(cell, LIMITS.table.cell, `${at}.rows[${r}][${c}]`));
        });
      } else if (type === 'note') {
        need(block.text, `${at}.text`);
        maxLen(block.text, LIMITS.note, `${at}.text`);
      } else if (type === 'text') {
        need(block.text, `${at}.text`);
        maxLen(block.text, LIMITS.text, `${at}.text`);
      } else {
        err(`${at}: unbekannter Block-Typ "${type}" (erlaubt: cards, checklist, timeline, table, note, text)`);
      }
    });

    if (heightMm > HEIGHT_BUDGET_MM) {
      err(`${where}: Inhalt zu hoch für eine A4-Seite (~${Math.round(heightMm)}mm > ${HEIGHT_BUDGET_MM}mm) — Blöcke kürzen oder auf zwei Seiten verteilen`);
    }
  });

  return errors;
}

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

// Mockbild-Prompt für Codex: Cover als Referenzbild, Bild entsteht in EINEM
// Durchgang — Text stammt nur aus dem Cover, nachträgliche Overlays verboten.
const mockupPrompt = `Erzeuge das Mockbild für das DFS-E-Book „${config.title}".

Das beigefügte Bild ist das ECHTE Cover (Seite 1) des E-Books. Stelle dieses Cover als hochwertiges 3D-Buch-/Broschüren-Mockup dar: leicht schräge 3/4-Ansicht von vorne, weiches Licht von links oben, dezenter Schlagschatten.

Harte Regeln:
- Cover-Inhalt (Text, Logo, Farben, Layout) 1:1 vom Referenzbild übernehmen — Text NICHT neu setzen, NICHTS hinzufügen, NICHTS weglassen, keine Schreibweise „korrigieren".
- Kein zusätzlicher Text, keine Badges, keine Sticker, kein Wasserzeichen.
- Hintergrund hell und neutral (#FFFFFF bis #F5F5F5), kein Farbverlauf, kein Showroom-Kitsch.
- Format quadratisch 1024x1024, Buch mittig, ca. 70–80% der Bildhöhe.

Speichere das Ergebnis als PNG nach: public/ebooks/${config.slug}/assets/mockup.png`;
writeFileSync(path.join(outDir, 'mockup-prompt.txt'), mockupPrompt);

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
  console.log(`Mockup-Prompt: ${path.join(outDir, 'mockup-prompt.txt')} (Codex: codex exec -i assets/cover.png "$(cat mockup-prompt.txt)")`);
} else {
  console.log(`HTML: ${htmlPath}`);
  console.log('PDF: übersprungen (--no-pdf)');
}
