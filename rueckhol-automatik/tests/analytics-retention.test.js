const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDatabase } = require('../server/db');
const { createApp } = require('../server/index');
const { sanitizeEventInput } = require('../server/lib/sanitize');
const { secret } = require('../server/lib/auth');
const crypto = require('node:crypto');
const { backupDatabase } = require('../server/lib/backup');

test('event retention is age based and ignores volume', () => {
  const db = createDatabase({ dbPath: ':memory:', eventRetentionDays: 2 });
  const old = new Date(Date.now() - 3 * 86400000).toISOString();
  const recent = new Date(Date.now() - 86400000).toISOString();
  db.insertEvent({ site_id: 's', campaign_id: 'c', type: 'popup_shown', created_at: old });
  db.insertEvent({ site_id: 's', campaign_id: 'c', type: 'cta_click', created_at: recent });
  for (let i = 0; i < 100; i++) db.insertEvent({ site_id: 's', campaign_id: 'c', type: 'close', created_at: new Date().toISOString() });
  const events = db.listEvents('s');
  assert.equal(events.some((event) => event.created_at === old), false);
  assert.equal(events.some((event) => event.created_at === recent), true);
  db.close();
});

test('event types are whitelisted', () => {
  assert.equal(sanitizeEventInput({ type: 'popup_shown' }).type, 'popup_shown');
  assert.equal(sanitizeEventInput({ type: 'forged_event' }).type, null);
});

test('event created_at is always assigned by the server', () => {
  const before = Date.now();
  const event = sanitizeEventInput({ type: 'popup_shown', created_at: '9999-12-31T00:00:00.000Z' });
  assert.notEqual(event.created_at, '9999-12-31T00:00:00.000Z');
  assert.ok(Math.abs(Date.parse(event.created_at) - before) < 5000);
});

test('event limit is per site and minimum configuration is safe', () => {
  const db = createDatabase({ dbPath: ':memory:', eventLimit: 2, eventRetentionDays: 0 });
  for (let i = 0; i < 3; i++) db.insertEvent({ site_id: 'a', type: 'close', created_at: new Date(Date.now() + i).toISOString() });
  db.insertEvent({ site_id: 'b', type: 'close', created_at: new Date().toISOString() });
  assert.equal(db.listEvents('a').length, 2);
  assert.equal(db.listEvents('b').length, 1);
  db.close();
});

test('event site ids are case insensitive for retention quotas', () => {
  const db = createDatabase({ dbPath: ':memory:', eventLimit: 2, eventRetentionDays: 0 });
  db.insertEvent(sanitizeEventInput({ siteId: ' demo ', type: 'close' }));
  db.insertEvent(sanitizeEventInput({ siteId: 'DEMO', type: 'close' }));
  db.insertEvent(sanitizeEventInput({ siteId: 'demo', type: 'close' }));
  assert.equal(db.listEvents('demo').length, 2);
  assert.equal(db.listEvents('DEMO').length, 0);
  db.close();
});

test('submission retention purges old rows and limits each site independently', () => {
  const db = createDatabase({ dbPath: ':memory:', eventLimit: 2, eventRetentionDays: 2 });
  const old = new Date(Date.now() - 3 * 86400000).toISOString();
  db.insertSubmission({ site_id: 'a', campaign_id: 'c', kind: 'lead', payload: {}, created_at: old });
  db.insertSubmission({ site_id: 'a', campaign_id: 'c', kind: 'lead', payload: {}, created_at: new Date().toISOString() });
  db.insertSubmission({ site_id: 'a', campaign_id: 'c', kind: 'lead', payload: {}, created_at: new Date(Date.now() + 1).toISOString() });
  db.insertSubmission({ site_id: 'a', campaign_id: 'c', kind: 'lead', payload: {}, created_at: new Date(Date.now() + 2).toISOString() });
  db.insertSubmission({ site_id: 'b', campaign_id: 'c', kind: 'lead', payload: {}, created_at: new Date().toISOString() });
  assert.equal(db.listSubmissions('a').length, 2);
  assert.equal(db.listSubmissions('a').some((submission) => submission.created_at === old), false);
  assert.equal(db.listSubmissions('b').length, 1);
  db.close();
});

