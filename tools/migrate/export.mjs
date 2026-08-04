#!/usr/bin/env node

import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SECRET_PATTERNS = [
  ['OpenAI-Schlüssel', /sk-[A-Za-z0-9_-]{20,}/g],
  ['Stripe-Live-Schlüssel', /sk_live_/g],
  ['Stripe-Test-Schlüssel', /sk_test_/g],
  ['GitHub-Token', /ghp_[A-Za-z0-9]{20,}/g],
  ['GitHub-Token', /github_pat_/g],
  ['AWS-Access-Key', /AKIA[0-9A-Z]{16}/g],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\./g],
  ['npm-Token', /npm_[A-Za-z0-9]{36}/g],
  ['Vercel-Token', /vercel_[A-Za-z0-9]{24,}/g],
  ['Private-Key-Block', /-----BEGIN(?: RSA| EC| OPENSSH)? PRIVATE KEY-----/g],
  ['Slack-Token', /xox[bap]-/g],
  ['Bearer-Token', /Bearer [A-Za-z0-9_.-]{30,}/g],
  [
    'zugewiesenes Geheimnis',
    /(?:token|secret|apikey|api_key|password)[A-Za-z0-9_]*\s*[:=]\s*["'][^"']{16,}["']/gi,
  ],
];

const REQUIRED_FIELDS = ['name', 'title', 'description', 'files'];

function fail(message) {
  throw new Error(message);
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function hasMagic(segment) {
  return /[*?[\]]/.test(segment);
}

function segmentMatches(pattern, value) {
  let source = '^';
  for (const character of pattern) {
    if (character === '*') source += '[^/]*';
    else if (character === '?') source += '[^/]';
    else source += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  return new RegExp(`${source}$`).test(value);
}

function globMatches(pattern, relativePath) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = relativePath.split('/').filter(Boolean);

  function visit(patternIndex, pathIndex) {
    if (patternIndex === patternParts.length) return pathIndex === pathParts.length;
    if (patternParts[patternIndex] === '**') {
      if (visit(patternIndex + 1, pathIndex)) return true;
      return pathIndex < pathParts.length && visit(patternIndex, pathIndex + 1);
    }
    return (
      pathIndex < pathParts.length
      && segmentMatches(patternParts[patternIndex], pathParts[pathIndex])
      && visit(patternIndex + 1, pathIndex + 1)
    );
  }

  return visit(0, 0);
}

function normalizeGlob(glob, field) {
  if (typeof glob !== 'string' || glob.length === 0) {
    fail(`Manifest-Feld "${field}" muss ausschließlich nicht-leere Glob-Strings enthalten.`);
  }
  if (path.isAbsolute(glob)) {
    fail(`Manifest-Feld "${field}" darf keine absoluten Pfade enthalten: ${glob}`);
  }
  if (glob.includes('[')) {
    fail(`Manifest-Feld "${field}" enthält eine nicht unterstützte Zeichenklasse "[": ${glob}. Erlaubt sind nur *, ** und ?.`);
  }
  const normalized = path.posix.normalize(glob.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../')) {
    fail(`Manifest-Feld "${field}" darf die Repo-Wurzel nicht verlassen: ${glob}`);
  }
  return normalized;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('Manifest muss ein JSON-Objekt sein.');
  }
  for (const field of REQUIRED_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
      fail(`Manifest-Pflichtfeld "${field}" fehlt.`);
    }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(manifest.name)) {
    fail('Manifest-Feld "name" darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten.');
  }
  for (const field of ['title', 'description']) {
    if (typeof manifest[field] !== 'string') fail(`Manifest-Feld "${field}" muss ein String sein.`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('Manifest-Feld "files" muss ein nicht-leeres Array sein.');
  }
  if (manifest.exclude !== undefined && !Array.isArray(manifest.exclude)) {
    fail('Manifest-Feld "exclude" muss ein Array sein.');
  }
  if (!manifest.version && !manifest.versionFrom) {
    fail('Manifest benötigt entweder "version" oder "versionFrom".');
  }
  if (manifest.version !== undefined && typeof manifest.version !== 'string') {
    fail('Manifest-Feld "version" muss ein String sein.');
  }
  if (manifest.versionFrom !== undefined && typeof manifest.versionFrom !== 'string') {
    fail('Manifest-Feld "versionFrom" muss ein String sein.');
  }
  if (manifest.envVars !== undefined && !Array.isArray(manifest.envVars)) {
    fail('Manifest-Feld "envVars" muss ein Array sein.');
  }
  if (manifest.forbiddenTerms !== undefined && (
    !Array.isArray(manifest.forbiddenTerms)
    || manifest.forbiddenTerms.some((term) => typeof term !== 'string' || term.length === 0)
  )) {
    fail('Manifest-Feld "forbiddenTerms" muss ein Array aus nicht-leeren Strings sein.');
  }
  for (const [index, envVar] of (manifest.envVars ?? []).entries()) {
    if (!envVar || typeof envVar.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(envVar.name)) {
      fail(`Manifest-Feld "envVars[${index}].name" ist ungültig.`);
    }
    if (envVar.required !== undefined && typeof envVar.required !== 'boolean') {
      fail(`Manifest-Feld "envVars[${index}].required" muss boolean sein.`);
    }
    if (envVar.description !== undefined && typeof envVar.description !== 'string') {
      fail(`Manifest-Feld "envVars[${index}].description" muss ein String sein.`);
    }
  }
  if (manifest.modes !== undefined && (!manifest.modes || typeof manifest.modes !== 'object')) {
    fail('Manifest-Feld "modes" muss ein Objekt sein.');
  }
  for (const field of ['cmsNotes', 'dsgvoNotes']) {
    if (manifest[field] !== undefined && (
      !Array.isArray(manifest[field]) || manifest[field].some((item) => typeof item !== 'string')
    )) {
      fail(`Manifest-Feld "${field}" muss ein Array aus Strings sein.`);
    }
  }
}

