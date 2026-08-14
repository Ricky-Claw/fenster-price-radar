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

test('forwardContactLead includes mailTo only when configured and returns its request promise', async () => {
  const bodies = [];
  const fetchImpl = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; };
  const input = { email: 'max@example.com', siteId: 'demo', submissionId: 1, createdAt: '2026-08-11T12:00:00.000Z' };
  const config = { baseUrl: 'https://schwarzwald-agent.de', token: 'secret', island: 'rueckhol' };
  const response = await forwardContactLead({ ...input, mailTo: 'crm@example.com' }, config, fetchImpl);
  await forwardContactLead(input, config, fetchImpl);
  assert.equal(response.ok, true);
  assert.equal(bodies[0].mailTo, 'crm@example.com');
  assert.equal(Object.hasOwn(bodies[1], 'mailTo'), false);
});

test('forwardContactLead includes campaign name and page only when provided', async () => {
  const bodies = [];
  const fetchImpl = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true }; };
  const input = { name: 'Max', email: 'max@example.com', siteId: 'demo', submissionId: 1, createdAt: '2026-08-11T12:00:00.000Z' };
  const config = { baseUrl: 'https://schwarzwald-agent.de', token: 'secret', island: 'rueckhol' };
  await forwardContactLead({ ...input, campaignName: 'Rückruf beim Verlassen', page: 'https://deutscher-fenstershop.de/foerdermittel-check' }, config, fetchImpl);
  await forwardContactLead(input, config, fetchImpl);
  assert.deepEqual(bodies[0].lead, { campaignName: 'Rückruf beim Verlassen' });
  assert.equal(bodies[0].source.page, 'https://deutscher-fenstershop.de/foerdermittel-check');
  assert.equal(Object.hasOwn(bodies[1], 'lead'), false);
  assert.equal(Object.hasOwn(bodies[1].source, 'page'), false);
});

test('forwardContactLead maps the first phone extra and appends remaining extras to the message', async () => {
  const bodies = [];
  const fetchImpl = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true }; };
  const input = { name: 'Max', email: 'max@example.com', message: 'Bitte melden', siteId: 'demo', submissionId: 1, createdAt: '2026-08-11T12:00:00.000Z' };
  const config = { baseUrl: 'https://schwarzwald-agent.de', token: 'secret', island: 'rueckhol' };
  await forwardContactLead({ ...input, extras: [
    { label: 'Direkter Kontakt', value: '+49 123', type: 'tel' },
    { label: 'Fensteranzahl', value: '7', type: 'number' },
    { label: 'Mobil alternativ', value: '+49 456', type: 'tel' },
  ] }, config, fetchImpl);
  assert.equal(bodies[0].contact.phone, '+49 123');
  assert.equal(bodies[0].message, 'Bitte melden\n\nFensteranzahl: 7\nMobil alternativ: +49 456');
});

test('forwardContactLead keeps its request body unchanged when extras are absent', async () => {
  const bodies = [];
  const fetchImpl = async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true }; };
  const input = { name: 'Max', email: 'max@example.com', message: 'Hallo', siteId: 'demo', submissionId: 1, createdAt: '2026-08-11T12:00:00.000Z' };
  const config = { baseUrl: 'https://schwarzwald-agent.de', token: 'secret', island: 'rueckhol' };
  await forwardContactLead(input, config, fetchImpl);
  await forwardContactLead({ ...input, extras: [] }, config, fetchImpl);
  assert.deepEqual(bodies[1], bodies[0]);
});

