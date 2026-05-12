import { writeFileSync, mkdirSync } from 'node:fs';

const ORIGIN = 'https://deutscher-fenstershop.de';
const SEED_URLS = [
  '/', '/wissenswertes', '/erklaervideo', '/fensterbegriffe', '/profilschnitte-detailzeichnungen/pvc', '/fenster#versand-und-lieferzeiten',
  '/kunststoff-alu-fenster', '/fensterfarben', '/schallschutzfenster', '/sicherheitsfenster', '/energiesparfenster', '/anleitungen', '/callback'
].map((path) => new URL(path, ORIGIN).href);
const MAX_PAGES = Number(process.env.DFS_RAG_MAX_PAGES || 80);

function normalizeUrl(href, base = ORIGIN) {
  try {
    const url = new URL(href, base);
    if (url.origin !== ORIGIN) return '';
    url.hash = '';
    if (/\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|zip|mp4|webm|woff|woff2|ttf|eot)$/i.test(url.pathname)) return '';
    if (/\/(cart|checkout|users|login|warenkorb|kasse)(\/|$)/i.test(url.pathname)) return '';
    return url.href.replace(/\/$/, '');
  } catch { return ''; }
}
function extractLinks(html, base) {
  return [...html.matchAll(/href=["']([^"'#]+(?:#[^"']*)?)["']/gi)].map((m) => normalizeUrl(m[1], base)).filter(Boolean);
}
function stripHtml(html = '') {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü').replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü').replace(/&szlig;/g, 'ß').replace(/\s+/g, ' ').trim();
}
function titleFromHtml(html, url) { return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || new URL(url).pathname; }
function chunkText(text, size = 900, overlap = 120) { const chunks = []; for (let i = 0; i < text.length; i += size - overlap) { const part = text.slice(i, i + size).trim(); if (part.length >= 180) chunks.push(part); } return chunks; }

const queue = [...new Set(SEED_URLS.map((u) => normalizeUrl(u)).filter(Boolean))];
const seen = new Set();
const documents = [];
while (queue.length && seen.size < MAX_PAGES) {
  const url = queue.shift();
  if (!url || seen.has(url)) continue;
  seen.add(url);
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 FenstershopChatbotRAG/1.0' }, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    for (const link of extractLinks(html, response.url)) if (!seen.has(link) && queue.length < MAX_PAGES * 4) queue.push(link);
    const text = stripHtml(html);
    if (text.length < 250 || /404 Fehler|Page not found/i.test(text.slice(0, 1200))) throw new Error('no_content_or_404');
    const title = titleFromHtml(html, response.url);
    documents.push({ url: response.url, title, textLength: text.length, chunks: chunkText(text).map((content, index) => ({ index, content })) });
    console.log(`ok ${response.url} ${text.length}`);
  } catch (error) { console.warn(`skip ${url}: ${error.message}`); }
}
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/dfs-knowledge.json', JSON.stringify({ generatedAt: new Date().toISOString(), source: ORIGIN, maxPages: MAX_PAGES, documents }, null, 2));
console.log(`wrote public/data/dfs-knowledge.json docs=${documents.length} chunks=${documents.reduce((s,d)=>s+d.chunks.length,0)}`);
