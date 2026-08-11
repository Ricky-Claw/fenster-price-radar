const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/index');
const { forwardContactLead } = require('../server/lib/forward');

function submit(ctx, kind, payload, siteId = 'demo') {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/submit',
    headers: { 'content-type': 'application/json' },
    body: { siteId, kind, payload: { consent: true, ...payload } },
  });
}

test('forwardContactLead includes attachments only when provided', async () => {
  const bodies = [];
  const fetchImpl = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true }; };
  const input = { name: 'Max', email: 'max@example.com', siteId: 'demo', submissionId: 1, createdAt: '2026-08-11T12:00:00.000Z' };
  const config = { baseUrl: 'https://schwarzwald-agent.de', token: 'secret', island: 'rueckhol', category: 'fenster' };
  const attachments = [{ filename: 'liste.pdf', mime: 'application/pdf', size: 12, sha256: 'abc', url: 'https://example.test/api/uploads?id=abcdefghijklmnopqrstuvwxyz123456' }];
  forwardContactLead({ ...input, attachments }, config, fetchImpl);
  forwardContactLead(input, config, fetchImpl);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(bodies[0].attachments, attachments);
  assert.equal(Object.hasOwn(bodies[1], 'attachments'), false);
});

test('forwards newsletter submissions', async () => {
  const calls = [];
  const ctx = createApp({ dbPath: ':memory:', schwarzwaldBaseUrl: 'https://schwarzwald-agent.de/', schwarzwaldNlListId: 'list-1', fetch: async (url, opts) => { calls.push({ url: String(url), opts }); return { ok: true }; }, warnOnOpenAdmin: false });
  try {
    assert.equal((await submit(ctx, 'newsletter', { email: 'news@example.com' })).status, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://schwarzwald-agent.de/api/nl/subscribe');
    assert.deepEqual(JSON.parse(calls[0].opts.body), { listId: 'list-1', email: 'news@example.com', name: '' });
  } finally { ctx.close(); }
});

test('forwards contact submissions with Archipel contract and stable distinct IDs', async () => {
  const bodies = [];
  const ctx = createApp({ dbPath: ':memory:', schwarzwaldBaseUrl: 'https://schwarzwald-agent.de', schwarzwaldArchipelToken: 'secret', fetch: async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true }; }, warnOnOpenAdmin: false });
  try {
    assert.equal((await submit(ctx, 'contact', { name: 'Max', email: 'max@example.com', message: 'Hallo' })).status, 200);
    assert.equal((await submit(ctx, 'contact', { name: 'Mia', email: 'mia@example.com' })).status, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].schema, 'archipel.lead/v1');
    assert.equal(bodies[0].consent.given, true);
    assert.equal(bodies[0].contact.email, 'max@example.com');
    assert.ok(bodies[0].id);
    assert.notEqual(bodies[0].id, bodies[1].id);
  } finally { ctx.close(); }
});

test('dedicated Rueckhol token takes precedence without replacing the legacy token', async () => {
  const previousDedicated = process.env.RUECKHOL_AUTOMATIK_LEAD_TOKEN;
  const previousLegacy = process.env.SCHWARZWALD_ARCHIPEL_TOKEN;
  process.env.RUECKHOL_AUTOMATIK_LEAD_TOKEN = 'dedicated-secret';
  process.env.SCHWARZWALD_ARCHIPEL_TOKEN = 'legacy-secret';
  let authorization = '';
  const ctx = createApp({
    dbPath: ':memory:',
    schwarzwaldBaseUrl: 'https://schwarzwald-agent.de',
    fetch: async (_url, opts) => {
      authorization = opts.headers.authorization;
      return { ok: true };
    },
    warnOnOpenAdmin: false,
  });
  try {
    assert.equal((await submit(ctx, 'contact', { email: 'contact@example.com' })).status, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(authorization, 'Bearer dedicated-secret');
  } finally {
    ctx.close();
    if (previousDedicated === undefined) delete process.env.RUECKHOL_AUTOMATIK_LEAD_TOKEN;
    else process.env.RUECKHOL_AUTOMATIK_LEAD_TOKEN = previousDedicated;
    if (previousLegacy === undefined) delete process.env.SCHWARZWALD_ARCHIPEL_TOKEN;
    else process.env.SCHWARZWALD_ARCHIPEL_TOKEN = previousLegacy;
  }
});

test('does not fetch when forwarding is unconfigured and still succeeds', async () => {
  const ctx = createApp({ dbPath: ':memory:', fetch: async () => { throw new Error('must not fetch'); }, warnOnOpenAdmin: false });
  try {
    assert.deepEqual((await submit(ctx, 'newsletter', { email: 'news@example.com' })).json(), { ok: true });
    assert.deepEqual((await submit(ctx, 'contact', { email: 'contact@example.com' })).json(), { ok: true });
  } finally { ctx.close(); }
});

test('forwarding failures do not affect submit response', async () => {
  const ctx = createApp({ dbPath: ':memory:', schwarzwaldBaseUrl: 'https://schwarzwald-agent.de', schwarzwaldNlListId: 'list-1', fetch: async () => { throw new Error('offline'); }, warnOnOpenAdmin: false });
  try {
    assert.deepEqual((await submit(ctx, 'newsletter', { email: 'news@example.com' })).json(), { ok: true });
    await new Promise((resolve) => setImmediate(resolve));
  } finally { ctx.close(); }
});

test('logs newsletter forwarding HTTP failures without affecting submit response', async () => {
  const warn = mock.method(console, 'warn');
  const ctx = createApp({ dbPath: ':memory:', schwarzwaldBaseUrl: 'https://schwarzwald-agent.de', schwarzwaldNlListId: 'list-1', fetch: async () => ({ ok: false, status: 403, text: async () => '{"error":"ISLAND_MISMATCH"}' }), warnOnOpenAdmin: false });
  try {
    assert.deepEqual((await submit(ctx, 'newsletter', { email: 'news@example.com' })).json(), { ok: true });
    await new Promise((resolve) => setImmediate(resolve));
    const forwardingWarning = warn.mock.calls.find((call) => call.arguments[0].includes('Newsletter-Weiterleitung'));
    assert.ok(forwardingWarning);
    assert.match(forwardingWarning.arguments[0], /fehlgeschlagen/);
    assert.match(forwardingWarning.arguments[0], /403/);
  } finally { ctx.close(); warn.mock.restore(); }
});

test('logs contact lead forwarding HTTP failures without affecting submit response', async () => {
  const warn = mock.method(console, 'warn');
  const ctx = createApp({ dbPath: ':memory:', schwarzwaldBaseUrl: 'https://schwarzwald-agent.de', schwarzwaldArchipelToken: 'secret', fetch: async () => ({ ok: false, status: 403, text: async () => '{"error":"ISLAND_MISMATCH"}' }), warnOnOpenAdmin: false });
  try {
    assert.deepEqual((await submit(ctx, 'contact', { email: 'contact@example.com' })).json(), { ok: true });
    await new Promise((resolve) => setImmediate(resolve));
    const forwardingWarning = warn.mock.calls.find((call) => call.arguments[0].includes('Lead-Weiterleitung'));
    assert.ok(forwardingWarning);
    assert.match(forwardingWarning.arguments[0], /fehlgeschlagen/);
    assert.match(forwardingWarning.arguments[0], /403/);
  } finally { ctx.close(); warn.mock.restore(); }
});
