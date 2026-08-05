const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/index');

function rpc(method, params, id = 1) { return { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }; }
async function call(ctx, body, token = 'test-token') {
  return ctx.app.inject({ method: 'POST', url: '/api/mcp', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body });
}

test('MCP requires the admin token and exposes only popup tools', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    assert.equal((await ctx.app.inject({ method: 'POST', url: '/api/mcp', body: rpc('tools/list') })).status, 401);
    assert.equal((await call(ctx, rpc('tools/list'), 'wrong')).status, 401);
    const response = await call(ctx, rpc('tools/list'));
    assert.equal(response.status, 200);
    const names = response.json().result.tools.map(tool => tool.name);
    assert.deepEqual(names.sort(), ['popup_analytics', 'popup_create', 'popup_delete', 'popup_design', 'popup_list', 'popup_update'].sort());
  } finally { ctx.close(); }
});

test('MCP design preview is read-only and create writes a campaign', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const preview = await call(ctx, rpc('tools/call', { name: 'popup_design', arguments: { vorschau: true } }));
    assert.equal(preview.json().result.isError, undefined);
    const created = await call(ctx, rpc('tools/call', { name: 'popup_create', arguments: { campaign: { siteId: 'demo', name: 'MCP test', headline: 'Hallo', enabled: true } } }));
    assert.equal(created.json().result.isError, undefined);
    const id = JSON.parse(created.json().result.content[0].text).campaign.id;
    const before = (await ctx.app.inject({ method: 'GET', url: '/api/campaigns', headers: { authorization: 'Bearer test-token' } })).json().campaigns.find(c => c.id === id);
    assert.ok(before);
    const applied = await call(ctx, rpc('tools/call', { name: 'popup_design', arguments: { id, vorschau: true } }));
    assert.equal(applied.json().result.isError, undefined);
    const after = (await ctx.app.inject({ method: 'GET', url: '/api/campaigns', headers: { authorization: 'Bearer test-token' } })).json().campaigns.find(c => c.id === id);
    assert.deepEqual(after, before);
  } finally { ctx.close(); }
});

test('MCP design applies by id and rejects a mismatched site', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const a = await call(ctx, rpc('tools/call', { name: 'popup_create', arguments: { campaign: { siteId: 'a', name: 'A', enabled: true } } }));
    const b = await call(ctx, rpc('tools/call', { name: 'popup_create', arguments: { campaign: { siteId: 'b', name: 'B', enabled: true } } }));
    const idA = JSON.parse(a.json().result.content[0].text).campaign.id;
    const idB = JSON.parse(b.json().result.content[0].text).campaign.id;
    const beforeB = (await ctx.app.inject({ method: 'GET', url: '/api/campaigns', headers: { authorization: 'Bearer test-token' } })).json().campaigns.find(c => c.id === idB);
    const applied = await call(ctx, rpc('tools/call', { name: 'popup_design', arguments: { id: idA, variante: 'blau' } }));
    assert.deepEqual(JSON.parse(applied.json().result.content[0].text).angewendetAuf, [idA]);
    const mismatch = await call(ctx, rpc('tools/call', { name: 'popup_design', arguments: { id: idA, siteId: 'b' } }));
    assert.equal(mismatch.json().result.isError, true);
    const untouched = (await ctx.app.inject({ method: 'GET', url: '/api/campaigns', headers: { authorization: 'Bearer test-token' } })).json().campaigns.find(c => c.id === idB);
    assert.deepEqual(untouched, beforeB);
  } finally { ctx.close(); }
});

test('MCP create rejects an explicit id belonging to another site', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const created = await call(ctx, rpc('tools/call', { name: 'popup_create', arguments: { campaign: { id: 'mcp-fixed-id', siteId: 'site-a', name: 'Original', enabled: true } } }));
    assert.equal(created.json().result.isError, undefined);
    const rejected = await call(ctx, rpc('tools/call', { name: 'popup_create', arguments: { campaign: { id: 'mcp-fixed-id', siteId: 'site-b', name: 'Hijacked', enabled: false } } }));
    assert.equal(rejected.json().result.isError, true);
    const unchanged = (await ctx.app.inject({ method: 'GET', url: '/api/campaigns', headers: { authorization: 'Bearer test-token' } })).json().campaigns.find(c => c.id === 'mcp-fixed-id');
    assert.equal(unchanged.site_id, 'site-a');
    assert.equal(unchanged.name, 'Original');
    const sameSite = await call(ctx, rpc('tools/call', { name: 'popup_create', arguments: { campaign: { id: 'mcp-fixed-id', siteId: 'site-a', name: 'Updated', enabled: true } } }));
    assert.equal(sameSite.json().result.isError, undefined);
  } finally { ctx.close(); }
});

test('MCP rejects malformed campaign arguments with a JSON-RPC error', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const response = await call(ctx, rpc('tools/call', { name: 'popup_create', arguments: { siteId: 'x', name: 'wrong' } }));
    assert.equal(response.json().error.code, -32602);
  } finally { ctx.close(); }
});

test('MCP rejects blank design site ids', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const response = await call(ctx, rpc('tools/call', { name: 'popup_design', arguments: { siteId: '   ' } }));
    assert.equal(response.json().result.isError, true);
  } finally { ctx.close(); }
});

test('MCP rate-limits repeated failed authentication but not valid authentication', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const failed = [];
    for (let i = 0; i < 11; i += 1) {
      failed.push(await call(ctx, rpc('tools/list'), 'wrong'));
    }
    assert.ok(failed.some(response => response.status === 429));
    assert.equal((await call(ctx, rpc('tools/list'))).status, 200);
  } finally { ctx.close(); }
});

test('MCP rejects a non-string popup_delete id with a JSON-RPC error', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const response = await call(ctx, rpc('tools/call', { name: 'popup_delete', arguments: { id: 123 } }));
    assert.equal(response.json().error.code, -32602);
  } finally { ctx.close(); }
});

test('MCP popup_list includes theme presets', async () => {
  const ctx = createApp({ dbPath: ':memory:', adminToken: 'test-token', warnOnOpenAdmin: false });
  try {
    const response = await call(ctx, rpc('tools/call', { name: 'popup_list', arguments: {} }));
    const payload = JSON.parse(response.json().result.content[0].text);
    assert.ok(Array.isArray(payload.themePresets) && payload.themePresets.length > 0);
  } finally { ctx.close(); }
});
