import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportTool } from '../tools/migrate/export.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repoRoot, 'tests/fixtures/tool-export/repo');
let temporaryRepo;
let fixtureTrackedFiles;

async function listFiles(root, relativeDirectory = '.', results = []) {
  for (const entry of await readdir(path.join(root, relativeDirectory), { withFileTypes: true })) {
    const relative = path.join(relativeDirectory, entry.name).replace(/^\.\//, '').split(path.sep).join('/');
    if (entry.isDirectory()) await listFiles(root, relative, results);
    else if (entry.isFile()) results.push(relative);
  }
  return results;
}

async function runExport(toolName, options = {}) {
  try {
    const result = await exportTool({
      toolName,
      repoRoot: temporaryRepo,
      outRoot: path.join(temporaryRepo, 'tools/migrate/out'),
      trackedFiles: fixtureTrackedFiles,
      ...options,
    });
    return { code: 0, result, error: '' };
  } catch (error) {
    return { code: 1, error: error.message };
  }
}

before(async () => {
  temporaryRepo = await mkdtemp(path.join(os.tmpdir(), 'tool-export-test-'));
  await cp(fixtureRoot, temporaryRepo, { recursive: true });
  fixtureTrackedFiles = await listFiles(fixtureRoot);

  const envFixtures = [
    ['env-tool/.env', 'SECRET=nicht-echt\n'],
    ['env-tool/.env.example', 'PUBLIC_VALUE=\n'],
    ['env-example-tool/.env.example', 'PUBLIC_VALUE=\n'],
  ];
  for (const [relativePath, content] of envFixtures) {
    await mkdir(path.dirname(path.join(temporaryRepo, relativePath)), { recursive: true });
    await writeFile(path.join(temporaryRepo, relativePath), content);
    if (!fixtureTrackedFiles.includes(relativePath)) fixtureTrackedFiles.push(relativePath);
  }

  const utf16Secret = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from("export const apiTokenValue = 'ABCDEFGHIJKLMNOPQRSTUVWX';\n", 'utf16le'),
  ]);
  await writeFile(path.join(temporaryRepo, 'utf16-tool/config.txt'), utf16Secret);
  const utf16NoBomSecret = Buffer.from(`const key = 'sk_live_${'A'.repeat(24)}';\n`, 'utf16le');
  await mkdir(path.join(temporaryRepo, 'utf16-nobom-tool'), { recursive: true });
  await writeFile(path.join(temporaryRepo, 'utf16-nobom-tool/config.txt'), utf16NoBomSecret);
  fixtureTrackedFiles.push('utf16-nobom-tool/config.txt');
});

after(async () => {
  if (temporaryRepo) await rm(temporaryRepo, { recursive: true, force: true });
});

test('Happy Path baut vollständiges Übergabepaket', async () => {
  const { code, result, error } = await runExport('happy');
  assert.equal(code, 0, error);

  const output = result.packageDirectory;
  const install = await readFile(path.join(output, 'INSTALL.md'), 'utf8');
  const envExample = await readFile(path.join(output, '.env.example'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(output, 'MANIFEST.json'), 'utf8'));

  assert.match(install, /PUBLIC_API_URL/);
  assert.match(install, /Öffentliche Basis-URL \\\| der API/);
  assert.match(install, /<script src="https:\/\/example\.test\/widget\.js"><\/script>/);
  assert.match(envExample, /^PUBLIC_API_URL=$/m);
  assert.doesNotMatch(envExample, /https:\/\/|example\.test/);
  assert.equal(manifest.name, 'mini-tool');
  assert.equal((await stat(path.join(output, 'src/index.js'))).isFile(), true);
  assert.deepEqual(result.scanStats, { text: 6, binary: 0 });
});

test('Git-Filter lehnt einen Glob mit ausschließlich untracked Dateien ab', async () => {
  const trackedFiles = fixtureTrackedFiles.filter((file) => !file.startsWith('untracked-tool/'));
  const result = await runExport('untracked', { trackedFiles });

  assert.notEqual(result.code, 0);
  assert.match(result.error, /Include-Glob "untracked-tool\/\*\*\/\*"/);
  assert.match(result.error, /ausschließlich nicht git-versionierte/);
});

test('Git-Filter exportiert aus demselben Glob nur die als tracked übergebenen Dateien', async () => {
  const trackedFiles = fixtureTrackedFiles.filter((file) => file !== 'untracked-tool/config.js');
  const { code, result, error } = await runExport('untracked', { trackedFiles });

  assert.equal(code, 0, error);
  const outputFiles = await listFiles(result.packageDirectory);
  assert.ok(outputFiles.includes('tracked.js'));
  assert.ok(!outputFiles.includes('config.js'));
});