export async function resolveVersion(manifest, repoRoot) {
  const validateVersion = (version) => {
    if (!/^[A-Za-z0-9._+-]+$/.test(version)) {
      fail(`Version "${version}" enthält ungültige Zeichen.`);
    }
    return version;
  };
  if (manifest.version) return validateVersion(manifest.version);
  const versionPath = path.resolve(repoRoot, normalizeGlob(manifest.versionFrom, 'versionFrom'));
  const relative = path.relative(repoRoot, versionPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('Manifest-Feld "versionFrom" verlässt die Repo-Wurzel.');
  }
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(versionPath, 'utf8'));
  } catch (error) {
    fail(`Version konnte nicht aus "${manifest.versionFrom}" gelesen werden: ${error.message}`);
  }
  if (!packageJson.version || typeof packageJson.version !== 'string') {
    fail(`In "${manifest.versionFrom}" fehlt eine gültige "version".`);
  }
  return validateVersion(packageJson.version);
}

function staticBase(glob) {
  const parts = glob.split('/');
  const magicIndex = parts.findIndex(hasMagic);
  if (magicIndex === -1) return path.posix.dirname(glob);
  return parts.slice(0, magicIndex).join('/') || '.';
}

function commonPath(paths) {
  const split = paths.map((item) => item.split('/').filter(Boolean));
  const common = [];
  for (let index = 0; index < Math.min(...split.map((item) => item.length)); index += 1) {
    if (!split.every((item) => item[index] === split[0][index])) break;
    common.push(split[0][index]);
  }
  return common.join('/') || '.';
}

