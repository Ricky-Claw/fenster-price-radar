// E-Book-Worker für den VPS (nexus-host, Repo-Clone /opt/fenster-price-radar).
// Pollt Franks Inbox-Ordner auf neue E-Book-Configs, generiert (inkl. PDF via
// Chromium), übernimmt ein ggf. mitgeliefertes Mockbild, committet und pusht
// NUR die E-Book-Pfade. Ergebnis-Feedback landet als <slug>.result.txt in der Inbox.
//
// Aufruf (Cron, alle 5 Min):
//   cd /opt/fenster-price-radar && CHROME_PATH=/usr/bin/chromium-browser \
//     node tools/ebook-maker/vps-ebook-worker.mjs >> /var/log/ebook-worker.log 2>&1
//
// Inbox-Protokoll (Frank):
//   ebook-inbox/<slug>.json        -> Config, löst Generierung aus
//   ebook-inbox/<slug>.mockup.png  -> optionales Mockbild (1024x1024), wird mit übernommen
//   ebook-inbox/<slug>.result.txt  -> schreibt der Worker (OK/FEHLER + Details)
//   ebook-inbox/done/ | failed/    -> verarbeitete Configs

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './lib/validate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inboxDir = process.env.EBOOK_INBOX || '/docker/hermes-agent-pilot/data/profiles/frank/workspace/frank-dfs/ebook-inbox';
const lockFile = path.join(inboxDir, '.worker.lock');
const LOCK_STALE_MS = 30 * 60 * 1000;

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', ...opts });
  return { ok: res.status === 0, out: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

function writeResult(slug, lines) {
  writeFileSync(path.join(inboxDir, `${slug}.result.txt`), `${lines.join('\n')}\n`);
}

function moveTo(sub, file) {
  const dir = path.join(inboxDir, sub);
  mkdirSync(dir, { recursive: true });
  renameSync(path.join(inboxDir, file), path.join(dir, file));
}

function processJob(file) {
  const slugFromFile = file.replace(/\.json$/, '');
  let config;
  try {
    config = JSON.parse(readFileSync(path.join(inboxDir, file), 'utf8'));
  } catch (error) {
    writeResult(slugFromFile, ['FEHLER: Config ist kein gültiges JSON.', String(error.message || error)]);
    moveTo('failed', file);
    return;
  }

  const slug = config.slug;
  if (slug !== slugFromFile) {
    writeResult(slugFromFile, [`FEHLER: Dateiname (${slugFromFile}.json) muss dem slug in der Config entsprechen ("${slug}").`]);
    moveTo('failed', file);
    return;
  }

  const errors = validateConfig(config);
  if (errors.length) {
    writeResult(slug, ['FEHLER: Config ungültig — Inhalte kürzen oder Seiten aufteilen, Limits sind A4-Physik.', ...errors.map((e) => `- ${e}`)]);
    moveTo('failed', file);
    return;
  }

  const configTarget = path.join(repoRoot, 'tools/ebook-maker', `${slug}.json`);
  const outDir = path.join(repoRoot, 'public/ebooks', slug);
  copyFileSync(path.join(inboxDir, file), configTarget);

  const gen = sh('node', ['tools/ebook-maker/make-ebook.mjs', '--config', configTarget, '--out', outDir]);
  if (!gen.ok) {
    writeResult(slug, ['FEHLER: Generator abgebrochen.', gen.out.slice(-1500)]);
    moveTo('failed', file);
    sh('git', ['checkout', '--', configTarget]);
    sh('git', ['clean', '-fd', '--', outDir]);
    return;
  }

  const mockupSrc = path.join(inboxDir, `${slug}.mockup.png`);
  const hasMockup = existsSync(mockupSrc);
  if (hasMockup) copyFileSync(mockupSrc, path.join(outDir, 'assets/mockup.png'));

  // Nur E-Book-Pfade committen — Push deployt die Live-Seite.
  sh('git', ['add', configTarget, outDir]);
  const commit = sh('git', ['commit', '-m', `feat(ebook): ${config.title || slug} (via Frank-Inbox)`]);
  if (!commit.ok && !/nothing to commit/.test(commit.out)) {
    writeResult(slug, ['FEHLER: Commit fehlgeschlagen.', commit.out.slice(-800)]);
    moveTo('failed', file);
    return;
  }

  let push = sh('git', ['push', 'origin', 'main']);
  if (!push.ok) {
    sh('git', ['pull', '--rebase', 'origin', 'main']);
    push = sh('git', ['push', 'origin', 'main']);
  }
  if (!push.ok) {
    writeResult(slug, ['FEHLER: Push fehlgeschlagen — Elvis-Session informieren.', push.out.slice(-800)]);
    moveTo('failed', file);
    return;
  }

  if (hasMockup) rmSync(mockupSrc);
  moveTo('done', file);
  writeResult(slug, [
    'OK: E-Book generiert und veröffentlicht.',
    `Cover:   https://fenster-price-radar.vercel.app/ebooks/${slug}/assets/cover.png`,
    `Mockbild: ${hasMockup ? `https://fenster-price-radar.vercel.app/ebooks/${slug}/assets/mockup.png` : 'FEHLT noch — <slug>.mockup.png in die Inbox legen (Regeln: mockup-job.json im Repo-Ordner des E-Books).'}`,
    `PDF:     public/ebooks/${slug}/${slug}.pdf (im Repo; Live-Link ist Login-geschützt)`,
  ]);
  return true;
}

// Mockbild, das NACH der Generierung eintrifft (typischer Fall: Frank braucht
// erst das Cover als Referenz): eigenständig übernehmen und pushen.
function processLateMockup(file) {
  const slug = file.replace(/\.mockup\.png$/, '');
  const outDir = path.join(repoRoot, 'public/ebooks', slug);
  if (!existsSync(path.join(outDir, 'assets/cover.png'))) {
    writeResult(slug, [`FEHLER: Mockbild für unbekanntes E-Book "${slug}" — erst Config einreichen.`]);
    rmSync(path.join(inboxDir, file));
    return;
  }
  copyFileSync(path.join(inboxDir, file), path.join(outDir, 'assets/mockup.png'));
  sh('git', ['add', path.join(outDir, 'assets/mockup.png')]);
  const commit = sh('git', ['commit', '-m', `feat(ebook): Mockbild ${slug} (via Frank-Inbox)`]);
  if (commit.ok || /nothing to commit/.test(commit.out)) {
    let push = sh('git', ['push', 'origin', 'main']);
    if (!push.ok) {
      sh('git', ['pull', '--rebase', 'origin', 'main']);
      push = sh('git', ['push', 'origin', 'main']);
    }
    if (push.ok) {
      rmSync(path.join(inboxDir, file));
      writeResult(slug, ['OK: Mockbild übernommen und veröffentlicht.', `https://fenster-price-radar.vercel.app/ebooks/${slug}/assets/mockup.png`]);
      return true;
    }
  }
  writeResult(slug, ['FEHLER: Mockbild-Commit/Push fehlgeschlagen — Elvis-Session informieren.']);
}

function main() {
  if (!existsSync(inboxDir)) {
    console.error(`Inbox fehlt: ${inboxDir}`);
    process.exit(1);
  }
  if (existsSync(lockFile)) {
    const age = Date.now() - Number(readFileSync(lockFile, 'utf8') || 0);
    if (age < LOCK_STALE_MS) return; // anderer Lauf aktiv
  }
  writeFileSync(lockFile, String(Date.now()));
  try {
    const entries = readdirSync(inboxDir).filter((f) => !f.startsWith('.'));
    const jobs = entries.filter((f) => f.endsWith('.json'));
    const lateMockups = entries.filter((f) => f.endsWith('.mockup.png') && !jobs.includes(`${f.replace(/\.mockup\.png$/, '')}.json`));
    if (!jobs.length && !lateMockups.length) return;
    const pull = sh('git', ['pull', '--rebase', 'origin', 'main']);
    if (!pull.ok) {
      console.error(`git pull fehlgeschlagen: ${pull.out}`);
      return;
    }
    for (const file of jobs) {
      console.log(`[${new Date().toISOString()}] verarbeite ${file}`);
      const ok = processJob(file);
      console.log(`[${new Date().toISOString()}] ${file}: ${ok ? 'OK' : 'FEHLER (siehe result.txt)'}`);
    }
    for (const file of lateMockups) {
      console.log(`[${new Date().toISOString()}] verarbeite Mockbild ${file}`);
      const ok = processLateMockup(file);
      console.log(`[${new Date().toISOString()}] ${file}: ${ok ? 'OK' : 'FEHLER (siehe result.txt)'}`);
    }
  } finally {
    rmSync(lockFile, { force: true });
  }
}

main();