test('Secret-Scan bricht ab, nennt Datei und maskiert den Wert', async () => {
  const fakeKey = `sk_live_${'A'.repeat(24)}`;
  const result = await runExport('secret');

  assert.notEqual(result.code, 0);
  assert.match(result.error, /secret-tool\/config\.js:1/);
  assert.match(result.error, /\*\*\*MASKIERT\*\*\*/);
  assert.doesNotMatch(result.error, new RegExp(fakeKey));
});

test('Secret-Scan erkennt sk-proj-Schlüssel mit Bindestrichen', async () => {
  const result = await runExport('skproj');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /OpenAI-Schlüssel.*skproj-tool\/config\.js:1/);
});

test('Secret-Scan erkennt JWTs', async () => {
  const result = await runExport('jwt');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /JWT.*jwt-tool\/config\.js:1/);
});

test('Secret-Scan erkennt Schlüsselwort als Teilstring eines Identifiers', async () => {
  const result = await runExport('identifier-secret');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /zugewiesenes Geheimnis.*identifier-secret-tool\/config\.js:1/);
});

test('Secret-Scan dekodiert UTF-16 mit BOM', async () => {
  const result = await runExport('utf16');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /zugewiesenes Geheimnis.*utf16-tool\/config\.txt:1/);
});

test('Secret-Scan dekodiert UTF-16LE ohne BOM anhand des NUL-Musters', async () => {
  const result = await runExport('utf16-nobom');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Stripe-Live-Schlüssel.*utf16-nobom-tool\/config\.txt:1/);
});

test('Content-Leak-Gate erkennt IPv4-Literale', async () => {
  const result = await runExport('ipv4');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Content-Leak-Scan: IPv4-Literal.*ipv4-tool\/config\.txt:1/);
});

test('Content-Leak-Gate erkennt case-insensitive forbiddenTerms', async () => {
  const result = await runExport('forbidden');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Manifest-forbiddenTerm.*forbidden-tool\/config\.txt:1/);
  assert.doesNotMatch(result.error, /internal-host/i);
});

test('Content-Leak-Gate akzeptiert ssh/rsync-Prosa ohne Host-Ziel', async () => {
  const { code, error } = await runExport('ssh-prose');
  assert.equal(code, 0, error);
});

test('Content-Leak-Gate erkennt ein SSH-Host-Ziel', async () => {
  const result = await runExport('ssh-host');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Content-Leak-Scan: SSH-Host-Ziel.*ssh-host-tool\/deploy\.txt:1/);
});

test('Content-Leak-Gate erkennt ein rsync-Host-Ziel', async () => {
  const result = await runExport('rsync-host');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Content-Leak-Scan: rsync-Host-Ziel.*rsync-host-tool\/deploy\.txt:1/);
});

test('Exclude wird vor Denylist angewendet', async () => {
  const result = await runExport('env-exclude');
  assert.equal(result.code, 0, result.error);
  assert.equal((await stat(path.join(result.result.packageDirectory, 'index.js'))).isFile(), true);
  assert.ok(!(await listFiles(result.result.packageDirectory)).includes('.env'));
});

test('Eigene .env.example kollidiert mit der generierten Datei', async () => {
  const result = await runExport('env-example');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /\.env\.example-Kollision/);
  assert.match(result.error, /nicht überschrieben/);
});

test('Denylist bricht bei eingeschlossener Datenbankdatei ab', async () => {
  const result = await runExport('data');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Denylist-Treffer/);
  assert.match(result.error, /data\/kunden\.sqlite/);
});

test('Denylist erkennt data bei engem Include trotz verschobener Paketwurzel', async () => {
  const result = await runExport('narrow-data');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Denylist-Treffer.*narrow-tool\/data\/config\.txt/);
});

test('Denylist erkennt data als verschachteltes Verzeichnis-Segment ohne DB-Endung', async () => {
  const result = await runExport('segment-data');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Denylist-Treffer.*data-tool\/data\/leads\.json/);
});

test('Import-Scan bricht bei paketüberschreitendem require ab', async () => {
  const result = await runExport('import');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Import-Scan/);
  assert.match(result.error, /require-outside\/src\/index\.js:1/);
});

test('Import-Scan löst ./../-Formen in CJS auf', async () => {
  const result = await runExport('escape-import');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Import-Scan.*escape-tool\/src\/index\.cjs:1/);
});

test('Manifest ohne Pflichtfeld liefert klaren Fehler', async () => {
  const result = await runExport('invalid');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Manifest-Pflichtfeld "title" fehlt/);
});

test('Manifest-Version mit Zeilenumbruch wird in resolveVersion abgelehnt', async () => {
  const result = await runExport('version-injection');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Version.*ungültige Zeichen/s);
  assert.match(result.error, /EVIL=1/);
});

test('Glob-Zeichenklassen werden mit klarer Meldung abgelehnt', async () => {
  const result = await runExport('glob-class');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /nicht unterstützte Zeichenklasse/);
});

