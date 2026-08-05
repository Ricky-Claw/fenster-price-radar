const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/index');

function context(siteOrigins, fetch) {
  return createApp({ dbPath: ':memory:', adminToken: 'test-token', siteOrigins, fetch, warnOnOpenAdmin: false });
}
function check(ctx, siteId) {
  return ctx.app.inject({ method: 'GET', url: `/api/install-check?siteId=${encodeURIComponent(siteId)}`, headers: { authorization: 'Bearer test-token' } });
}
function response(html) { return streamResponse([new TextEncoder().encode(html)]); }
function streamResponse(chunks, status = 200) {
  let index = 0;
  return { ok: status >= 200 && status < 300, status, body: { getReader: () => ({
    read: async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true },
    cancel: async () => {}, releaseLock: () => {},
  }) } };
}

test('install check requires dashboard auth', async () => {
  const ctx = context({ demo: ['https://example.test'] }, async () => response(''));
  try { assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/install-check?siteId=demo' })).status, 401); } finally { ctx.close(); }
});

test('no configured origins is a valid empty result', async () => {
  const ctx = context({}, async () => { throw new Error('must not fetch'); });
  try { const res = await check(ctx, 'unknown'); assert.equal(res.status, 200); assert.deepEqual(res.json().geprueft, []); } finally { ctx.close(); }
});

test('finds the snippet independent of attribute order and returns src', async () => {
  let requested;
  const ctx = context({ demo: ['https://kunde.test'] }, async (url) => { requested = String(url); return response('<script data-cre-site="demo" src="/assets/cre.js?v=2"></script>'); });
  try { const result = (await check(ctx, 'demo')).json(); assert.equal(requested, 'https://kunde.test/'); assert.equal(result.geprueft[0].gefunden, true); assert.equal(result.geprueft[0].scriptSrc, '/assets/cre.js?v=2'); } finally { ctx.close(); }
});

test('reports missing snippets and skips http origins', async () => {
  let calls = 0;
  const ctx = context({ demo: ['http://insecure.test', 'https://kunde.test'] }, async () => { calls++; return response('<html>leer</html>'); });
  try { const result = (await check(ctx, 'demo')).json(); assert.equal(calls, 1); assert.equal(result.geprueft[0].fehler.startsWith('Übersprungen'), true); assert.equal(result.geprueft[1].gefunden, false); } finally { ctx.close(); }
});

test('contains network errors while checking other origins', async () => {
  const ctx = context({ demo: ['https://bad.test', 'https://good.test'] }, async (url) => { if (String(url).includes('bad')) throw new Error('offline'); return response('<script src="cre.js" data-cre-site="demo">'); });
  try { const results = (await check(ctx, 'demo')).json().geprueft; assert.match(results[0].fehler, /offline/); assert.equal(results[1].gefunden, true); } finally { ctx.close(); }
});

test('rejects an oversized response without crashing', async () => {
  const ctx = context({ demo: ['https://large.test'] }, async () => streamResponse([new Uint8Array(2 * 1024 * 1024 + 1)]));
  try { const result = (await check(ctx, 'demo')).json().geprueft[0]; assert.equal(result.gefunden, false); assert.match(result.fehler, /2 MB/); } finally { ctx.close(); }
});

test('does not follow redirects', async () => {
  let options;
  const ctx = context({ demo: ['https://redirect.test'] }, async (_url, receivedOptions) => { options = receivedOptions; return streamResponse([], 302); });
  try { const result = (await check(ctx, 'demo')).json().geprueft[0]; assert.equal(options.redirect, 'manual'); assert.equal(result.gefunden, false); assert.match(result.fehler, /Weiterleitung/); } finally { ctx.close(); }
});

test('ignores scripts in comments and non-matching script names', async () => {
  const html = '<!-- <script src="/cre.js" data-cre-site="demo"></script> --><script src="https://x/notcre.js" data-cre-site="demo"></script>';
  const ctx = context({ demo: ['https://kunde.test'] }, async () => response(html));
  try { assert.equal((await check(ctx, 'demo')).json().geprueft[0].gefunden, false); } finally { ctx.close(); }
});

test('finds unquoted attributes', async () => {
  const ctx = context({ demo: ['https://kunde.test'] }, async () => response('<script src=/cre.js data-cre-site=demo>'));
  try { assert.equal((await check(ctx, 'demo')).json().geprueft[0].gefunden, true); } finally { ctx.close(); }
});

test('rate limits install checks', async () => {
  const ctx = context({ demo: ['https://kunde.test'] }, async () => response(''));
  try {
    for (let i = 0; i < 10; i++) assert.equal((await check(ctx, 'demo')).status, 200);
    const result = await check(ctx, 'demo');
    assert.equal(result.status, 429);
    assert.match(result.json().error, /Zu viele/);
  } finally { ctx.close(); }
});

test('never fetches a caller supplied URL', async () => {
  const calls = [];
  const ctx = context({ demo: ['https://configured.test'] }, async (url) => { calls.push(String(url)); return response(''); });
  try { await ctx.app.inject({ method: 'GET', url: '/api/install-check?siteId=http%3A%2F%2Fangreifer.example&url=https%3A%2F%2Fangreifer.example', headers: { authorization: 'Bearer test-token' } }); assert.deepEqual(calls, []); } finally { ctx.close(); }
});