async function walkFiles(root, relativeDirectory = '.', results = []) {
  const absoluteDirectory = path.resolve(root, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return results;
    throw error;
  }
  for (const entry of entries) {
    const relative = toPosix(path.join(relativeDirectory, entry.name)).replace(/^\.\//, '');
    if (entry.isSymbolicLink()) {
      results.push({ relative, symbolicLink: true });
    } else if (entry.isDirectory()) {
      await walkFiles(root, relative, results);
    } else if (entry.isFile()) {
      results.push({ relative, symbolicLink: false });
    }
  }
  return results;
}

function denyReason(relativeToToolRoot, repoRelative) {
  const parts = relativeToToolRoot.toLowerCase().split('/');
  const repoParts = repoRelative.toLowerCase().split('/');
  const basename = parts.at(-1);
  if (basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')) {
    return '.env/.env.*';
  }
  if (/\.(?:sqlite|sqlite-shm|sqlite-wal|db)$/i.test(basename)) return 'Datenbankdatei';
  if (/\.(?:pem|key)$/i.test(basename)) return 'Schlüsseldatei';
  if (parts.includes('node_modules')) return 'node_modules/**';
  if (parts.includes('.git')) return '.git/**';
  if (parts.slice(0, -1).includes('data') || repoParts.slice(0, -1).includes('data')) {
    return 'data/**';
  }
  return null;
}

function gitTrackedFiles(repoRoot, toolRoot) {
  const result = spawnSync('git', ['ls-files', '-z', '--', toolRoot], {
    cwd: repoRoot,
    encoding: 'buffer',
  });
  if (result.error || result.status !== 0) {
    fail(`Git-Dateiliste konnte nicht gelesen werden: ${
      result.error?.message ?? result.stderr?.toString('utf8').trim() ?? `Exit ${result.status}`
    }`);
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean).map(toPosix);
}

async function collectFiles(repoRoot, includeGlobs, excludeGlobs, trackedFilesOverride) {
  const toolRoot = commonPath(includeGlobs.map(staticBase));
  const roots = [...new Set(includeGlobs.map(staticBase))];
  const candidates = new Map();
  for (const root of roots) {
    for (const candidate of await walkFiles(repoRoot, root)) {
      candidates.set(candidate.relative, candidate);
    }
  }

  const trackedFiles = new Set(
    (trackedFilesOverride ?? gitTrackedFiles(repoRoot, toolRoot))
      .map((relative) => toPosix(relative).replace(/^\.\//, '')),
  );
  for (const glob of includeGlobs) {
    const diskMatches = [...candidates.values()].filter(({ relative }) => globMatches(glob, relative));
    const trackedMatches = diskMatches.filter(({ relative }) => trackedFiles.has(relative));
    if (trackedMatches.length === 0) {
      const detail = diskMatches.length > 0
        ? ' (trifft ausschließlich nicht git-versionierte Dateien)'
        : '';
      fail(`Include-Glob "${glob}" hat keine git-versionierte Datei getroffen${detail}.`);
    }
  }

  const included = [...candidates.values()].filter(({ relative }) => (
    trackedFiles.has(relative)
    && includeGlobs.some((glob) => globMatches(glob, relative))
    && !excludeGlobs.some((glob) => globMatches(glob, relative))
  )).sort((left, right) => left.relative.localeCompare(right.relative));
  if (included.length === 0) fail('Nach Anwendung von "exclude" bleiben keine Exportdateien übrig.');

  for (const candidate of included) {
    const relativeToToolRoot = path.posix.relative(toolRoot, candidate.relative);
    const reason = denyReason(relativeToToolRoot, candidate.relative);
    if (reason) {
      fail(`Denylist-Treffer in "${candidate.relative}" (${reason}). Manifest-Include muss korrigiert werden.`);
    }
    if (candidate.symbolicLink) {
      fail(`Symbolischer Link in Include-Auswahl ist nicht erlaubt: "${candidate.relative}".`);
    }
  }

  return {
    files: included.map(({ relative }) => relative),
    toolRoot,
  };
}

function decodeText(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    for (let index = 0; index + 1 < swapped.length; index += 2) {
      [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    }
    return swapped.toString('utf16le');
  }
  if (buffer.includes(0)) {
    let evenNuls = 0;
    let oddNuls = 0;
    for (let index = 0; index < buffer.length; index += 1) {
      if (buffer[index] === 0) {
        if (index % 2 === 0) evenNuls += 1;
        else oddNuls += 1;
      }
    }
    const nulCount = evenNuls + oddNuls;
    const dominantParity = Math.max(evenNuls, oddNuls);
    if (nulCount / buffer.length > 0.3 && dominantParity / nulCount >= 0.9) {
      if (evenNuls > oddNuls) {
        const swapped = Buffer.from(buffer);
        for (let index = 0; index + 1 < swapped.length; index += 2) {
          [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
        }
        return swapped.toString('utf16le');
      }
      return buffer.toString('utf16le');
    }
    return null;
  }
  const text = buffer.toString('utf8');
  const replacements = (text.match(/\uFFFD/g) ?? []).length;
  return replacements <= Math.max(1, Math.floor(text.length / 1000)) ? text : null;
}

function scanSecrets(text, relativePath) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    for (const [label, pattern] of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(lines[index])) {
        fail(`Secret-Scan: ${label} in "${relativePath}:${index + 1}" gefunden (Wert: ***MASKIERT***).`);
      }
    }
  }
}

function scanContentLeaks(text, relativePath, forbiddenTerms = []) {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const ipv4 = line.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)
      ?.find((value) => value !== '0.0.0.0' && value !== '127.0.0.1');
    const builtInHit = ipv4
      ? 'IPv4-Literal'
      : /\broot@/i.test(line)
        ? 'root@-Ziel'
        : /\bssh\s+(?:(?:-[^\s]+\s+)*)(?=[^\s]*(?:@|:|\.[A-Za-z0-9_-]))[A-Za-z0-9_.@:[\]-]+/i.test(line)
          ? 'SSH-Host-Ziel'
          : /\brsync\b.*(?:^|\s)(?=[^\s]*(?:@|:|\.[A-Za-z0-9_-]))[A-Za-z0-9_.@:[\]-]+/i.test(line)
            ? 'rsync-Host-Ziel'
            : null;
    const forbidden = forbiddenTerms.find((term) => line.toLowerCase().includes(term.toLowerCase()));
    if (builtInHit || forbidden) {
      const label = forbidden ? 'Manifest-forbiddenTerm' : builtInHit;
      fail(`Content-Leak-Scan: ${label} in "${relativePath}:${index + 1}" gefunden (Wert: ***MASKIERT***).`);
    }
  }
}