test('Jeder Include-Glob muss mindestens eine versionierte Datei treffen', async () => {
  const result = await runExport('null-glob');
  assert.notEqual(result.code, 0);
  assert.match(result.error, /Include-Glob "mini-tool\/fehlt\/\*\*\/\*\.js"/);
});

test('rueckhol-manifest ist strukturell und statisch auflösbar', async () => {
  const manifestPath = path.join(repoRoot, 'tools/migrate/manifests/rueckhol-automatik.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  for (const field of ['name', 'title', 'description', 'files']) {
    assert.notEqual(manifest[field], undefined, `Pflichtfeld ${field} fehlt`);
    assert.notEqual(manifest[field], null, `Pflichtfeld ${field} fehlt`);
    assert.notEqual(manifest[field], '', `Pflichtfeld ${field} ist leer`);
  }
  assert.match(manifest.name, /^[A-Za-z0-9._-]+$/);
  assert.equal(typeof manifest.title, 'string');
  assert.equal(typeof manifest.description, 'string');
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
  assert.ok(
    typeof manifest.version === 'string' || typeof manifest.versionFrom === 'string',
    'Manifest benötigt version oder versionFrom',
  );

  for (const glob of manifest.files) {
    const parts = glob.split('/');
    const magicIndex = parts.findIndex((part) => /[*?]/.test(part));
    const staticPath = magicIndex === -1 ? glob : parts.slice(0, magicIndex).join('/');
    let staticPathExists = false;
    try {
      const info = await stat(path.join(repoRoot, staticPath));
      staticPathExists = info.isDirectory() || info.isFile();
    } catch {
      staticPathExists = false;
    }
    assert.equal(
      staticPathExists,
      true,
      `Include-Glob zeigt auf keinen existierenden Pfad: ${glob}`,
    );
  }

  assert.ok(manifest.exclude.includes('rueckhol-automatik/data/**'));
  assert.deepEqual(manifest.forbiddenTerms, ['nexus-host', 'hstgr', '76.13.143.100']);
  assert.deepEqual(
    manifest.envVars.map(({ name }) => name).sort(),
    [
      'ADMIN_TOKEN',
      'DISABLE_DEMO',
      'FENSTER_RADAR_AUTH_SECRET',
      'FENSTER_RADAR_PASSWORD',
      'PORT',
      'RUECKHOL_DATA_KEY',
      'SITE_ORIGINS',
      'WEBHOOK_URL',
    ],
  );
  for (const envVar of manifest.envVars) {
    assert.match(envVar.name, /^[A-Za-z_][A-Za-z0-9_]*$/);
    assert.equal(typeof envVar.required, 'boolean');
    assert.equal(typeof envVar.description, 'string');
  }
});

test('echtes rueckhol-Manifest exportiert nur die freigegebene Übergabeauswahl', async () => {
  const outRoot = path.join(temporaryRepo, 'real-export');
  const result = await exportTool({
    toolName: 'rueckhol-automatik',
    repoRoot,
    outRoot,
  });
  const outputFiles = await listFiles(result.packageDirectory);
  const lowerFiles = outputFiles.map((file) => file.toLowerCase());
  const tracked = new Set(
    spawnSync('git', ['ls-files', '-z', '--', 'rueckhol-automatik'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.split('\0').filter(Boolean),
  );

  assert.equal(lowerFiles.some((file) => /\.sqlite|\.db$/.test(file)), false);
  assert.equal(
    lowerFiles.some((file) => {
      const basename = path.posix.basename(file);
      return basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example');
    }),
    false,
  );
  assert.equal(outputFiles.includes('README.md'), false);
  assert.equal(outputFiles.includes('CHANGELOG.md'), false);
  assert.equal(outputFiles.some((file) => file.includes('quittung-index.html')), false);
  assert.equal(outputFiles.some((file) => file.includes('fensterradar-test.html')), false);
  assert.deepEqual(
    outputFiles.filter((file) => file.startsWith('demo/')).sort(),
    ['demo/alle-popups.html', 'demo/demo-test.html', 'demo/index.html'],
  );
  for (const relative of outputFiles) {
    if (['.env.example', 'INSTALL.md', 'MANIFEST.json'].includes(relative)) continue;
    assert.equal(
      tracked.has(`rueckhol-automatik/${relative}`),
      true,
      `Untracked Exportdatei: ${relative}`,
    );
  }

  for (const relative of outputFiles) {
    const buffer = await readFile(path.join(result.packageDirectory, relative));
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    const leakedIpv4 = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)
      ?.find((value) => value !== '0.0.0.0' && value !== '127.0.0.1');
    assert.equal(leakedIpv4, undefined, `IPv4-Leak in ${relative}`);
    assert.doesNotMatch(text, /\broot@/i, `root@-Leak in ${relative}`);
  }
});
