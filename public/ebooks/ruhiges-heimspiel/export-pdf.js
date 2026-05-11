import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'index.html');
const pdfPath = path.join(__dirname, 'ruhiges-heimspiel-ebook.pdf');

function findChromium() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error('Kein Chromium/Chrome gefunden. Setze CHROME_PATH oder installiere Chromium.');
}

const chrome = findChromium();
const result = spawnSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--print-to-pdf-no-header',
  `--print-to-pdf=${pdfPath}`,
  `file://${htmlPath}`
], { encoding: 'utf8' });

if (result.status !== 0) {
  throw new Error(`PDF-Export fehlgeschlagen:\n${result.stderr || result.stdout}`);
}

const pdf = readFileSync(pdfPath);
if (pdf.slice(0, 4).toString() !== '%PDF') {
  throw new Error(`PDF wurde erzeugt, hat aber keine gültige PDF-Signatur: ${pdfPath}`);
}

console.log(`PDF exportiert: ${pdfPath} (${pdf.length} bytes)`);
