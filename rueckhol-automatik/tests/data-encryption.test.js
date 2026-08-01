const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');

const { createDatabase } = require('../server/db');
const { PREFIX, createDataEncryption } = require('../server/lib/data-encryption');

function tempDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckhol-encryption-'));
  return {
    dbPath: path.join(directory, 'test.sqlite'),
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function useFreshKey() {
  process.env.RUECKHOL_DATA_KEY = crypto.randomBytes(32).toString('base64');
}

function legacyEncryptJson(value, context) {
  const key = Buffer.from(process.env.RUECKHOL_DATA_KEY, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${ciphertext.toString('base64')}:${cipher.getAuthTag().toString('base64')}`;
}

test('site-bound AAD roundtrips and legacy column-only envelopes remain readable', () => {
  useFreshKey();
  const encryption = createDataEncryption();
  const bound = encryption.encryptJson({ email: 'site@example.com' }, 'submissions.payload', 'site-a');
  assert.deepEqual(
    encryption.decryptJson(bound, 'submissions.payload', 'site-a'),
    { email: 'site@example.com' },
  );
  assert.throws(
    () => encryption.decryptJson(bound, 'submissions.payload', 'site-b'),
    /Cannot decrypt submissions\.payload/,
  );

  const legacy = legacyEncryptJson({ email: 'legacy@example.com' }, 'submissions.payload');
  assert.deepEqual(
    encryption.decryptJson(legacy, 'submissions.payload', 'site-a'),
    { email: 'legacy@example.com' },
  );
});

test('submission payloads and event metadata are encrypted at rest and decrypt on read', () => {
  useFreshKey();
  const fixture = tempDatabase();
  const db = createDatabase({ dbPath: fixture.dbPath });
  try {
    db.insertSubmission({
      site_id: 'demo',
      campaign_id: 'lead',
      kind: 'contact',
      payload: { email: 'person@example.com', name: 'Person', message: 'Private', consent: true },
      created_at: '2026-07-30T10:00:00.000Z',
    });
    db.insertEvent({
      site_id: 'demo',
      campaign_id: 'lead',
      type: 'contact_submit',
      metadata: { email: 'person@example.com', trigger: 'exit_intent' },
      created_at: '2026-07-30T10:00:00.000Z',
    });
  } finally {
    db.close();
  }

  const raw = new Database(fixture.dbPath);
  try {
    const payload = raw.prepare('SELECT payload FROM submissions').get().payload;
    const metadata = raw.prepare('SELECT metadata FROM events').get().metadata;
    assert.ok(payload.startsWith(PREFIX));
    assert.ok(metadata.startsWith(PREFIX));
    assert.doesNotMatch(payload, /person@example\.com|Private/);
    assert.doesNotMatch(metadata, /person@example\.com/);
  } finally {
    raw.close();
  }

  const reopened = createDatabase({ dbPath: fixture.dbPath });
  try {
    assert.deepEqual(reopened.listSubmissions('demo')[0].payload, {
      email: 'person@example.com',
      name: 'Person',
      message: 'Private',
      consent: true,
    });
    assert.deepEqual(reopened.listEvents('demo')[0].metadata, {
      email: 'person@example.com',
      trigger: 'exit_intent',
    });
  } finally {
    reopened.close();
    fixture.cleanup();
  }
});

test('legacy plaintext JSON rows remain readable', () => {
  useFreshKey();
  const fixture = tempDatabase();
  const initialized = createDatabase({ dbPath: fixture.dbPath });
  initialized.close();

  const raw = new Database(fixture.dbPath);
  try {
    raw.prepare(`
      INSERT INTO submissions (site_id, campaign_id, kind, payload, created_at)
      VALUES (@site_id, @campaign_id, @kind, @payload, @created_at)
    `).run({
      site_id: 'legacy',
      campaign_id: '',
      kind: 'newsletter',
      payload: JSON.stringify({ email: 'old@example.com', consent: true }),
      created_at: '2026-07-29T10:00:00.000Z',
    });
    raw.prepare(`
      INSERT INTO events (site_id, campaign_id, type, metadata, created_at)
      VALUES (@site_id, @campaign_id, @type, @metadata, @created_at)
    `).run({
      site_id: 'legacy',
      campaign_id: '',
      type: 'popup_shown',
      metadata: JSON.stringify({ trigger: 'idle' }),
      created_at: '2026-07-29T10:00:00.000Z',
    });
  } finally {
    raw.close();
  }

  const db = createDatabase({ dbPath: fixture.dbPath });
  try {
    assert.equal(db.listSubmissions('legacy')[0].payload.email, 'old@example.com');
    assert.equal(db.listEvents('legacy')[0].metadata.trigger, 'idle');
  } finally {
    db.close();
    fixture.cleanup();
  }
});

test('corrupt encrypted rows fall back per row without hiding valid rows', () => {
  useFreshKey();
  const fixture = tempDatabase();
  const db = createDatabase({ dbPath: fixture.dbPath });
  db.insertSubmission({
    site_id: 'valid',
    campaign_id: '',
    kind: 'newsletter',
    payload: { email: 'valid@example.com', consent: true },
    created_at: '2026-07-30T10:00:00.000Z',
  });
  db.insertSubmission({
    site_id: 'corrupt',
    campaign_id: '',
    kind: 'newsletter',
    payload: { email: 'corrupt@example.com', consent: true },
    created_at: '2026-07-30T10:01:00.000Z',
  });
  db.insertEvent({
    site_id: 'valid',
    campaign_id: '',
    type: 'popup_shown',
    metadata: { trigger: 'idle' },
    created_at: '2026-07-30T10:00:00.000Z',
  });
  db.insertEvent({
    site_id: 'corrupt',
    campaign_id: '',
    type: 'popup_shown',
    metadata: { trigger: 'scroll' },
    created_at: '2026-07-30T10:01:00.000Z',
  });
  db.close();

  const raw = new Database(fixture.dbPath);
  raw.prepare(`UPDATE submissions SET payload = 'enc:v1:broken' WHERE site_id = 'corrupt'`).run();
  raw.prepare(`UPDATE events SET metadata = 'enc:v1:broken' WHERE site_id = 'corrupt'`).run();
  raw.close();

  const reopened = createDatabase({ dbPath: fixture.dbPath });
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const submissions = reopened.listSubmissions();
    assert.equal(submissions.length, 2);
    assert.deepEqual(submissions.find((row) => row.site_id === 'corrupt').payload, {});
    assert.equal(submissions.find((row) => row.site_id === 'valid').payload.email, 'valid@example.com');
    const events = reopened.listEvents();
    assert.equal(events.length, 2);
    assert.deepEqual(events.find((row) => row.site_id === 'corrupt').metadata, {});
    assert.equal(events.find((row) => row.site_id === 'valid').metadata.trigger, 'idle');
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((warning) => /submissions decrypt_error count=1/.test(warning)));
    assert.ok(warnings.some((warning) => /events decrypt_error count=1/.test(warning)));
    assert.ok(warnings.every((warning) => !/corrupt@example\.com|enc:v1/.test(warning)));
  } finally {
    console.warn = previousWarn;
    reopened.close();
    fixture.cleanup();
  }
});

test('database startup fails clearly when the encryption key is missing or invalid', () => {
  const previous = process.env.RUECKHOL_DATA_KEY;
  try {
    delete process.env.RUECKHOL_DATA_KEY;
    assert.throws(
      () => createDatabase({ dbPath: ':memory:' }),
      /RUECKHOL_DATA_KEY is required/,
    );
    process.env.RUECKHOL_DATA_KEY = 'not-a-32-byte-base64-key';
    assert.throws(
      () => createDatabase({ dbPath: ':memory:' }),
      /canonical base64 encoding of exactly 32 bytes/,
    );
  } finally {
    if (previous === undefined) delete process.env.RUECKHOL_DATA_KEY;
    else process.env.RUECKHOL_DATA_KEY = previous;
  }
});

test('migration encrypts legacy rows in place and remains readable', () => {
  useFreshKey();
  const fixture = tempDatabase();
  const initialized = createDatabase({ dbPath: fixture.dbPath });
  initialized.close();

  const raw = new Database(fixture.dbPath);
  try {
    raw.prepare(`
      INSERT INTO submissions (site_id, campaign_id, kind, payload, created_at)
      VALUES ('legacy', '', 'contact', @payload, '2026-07-29T10:00:00.000Z')
    `).run({ payload: JSON.stringify({ email: 'migrate@example.com', message: 'Secret' }) });
    raw.prepare(`
      INSERT INTO events (site_id, campaign_id, type, metadata, created_at)
      VALUES ('legacy', '', 'contact_submit', @metadata, '2026-07-29T10:00:00.000Z')
    `).run({ metadata: JSON.stringify({ email: 'migrate@example.com' }) });
  } finally {
    raw.close();
  }

  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, '..', 'scripts', 'encrypt-existing-data.js'), fixture.dbPath],
    { encoding: 'utf8', env: process.env },
  );
  assert.match(output, /Encrypted 1 submission payload\(s\) and 1 event metadata row\(s\)/);

  const migratedRaw = new Database(fixture.dbPath);
  let migratedPayload;
  let migratedMetadata;
  try {
    migratedPayload = migratedRaw.prepare('SELECT payload FROM submissions').get().payload;
    migratedMetadata = migratedRaw.prepare('SELECT metadata FROM events').get().metadata;
    assert.ok(migratedPayload.startsWith(PREFIX));
    assert.ok(migratedMetadata.startsWith(PREFIX));
  } finally {
    migratedRaw.close();
  }

  const encryption = createDataEncryption();
  assert.throws(
    () => encryption.decryptJson(migratedPayload, 'submissions.payload', 'other-site'),
    /Cannot decrypt submissions\.payload/,
  );
  assert.throws(
    () => encryption.decryptJson(migratedMetadata, 'events.metadata', 'other-site'),
    /Cannot decrypt events\.metadata/,
  );

  const secondOutput = execFileSync(
    process.execPath,
    [path.join(__dirname, '..', 'scripts', 'encrypt-existing-data.js'), fixture.dbPath],
    { encoding: 'utf8', env: process.env },
  );
  assert.match(secondOutput, /Encrypted 0 submission payload\(s\) and 0 event metadata row\(s\)/);

  const db = createDatabase({ dbPath: fixture.dbPath });
  try {
    assert.equal(db.listSubmissions('legacy')[0].payload.email, 'migrate@example.com');
    assert.equal(db.listEvents('legacy')[0].metadata.email, 'migrate@example.com');
  } finally {
    db.close();
    fixture.cleanup();
  }
});