function scanImports(source, relativePath, packageRoot) {
  if (!/\.(?:[cm]?js)$/.test(relativePath)) return;
  const importPatterns = [
    /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s*)?(['"])([^'"]+)\1/g,
  ];
  const relativeInsidePackage = path.posix.relative(packageRoot, relativePath);
  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const specifier = match[2];
      if (!specifier.startsWith('.')) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relativeInsidePackage), specifier));
      if (resolved === '..' || resolved.startsWith('../')) {
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        fail(`Import-Scan: Import verlässt Paket-Wurzel in "${relativePath}:${line}" (${specifier}).`);
      }
    }
  }
}

function markdownList(items) {
  return items?.length ? items.map((item) => `- ${item}`).join('\n') : '- Keine';
}

function buildInstall(manifest, version) {
  const escapeTableCell = (value) => String(value ?? '').replaceAll('|', '\\|');
  const sections = [
    `# ${manifest.title}`,
    '',
    manifest.description,
    '',
    `Version: ${version}`,
    '',
    '## Umgebungsvariablen',
    '',
    '| Name | Pflicht | Beschreibung |',
    '| --- | --- | --- |',
    ...(manifest.envVars ?? []).map((envVar) => (
      `| \`${envVar.name}\` | ${envVar.required ? 'Ja' : 'Nein'} | ${escapeTableCell(envVar.description)} |`
    )),
  ];
  if ((manifest.envVars ?? []).length === 0) sections.push('| – | – | Keine |');

  if (manifest.modes?.embed) {
    sections.push('', '## Einbettung', '');
    if (manifest.modes.embed.snippet) {
      sections.push('```html', manifest.modes.embed.snippet, '```');
    }
    if (manifest.modes.embed.notes) sections.push('', manifest.modes.embed.notes);
  }
  if (manifest.modes?.selfhost) {
    sections.push('', '## Self-Hosting', '', markdownList(manifest.modes.selfhost.steps));
    if (manifest.modes.selfhost.notes) sections.push('', manifest.modes.selfhost.notes);
  }
  sections.push(
    '',
    '## CMS-Hinweise',
    '',
    markdownList(manifest.cmsNotes),
    '',
    '## DSGVO-Hinweise',
    '',
    markdownList(manifest.dsgvoNotes),
    '',
  );
  return sections.join('\n');
}

function buildEnvExample(envVars = []) {
  const lines = [];
  for (const envVar of envVars) {
    if (envVar.description) lines.push(`# ${envVar.description}`);
    lines.push(`# ${envVar.required ? 'Pflichtfeld' : 'Optional'}`);
    lines.push(`${envVar.name}=`, '');
  }
  return lines.join('\n');
}

async function directoryStats(root) {
  const files = await walkFiles(root);
  let bytes = 0;
  for (const file of files) {
    if (!file.symbolicLink) bytes += (await stat(path.resolve(root, file.relative))).size;
  }
  return { count: files.length, bytes };
}

