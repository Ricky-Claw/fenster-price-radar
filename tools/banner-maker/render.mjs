import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readImageMeta } from './image-meta.mjs';

export class ChromeUnavailableError extends Error {}

function makeTempDir(workDir) {
  try {
    return mkdtempSync(path.join(os.tmpdir(), 'banner-maker-'));
  } catch {
    const fallback = path.join(workDir, '.tmp');
    try {
      mkdirSync(fallback, { recursive: true });
      return mkdtempSync(path.join(fallback, 'banner-maker-'));
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        throw new ChromeUnavailableError(`Chrome-Screenshot kann kein temporäres Verzeichnis anlegen: ${error.message}`);
      }
      throw error;
    }
  }
}

function supersampledHtml(html) {
  const style = '<style>html { zoom: 2; }</style>';
  return html.includes('</head>') ? html.replace('</head>', `${style}</head>`) : `${style}${html}`;
}

export function renderScreenshot({ html, width, height, chromePath, workDir }) {
  const tempDir = makeTempDir(path.resolve(workDir || path.join('tools', 'banner-maker', 'out')));
  const htmlPath = path.join(tempDir, 'banner.html');
  const pngPath = path.join(tempDir, 'banner.png');

  try {
    writeFileSync(htmlPath, supersampledHtml(html), 'utf8');
    const result = spawnSync(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--virtual-time-budget=2500',
      `--window-size=${width * 2},${height * 2}`,
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ], { encoding: 'utf8', timeout: 20000 });
    if (result.error) {
      const detail = String(result.error.message || 'unbekannter Fehler').trim().slice(0, 1000);
      throw new ChromeUnavailableError(`Chrome-Screenshot fehlgeschlagen: ${detail}`);
    }
    if (result.status !== 0) {
      const detail = String(result.stderr || result.stdout || 'unbekannter Fehler').trim().slice(0, 1000);
      throw new Error(`Chrome-Screenshot fehlgeschlagen: ${detail}`);
    }

    const pngBuffer = readFileSync(pngPath);
    const meta = readImageMeta(pngBuffer);
    const expectedWidth = width * 2;
    const expectedHeight = height * 2;
    if (meta.format !== 'png' || meta.width !== expectedWidth || meta.height !== expectedHeight) {
      throw new Error(`Chrome-Screenshot hat falsche Maße: ist ${meta.width}x${meta.height} (${meta.format}), soll ${expectedWidth}x${expectedHeight} (png) sein.`);
    }
    return pngBuffer;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
