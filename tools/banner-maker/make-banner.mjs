import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_CALENDAR } from '../../src/actionCalendar.js';
import branding from './branding.json' with { type: 'json' };
import sizes from './sizes.json' with { type: 'json' };
import { checkAdhocWording, resolveBrief } from './select-action.mjs';
import { checkCopyFits, classifySize, renderBannerHtml } from './banner-template.mjs';
import { loadFontsCss } from './fonts.mjs';
import { readImageMeta } from './image-meta.mjs';
import { renderScreenshot } from './render.mjs';
import { finalizeBanner } from './compress.mjs';
import { findChrome } from '../lib/find-chrome.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const maxBytes = 150 * 1024;

if (!branding || typeof branding.logo !== 'string' || !branding.colors) {
  throw new Error('branding.json unvollständig: "logo" und "colors" sind Pflicht.');
}
if (!Array.isArray(sizes.sizes) || !sizes.sizes.length) {
  throw new Error('sizes.json: "sizes" muss ein nicht-leeres Array sein.');
}
for (const size of sizes.sizes) {
  if (typeof size.name !== 'string' || !size.name.trim()) {
    throw new Error('sizes.json: Jedes Bannerformat benötigt ein nicht-leeres String-Feld "name".');
  }
  if (!Number.isInteger(size.width) || size.width <= 0 || !Number.isInteger(size.height) || size.height <= 0) {
    throw new Error(`sizes.json: Bannerformat „${size.name || 'unbenannt'}“ benötigt positive ganzzahlige width und height.`);
  }
}
if (typeof branding.colors !== 'object' || Array.isArray(branding.colors) || Object.values(branding.colors).some((value) => typeof value !== 'string')) {
  throw new Error('branding.json: Alle Werte in "colors" müssen Strings sein.');
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function dataUri(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(extension)) throw new Error(`Nicht unterstütztes Motivformat: ${filePath}. Erlaubt sind .jpg, .jpeg und .png.`);
  const buffer = readFileSync(filePath);
  const meta = readImageMeta(buffer);
  if (!['png', 'jpeg'].includes(meta.format)) throw new Error(`${filePath} ist kein gültiges PNG/JPEG`);
  const mime = meta.format === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function firstMotif(actionId) {
  if (!actionId) return null;
  const directory = path.join(repoRoot, 'tools/banner-maker/motive', actionId);
  if (!existsSync(directory)) return null;
  const filename = readdirSync(directory)
    .filter((name) => /\.(jpe?g|png)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'de'))[0];
  return filename ? path.join(directory, filename) : null;
}

function selectedSizes(filter) {
  if (!filter) return sizes.sizes;
  const values = filter.split(',').map((value) => value.trim()).filter(Boolean);
  const result = values.map((value) => {
    const named = sizes.sizes.find((size) => size.name === value);
    if (named) return named;
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) throw new Error(`Unbekanntes Bannerformat „${value}“. Nutze einen Namen aus sizes.json oder WxH.`);
    return { name: value.toLowerCase(), width: Number(match[1]), height: Number(match[2]) };
  });
  if (!result.length) throw new Error('Kein gültiges Bannerformat aus --size erkannt.');
  return result;
}

function printTable(rows) {
  console.table(rows.map((row) => ({
    Name: row.name,
    Maße: `${row.width}x${row.height}`,
    Format: row.format,
    KB: (row.bytes / 1024).toFixed(1),
    Qualität: row.quality ?? '–',
  })));
}

async function main() {
  const aktionId = argValue('--aktion');
  const configArg = argValue('--config');
  if (aktionId && configArg) throw new Error('Bitte entweder --aktion oder --config verwenden, nicht beides.');

  const adhoc = configArg ? JSON.parse(readFileSync(path.resolve(configArg), 'utf8')) : null;
  const brief = resolveBrief({ aktionId, adhoc, calendar: ACTION_CALENDAR, branding });
  if (brief.mode === 'adhoc') {
    const violations = checkAdhocWording(brief);
    if (violations.length) throw new Error(`Ad-hoc-Wording ist nicht zulässig:\n${violations.map((item) => `  - ${item}`).join('\n')}`);
  }

  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const outDir = path.resolve(argValue('--out', path.join(repoRoot, 'tools/banner-maker/out', `${brief.id || 'adhoc'}-${date}`)));
  const publicDir = path.join(repoRoot, 'public');
  const distDir = path.join(repoRoot, 'dist');
  if (outDir === publicDir || outDir.startsWith(`${publicDir}${path.sep}`) || outDir === distDir || outDir.startsWith(`${distDir}${path.sep}`)) {
    throw new Error('Banner-Output darf nie unter public/ oder dist/ liegen (wäre sofort öffentlich).');
  }
  const logoPath = path.resolve(repoRoot, branding.logo);
  if (!existsSync(logoPath)) throw new Error(`DFS-Logo fehlt: ${logoPath}`);
  const partnerPath = branding.partnerLogos?.[brief.id];
  if (partnerPath && !existsSync(path.resolve(repoRoot, partnerPath))) throw new Error(`Partner-Logo fehlt: ${partnerPath}`);
  const motifOverride = argValue('--motiv');
  const motifPath = motifOverride ? path.resolve(motifOverride) : firstMotif(brief.id);
  if (motifPath && !existsSync(motifPath)) throw new Error(`Motivdatei fehlt: ${motifPath}`);
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Kein Chrome/Chromium gefunden. Installiere Google Chrome oder setze CHROME_PATH auf den Browser-Pfad.');

  const fontsCss = loadFontsCss();
  const logoDataUri = dataUri(logoPath);
  const partnerLogoDataUri = partnerPath ? dataUri(path.resolve(repoRoot, partnerPath)) : null;
  const motifDataUri = motifPath ? dataUri(motifPath) : null;
  const outputSizes = selectedSizes(argValue('--size'));
  const rows = [];
  const errors = [];
  mkdirSync(outDir, { recursive: true });

  for (const size of outputSizes) {
    for (const warning of checkCopyFits(brief, classifySize(size.width, size.height))) console.warn(`Warnung (${size.name}): ${warning}`);
    try {
      const html = renderBannerHtml({ brief, size, branding, fontsCss, logoDataUri, partnerLogoDataUri, motifDataUri });
      const screenshot = renderScreenshot({ html, width: size.width, height: size.height, chromePath, workDir: outDir });
      const finalBanner = await finalizeBanner({ pngBuffer: screenshot, width: size.width, height: size.height, preferPng: !motifDataUri, maxBytes });
      const filename = `${size.name}-${size.width}x${size.height}.${finalBanner.format === 'png' ? 'png' : 'jpg'}`;
      const target = path.join(outDir, filename);
      writeFileSync(target, finalBanner.buffer);
      const diskBuffer = readFileSync(target);
      const meta = readImageMeta(diskBuffer);
      if (meta.format !== finalBanner.format || meta.width !== size.width || meta.height !== size.height || diskBuffer.length > maxBytes) {
        errors.push(`${size.name}: geschriebenes Banner verletzt das harte Format-/Maß-/Größen-Gate.`);
      } else {
        rows.push({ name: size.name, width: size.width, height: size.height, ...finalBanner });
      }
    } catch (error) {
      errors.push(`${size.name}: ${error.message}`);
    }
  }

  if (rows.length) printTable(rows);
  if (errors.length) throw new Error(`Banner-Erstellung fehlgeschlagen:\n${errors.map((item) => `  - ${item}`).join('\n')}`);
  console.log(`${rows.length} Dateien erstellt: ${outDir}`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