test('backup still runs when the database checkpoint fails', async () => {
  let backupCalls = 0;
  const db = { checkpoint() { throw new Error('checkpoint failed'); }, close() {} };
  const ctx = createApp({
    db,
    dbPath: '/tmp/analytics-retention-test.sqlite',
    backupDir: '/tmp/analytics-retention-test-backups',
    backupDatabase: async () => { backupCalls += 1; return { ok: true }; },
    warnOnOpenAdmin: false,
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(backupCalls, 1);
  } finally {
    ctx.close();
  }
});

test('configured event token accepts today and yesterday only', async () => {
  const previous = { password: process.env.FENSTER_RADAR_PASSWORD, secret: process.env.FENSTER_RADAR_AUTH_SECRET };
  process.env.FENSTER_RADAR_PASSWORD = 'test-password';
  process.env.FENSTER_RADAR_AUTH_SECRET = 'test-secret';
  const ctx = createApp({ dbPath: ':memory:', disableBackupSchedule: true, warnOnOpenAdmin: false });
  try {
    const siteId = 'token-site';
    const config = await ctx.app.inject({ method: 'GET', url: `/api/config?siteId=${siteId}` });
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const post = (eventToken) => ctx.app.inject({ method: 'POST', url: '/api/events', headers: { 'content-type': 'application/json' }, body: { siteId, type: 'popup_shown', eventToken } });
    assert.equal((await post(undefined)).status, 401);
    assert.equal((await post(config.json().eventToken)).status, 200);
    const eventKey = crypto.createHmac('sha256', secret()).update('rueckhol-event-token-v1').digest();
    const yesterdayToken = crypto.createHmac('sha256', eventKey).update(`evt.${siteId}.${yesterday}`).digest('base64url');
    assert.equal((await post(yesterdayToken)).status, 200);
    assert.equal((await post('tampered')).status, 401);
    const sessionKeyToken = crypto.createHmac('sha256', secret()).update(`evt.${siteId}.${today}`).digest('base64url');
    assert.notEqual(config.json().eventToken, sessionKeyToken);
  } finally {
    ctx.close();
    if (previous.password === undefined) delete process.env.FENSTER_RADAR_PASSWORD; else process.env.FENSTER_RADAR_PASSWORD = previous.password;
    if (previous.secret === undefined) delete process.env.FENSTER_RADAR_AUTH_SECRET; else process.env.FENSTER_RADAR_AUTH_SECRET = previous.secret;
  }
});

test('submit endpoint requires the event token', async () => {
  const previous = { password: process.env.FENSTER_RADAR_PASSWORD, secret: process.env.FENSTER_RADAR_AUTH_SECRET };
  process.env.FENSTER_RADAR_PASSWORD = 'test-password';
  process.env.FENSTER_RADAR_AUTH_SECRET = 'test-secret';
  const ctx = createApp({ dbPath: ':memory:', disableBackupSchedule: true, warnOnOpenAdmin: false });
  try {
    const siteId = 'submit-token-site';
    const config = await ctx.app.inject({ method: 'GET', url: `/api/config?siteId=${siteId}` });
    const body = { siteId, kind: 'newsletter', eventToken: config.json().eventToken, payload: { email: 'test@example.com', consent: true } };
    const request = (requestBody) => ctx.app.inject({ method: 'POST', url: '/api/submit', headers: { 'content-type': 'application/json' }, body: requestBody });
    assert.equal((await request({ ...body, eventToken: undefined })).status, 401);
    assert.equal((await request({ ...body, eventToken: 'wrong' })).status, 401);
    assert.equal((await request(body)).status, 200);
  } finally {
    ctx.close();
    if (previous.password === undefined) delete process.env.FENSTER_RADAR_PASSWORD; else process.env.FENSTER_RADAR_PASSWORD = previous.password;
    if (previous.secret === undefined) delete process.env.FENSTER_RADAR_AUTH_SECRET; else process.env.FENSTER_RADAR_AUTH_SECRET = previous.secret;
  }
});

test('backup creates and rotates files, copy errors are reported', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'conversion-rescue-backup-'));
  const dbPath = path.join(dir, 'source.sqlite');
  await fs.writeFile(dbPath, 'sqlite');
  const result = await backupDatabase({ dbPath, backupDir: path.join(dir, 'backups'), keep: 1 });
  assert.equal(result.ok, true);
  assert.match(path.basename(result.path), /^conversion-rescue-\d{4}-\d{2}-\d{2}\.sqlite$/);
  assert.equal((await fs.readdir(path.join(dir, 'backups'))).length, 1);
  const failed = await backupDatabase({ dbPath: path.join(dir, 'missing.sqlite'), backupDir: path.join(dir, 'backups') });
  assert.equal(failed.ok, false);
});
