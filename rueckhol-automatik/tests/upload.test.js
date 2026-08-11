const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createApp } = require('../server/index');
const { createDatabase } = require('../server/db');
const { createUploadStore, sniffMime } = require('../server/lib/uploads');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const content = Buffer.from(value);
    const compressed = zlib.deflateRawSync(content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function minimalXlsx(extraEntries = {}, contentTypesExtra = '') {
  return zip({
    '[Content_Types].xml': `<Types><Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentTypesExtra}</Types>`,
    'xl/workbook.xml': '<workbook/>',
    ...extraEntries,
  });
}

function testContext(options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckhol-upload-'));
  const ctx = createApp({
    dbPath: ':memory:',
    uploadsDir: path.join(tempDir, 'uploads'),
    adminToken: '',
    warnOnOpenAdmin: false,
    ...options,
  });
  return {
    ...ctx,
    cleanup() {
      ctx.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

async function eventToken(ctx, site = 'demo') {
  const response = await ctx.app.inject({ method: 'GET', url: `/api/config?siteId=${encodeURIComponent(site)}` });
  return response.json().eventToken;
}

function upload(ctx, { site = 'demo', token, name = 'fenster.pdf', body = Buffer.from('%PDF-1.7\n') } = {}) {
  const query = new URLSearchParams({ site, name });
  if (token !== undefined && token !== null) query.set('token', token);
  return ctx.app.inject({
    method: 'POST',
    url: `/api/upload?${query}`,
    headers: { 'content-type': 'application/octet-stream' },
    body,
  });
}

test('accepts a PDF upload with a valid event token and serves it securely', async () => {
  const ctx = testContext();
  try {
    const token = await eventToken(ctx);
    const response = await upload(ctx, { token, name: 'Fensterliste Ü.pdf' });
    assert.equal(response.status, 200);
    assert.match(response.json().uploadId, /^[A-Za-z0-9_-]{20,64}$/);
    assert.equal(response.json().mime, 'application/pdf');

    const download = await ctx.app.inject({ method: 'GET', url: `/api/uploads?id=${response.json().uploadId}` });
    assert.equal(download.status, 200);
    assert.equal(download.headers['x-content-type-options'], 'nosniff');
    assert.match(download.headers['content-disposition'], /^attachment/);
  } finally { ctx.cleanup(); }
});

test('stores upload expiry about seven days in the future', async () => {
  const db = createDatabase({ dbPath: ':memory:' });
  const ctx = testContext({ db });
  try {
    const beforeUpload = Date.now();
    const response = await upload(ctx, { token: await eventToken(ctx) });
    const afterUpload = Date.now();
    assert.equal(response.status, 200);

    const stored = db.getUpload(response.json().uploadId);
    const expiresAt = new Date(stored.expires_at).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    assert.ok(expiresAt >= beforeUpload + sevenDaysMs);
    assert.ok(expiresAt <= afterUpload + sevenDaysMs);
  } finally { ctx.cleanup(); }
});

test('rejects SVG content even when the filename claims PNG', async () => {
  const ctx = testContext();
  try {
    const response = await upload(ctx, { token: await eventToken(ctx), name: 'bild.png', body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') });
    assert.equal(response.status, 415);
  } finally { ctx.cleanup(); }
});

test('rejects ZIP-based Office files containing macros', async () => {
  const ctx = testContext();
  try {
    const fakeXlsm = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('xl/workbook.xml[Content_Types].xmlapplication/vnd.openxmlformats-officedocument.spreadsheetml.sheetvbaProject.bin')]);
    const response = await upload(ctx, { token: await eventToken(ctx), name: 'liste.xlsx', body: fakeXlsm });
    assert.equal(response.status, 415);
  } finally { ctx.cleanup(); }
});

test('recognizes a real deflate-compressed minimal XLSX ZIP', () => {
  assert.equal(sniffMime(minimalXlsx()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});

test('rejects structurally valid XLSX ZIPs with macro indicators', () => {
  assert.equal(sniffMime(minimalXlsx({ 'xl/vbaProject.bin': 'macro' })), null);
  assert.equal(sniffMime(minimalXlsx({}, '<Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>')), null);
  assert.equal(sniffMime(minimalXlsx({}, '<Override ContentType="application/vnd.ms-office.vbaProject"/>')), null);
  assert.equal(sniffMime(minimalXlsx({ '_rels/.rels': '<Relationship Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject"/>' })), null);
});

test('rejects XLSX ZIPs exceeding entry or aggregate decoded limits', () => {
  const manyEntries = Object.fromEntries(Array.from({ length: 63 }, (_, index) => [`unused-${index}.xml`, 'x']));
  assert.equal(sniffMime(minimalXlsx(manyEntries)), null);

  const largeRelationship = 'x'.repeat(1400 * 1024);
  assert.equal(sniffMime(minimalXlsx({
    'xl/_rels/one.rels': largeRelationship,
    'xl/_rels/two.rels': largeRelationship,
    'xl/_rels/three.rels': largeRelationship,
  })), null);
});

test('binds the stored filename extension to the detected MIME', async () => {
  const ctx = testContext();
  try {
    const response = await upload(ctx, {
      token: await eventToken(ctx),
      name: 'rechnung.html',
      body: Buffer.from('kunde;summe\n<script>alert(1)</script>;100'),
    });
    assert.equal(response.status, 200);
    const download = await ctx.app.inject({ method: 'GET', url: `/api/uploads?id=${response.json().uploadId}` });
    assert.match(download.headers['content-disposition'], /rechnung\.csv/);
    assert.doesNotMatch(download.headers['content-disposition'], /rechnung\.html/);
  } finally { ctx.cleanup(); }
});

test('purging an expired upload removes its database row and stored file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rueckhol-upload-purge-'));
  const store = createUploadStore({ uploadsDir: path.join(tempDir, 'uploads') });
  const db = createDatabase({ dbPath: ':memory:', deleteUpload: store.deleteUpload });
  const id = 'abcdefghijklmnopqrstuvwxyz123456';
  try {
    store.writeUpload(id, Buffer.from('%PDF-1.7\n'));
    db.insertUpload({
      id,
      site_id: 'demo',
      mime: 'application/pdf',
      size: 9,
      sha256: 'hash',
      original_name: 'alt.pdf',
      created_at: '2020-01-01T00:00:00.000Z',
      expires_at: '2020-01-02T00:00:00.000Z',
    });
    assert.ok(db.getUpload(id));
    assert.equal(fs.existsSync(path.join(store.uploadsDir, id)), true);
    assert.deepEqual(db.purgeExpiredUploads(), [id]);
    assert.equal(db.getUpload(id), undefined);
    assert.equal(fs.existsSync(path.join(store.uploadsDir, id)), false);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('requires a valid event token when authentication is configured', async () => {
  const previousPassword = process.env.FENSTER_RADAR_PASSWORD;
  const previousSecret = process.env.FENSTER_RADAR_AUTH_SECRET;
  process.env.FENSTER_RADAR_PASSWORD = 'upload-test-password';
  process.env.FENSTER_RADAR_AUTH_SECRET = 'upload-test-secret';
  const ctx = testContext();
  try {
    assert.equal((await upload(ctx)).status, 401);
    assert.equal((await upload(ctx, { token: 'wrong' })).status, 401);
    assert.equal((await upload(ctx, { token: await eventToken(ctx) })).status, 200);
  } finally {
    ctx.cleanup();
    if (previousPassword === undefined) delete process.env.FENSTER_RADAR_PASSWORD; else process.env.FENSTER_RADAR_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.FENSTER_RADAR_AUTH_SECRET; else process.env.FENSTER_RADAR_AUTH_SECRET = previousSecret;
  }
});

test('aborts raw uploads above 10 MB with 413', async () => {
  const ctx = testContext();
  try {
    const body = Buffer.alloc(10 * 1024 * 1024 + 1, 0x41);
    body.write('%PDF');
    const response = await upload(ctx, { token: await eventToken(ctx), body });
    assert.equal(response.status, 413);
  } finally { ctx.cleanup(); }
});

test('rate limits the eleventh upload in one minute', async () => {
  const ctx = testContext();
  try {
    const token = await eventToken(ctx);
    for (let i = 0; i < 10; i++) assert.equal((await upload(ctx, { token, name: `${i}.pdf` })).status, 200);
    assert.equal((await upload(ctx, { token, name: '11.pdf' })).status, 429);
  } finally { ctx.cleanup(); }
});

test('download rejects traversal and unknown ids without reading arbitrary files', async () => {
  const ctx = testContext();
  try {
    const traversal = await ctx.app.inject({ method: 'GET', url: '/api/uploads?id=../../etc/passwd' });
    assert.ok([400, 404].includes(traversal.status));
    const unknown = await ctx.app.inject({ method: 'GET', url: '/api/uploads?id=abcdefghijklmnopqrstuvwxyz123456' });
    assert.equal(unknown.status, 404);
  } finally { ctx.cleanup(); }
});
