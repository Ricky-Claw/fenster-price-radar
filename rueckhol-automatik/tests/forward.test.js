const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/index');

function submit(ctx, kind, payload, siteId = 'demo') {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/submit',
    headers: { 'content-type': 'application/json' },
    body: { siteId, kind, payload: { consent: true, ...payload } },
  });
}

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