test('manual CRM resend requires auth, reports missing leads and config, and reuses the original lead id', async () => {
  const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  const unconfigured = createApp({ dbPath: ':memory:', adminToken: 'test-token', fetch: async () => { throw new Error('must not fetch'); }, warnOnOpenAdmin: false });
  try {
    await submit(unconfigured, 'contact', { email: 'lead@example.com' });
    const lead = (await unconfigured.app.inject({ method: 'GET', url: '/api/submissions?site=demo', headers })).json().submissions[0];
    assert.equal((await unconfigured.app.inject({ method: 'POST', url: '/api/leads/resend', body: { site: 'demo', id: lead.id } })).status, 401);
    assert.equal((await unconfigured.app.inject({ method: 'POST', url: '/api/leads/resend', headers, body: { site: 'demo', id: 9999 } })).status, 404);
    const unavailable = await unconfigured.app.inject({ method: 'POST', url: '/api/leads/resend', headers, body: { site: 'demo', id: lead.id } });
    assert.equal(unavailable.status, 503);
    assert.match(unavailable.json().error, /nicht eingerichtet/);
  } finally { unconfigured.close(); }

  const bodies = [];
  const configured = createApp({
    dbPath: ':memory:', adminToken: 'test-token',
    schwarzwaldBaseUrl: 'https://schwarzwald-agent.de', schwarzwaldArchipelToken: 'secret',
    fetch: async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; },
    warnOnOpenAdmin: false,
  });
  try {
    await configured.app.inject({ method: 'PUT', url: '/api/site-settings', headers, body: { siteId: 'demo', leadMailTo: 'crm@example.com' } });
    await submit(configured, 'contact', { name: 'Max', email: 'max@example.com', message: 'Hallo' });
    const lead = (await configured.app.inject({ method: 'GET', url: '/api/submissions?site=demo', headers })).json().submissions[0];
    const resent = await configured.app.inject({ method: 'POST', url: '/api/leads/resend', headers, body: { site: 'demo', id: lead.id } });
    assert.equal(resent.status, 200);
    assert.deepEqual(resent.json(), { ok: true });
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].id, bodies[0].id);
    assert.equal(bodies[1].mailTo, 'crm@example.com');
  } finally { configured.close(); }
});

test('manual CRM resend includes the campaign name and page like the original submit', async () => {
  const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  const bodies = [];
  const ctx = createApp({
    dbPath: ':memory:', adminToken: 'test-token',
    schwarzwaldBaseUrl: 'https://schwarzwald-agent.de', schwarzwaldArchipelToken: 'secret',
    fetch: async (_url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; },
    warnOnOpenAdmin: false,
  });
  try {
    await ctx.app.inject({
      method: 'POST', url: '/api/campaigns', headers,
      body: { id: 'welcome', site_id: 'demo', name: 'Willkommens-Popup', action_type: 'contact', trigger: 'manual' },
    });
    await ctx.app.inject({
      method: 'POST', url: '/api/submit', headers: { 'content-type': 'application/json' },
      body: { siteId: 'demo', campaignId: 'welcome', kind: 'contact', page: 'https://example.com/seite', payload: { consent: true, email: 'max@example.com' } },
    });
    const lead = (await ctx.app.inject({ method: 'GET', url: '/api/submissions?site=demo', headers })).json().submissions[0];
    await ctx.app.inject({ method: 'POST', url: '/api/leads/resend', headers, body: { site: 'demo', id: lead.id } });
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].lead.campaignName, 'Willkommens-Popup');
    assert.equal(bodies[1].source.page, 'https://example.com/seite');
  } finally { ctx.close(); }
});

test('deleting a lead removes it, cleans up its attachment, and is site-scoped', async () => {
  const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', fetch: async () => ({ ok: true }), warnOnOpenAdmin: false });
  try {
    await submit(ctx, 'contact', { email: 'lead@example.com' }, 'demo');
    const lead = (await ctx.app.inject({ method: 'GET', url: '/api/submissions?site=demo', headers })).json().submissions[0];

    assert.equal((await ctx.app.inject({ method: 'DELETE', url: '/api/leads?site=demo&id=' + lead.id })).status, 401);
    assert.equal((await ctx.app.inject({ method: 'DELETE', url: '/api/leads?site=demo&id=9999', headers })).status, 404);
    assert.equal((await ctx.app.inject({ method: 'DELETE', url: '/api/leads?site=kunde1&id=' + lead.id, headers })).status, 404);

    const deleted = await ctx.app.inject({ method: 'DELETE', url: '/api/leads?site=demo&id=' + lead.id, headers });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.json(), { ok: true });

    const remaining = (await ctx.app.inject({ method: 'GET', url: '/api/submissions?site=demo', headers })).json().submissions;
    assert.equal(remaining.length, 0);
  } finally { ctx.close(); }
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
