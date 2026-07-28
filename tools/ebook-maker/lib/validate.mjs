// Validierung der E-Book-Config — geteilt zwischen Generator (make-ebook.mjs)
// und MCP-Tool ebook_validate (src/mcp/tools.js).
// Limits sind aus dem A4-Layout in styles.css abgeleitet (feste Seitenhöhe 297mm).

export const LIMITS = {
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

// ponytail: grobe mm-Schätzung pro Block; Ground Truth ist der PDF-Seitenzahl-Check im Generator.
export const HEIGHT_BUDGET_MM = 235;
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

export function validateConfig(cfg) {
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