function createZip(outRoot, packageDirectory, archivePath) {
  const probe = spawnSync('zip', ['-v'], { stdio: 'ignore' });
  if (probe.error?.code === 'ENOENT') {
    process.stdout.write('Hinweis: "zip" ist nicht installiert; das Exportverzeichnis bleibt das Ergebnis.\n');
    return;
  }
  if (probe.error || probe.status !== 0) {
    fail(`"zip" konnte nicht geprüft werden: ${probe.error?.message ?? `Exit ${probe.status}`}`);
  }
  const result = spawnSync(
    'zip',
    ['-qr', path.basename(archivePath), path.basename(packageDirectory)],
    { cwd: outRoot, encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) {
    fail(`ZIP-Erstellung fehlgeschlagen: ${(result.stderr || result.error?.message || '').trim()}`);
  }
}

export async function exportTool({
  toolName,
  zip = false,
  repoRoot = process.cwd(),
  manifestPath,
  outRoot = path.join(repoRoot, 'tools/migrate/out'),
  // Explizite Dependency-Injection für Tests; CLI und Release-Action verwenden immer Git.
  trackedFiles,
} = {}) {
  if (!toolName || !/^[A-Za-z0-9._-]+$/.test(toolName)) {
    fail('Aufruf: node tools/migrate/export.mjs <toolname> [--zip]');
  }
  const resolvedManifestPath = manifestPath
    ? path.resolve(manifestPath)
    : path.join(repoRoot, 'tools/migrate/manifests', `${toolName}.json`);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  } catch (error) {
    fail(`Manifest "${resolvedManifestPath}" konnte nicht geladen werden: ${error.message}`);
  }
  validateManifest(manifest);
  const version = await resolveVersion(manifest, repoRoot);

  const includeGlobs = manifest.files.map((glob) => normalizeGlob(glob, 'files'));
  const excludeGlobs = (manifest.exclude ?? []).map((glob) => normalizeGlob(glob, 'exclude'));
  const { files, toolRoot } = await collectFiles(
    repoRoot,
    includeGlobs,
    excludeGlobs,
    trackedFiles,
  );
  if (files.length === 0) fail('Nach Anwendung von "exclude" bleiben keine Exportdateien übrig.');
  if (files.some((relativePath) => path.posix.relative(toolRoot, relativePath) === '.env.example')) {
    fail('.env.example-Kollision: Das Tool liefert eine eigene ".env.example" mit; die generierte Datei darf nicht überschrieben werden.');
  }

  const packageName = `${manifest.name}-v${version}`;
  const packageDirectory = path.join(outRoot, packageName);
  const stagingDirectory = path.join(outRoot, `.${packageName}.tmp-${process.pid}`);
  await mkdir(outRoot, { recursive: true });
  await rm(packageDirectory, { recursive: true, force: true });
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });

  const scanStats = { text: 0, binary: 0 };
  try {
    for (const relativePath of files) {
      const sourcePath = path.resolve(repoRoot, relativePath);
      const packageRelativePath = path.posix.relative(toolRoot, relativePath);
      const destinationPath = path.resolve(stagingDirectory, packageRelativePath);
      const buffer = await readFile(sourcePath);
      const text = decodeText(buffer);
      if (text === null) {
        scanStats.binary += 1;
      } else {
        scanStats.text += 1;
        scanSecrets(text, relativePath);
        scanContentLeaks(text, relativePath, manifest.forbiddenTerms);
        if (/\.(?:[cm]?js)$/.test(relativePath)) {
          scanImports(text, relativePath, toolRoot);
        }
      }
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath);
    }
    const { forbiddenTerms: _internalForbiddenTerms, ...packageManifest } = manifest;
    const generatedFiles = new Map([
      ['INSTALL.md', buildInstall(manifest, version)],
      ['.env.example', buildEnvExample(manifest.envVars)],
      ['MANIFEST.json', `${JSON.stringify(packageManifest, null, 2)}\n`],
    ]);
    for (const [relativePath, content] of generatedFiles) {
      scanStats.text += 1;
      scanSecrets(content, relativePath);
      scanContentLeaks(content, relativePath, manifest.forbiddenTerms);
      await writeFile(path.join(stagingDirectory, relativePath), content);
    }
    await rename(stagingDirectory, packageDirectory);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }

  let archivePath;
  if (zip) {
    archivePath = path.join(outRoot, `${packageName}.zip`);
    await rm(archivePath, { force: true });
    createZip(outRoot, packageDirectory, archivePath);
    try {
      await access(archivePath);
    } catch {
      archivePath = undefined;
    }
  }

  const summary = await directoryStats(packageDirectory);
  process.stdout.write(
    `Export abgeschlossen: ${summary.count} Dateien, ${summary.bytes} Bytes\n`
    + `Secret-Scan: ${scanStats.text} Dateien gescannt, ${scanStats.binary} binär übersprungen\n`
    + 'Scans: Denylist grün, Content-Leaks grün, Secrets grün, Imports grün\n'
    + `Pfad: ${packageDirectory}\n`,
  );
  return { packageDirectory, archivePath, scanStats, ...summary };
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg.startsWith('-') && arg !== '--zip');
  const names = args.filter((arg) => !arg.startsWith('-'));
  if (unknown.length || names.length !== 1) {
    fail('Aufruf: node tools/migrate/export.mjs <toolname> [--zip]');
  }
  await exportTool({ toolName: names[0], zip: args.includes('--zip') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`Fehler: ${error.message}\n`);
    process.exitCode = 1;
  });
}
