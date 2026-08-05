import assert from 'node:assert/strict';
import pollHandler from '../api/meta-leadgen-poll.js';
import { forwardToSchwarzwald, mapLeadToDfsMetaBody, pollOnce } from '../src/leads/metaLeadgen.js';

function response() {
  return {
    statusCode: null,
    body: '',
    writeHead(status) { this.statusCode = status; },
    end(chunk = '') { this.body += chunk; return this; },
  };
}

async function poll(req) {
  const res = response();
  await pollHandler(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

const v3Body = mapLeadToDfsMetaBody({
  id: 'lead-v3',
  form_id: '1770519120792722',
  field_data: [
    { name: 'haben_sie_schon_eine_fensterliste_oder_einen_sanierungsplan', values: ['ja_liegt_vor'] },
    { name: 'anzahl_fenster', values: ['mehr_als_5'] },
  ],
}, 'Förderheld v3');
assert.equal(v3Body.hasFensterliste, 'Ja, liegt vor');
assert.equal(v3Body.windowCount, 'Mehr als 5 Fenster');
assert.equal(v3Body.formName, 'Formular 1');

const altBody = mapLeadToDfsMetaBody({
  id: 'lead-alt',
  form_id: '1767645384579656',
  field_data: [
    { name: 'haben_sie_schon_eine_fensterliste_oder_einen_sanierungsplan?', values: ['in_arbeit'] },
    { name: 'wie_viele_fenster_planen_sie_zu_tauschen?', values: ['1–5'] },
  ],
}, 'Altes Formular');
assert.equal(altBody.hasFensterliste, 'In Arbeit');
assert.equal(altBody.windowCount, '1–5');
assert.equal(altBody.formName, 'Formular 3 (alt)');

const altBodyOhneFragezeichen = mapLeadToDfsMetaBody({
  id: 'lead-alt-ohne-fragezeichen',
  field_data: [
    { name: 'wie_viele_fenster_planen_sie_zu_tauschen', values: ['3_5'] },
  ],
});
assert.equal(altBodyOhneFragezeichen.windowCount, '3–5 Fenster');

const missingBody = mapLeadToDfsMetaBody({ id: 'lead-leer', field_data: [] });
assert.equal(missingBody.formName, undefined);
assert.equal(missingBody.fullName, undefined);
assert.equal(missingBody.email, undefined);
assert.equal(missingBody.phone, undefined);
assert.equal(missingBody.postCode, undefined);
assert.equal(missingBody.hasFensterliste, undefined);
assert.equal(missingBody.windowCount, undefined);
assert.equal(missingBody.submittedAt, undefined);

const fallbackBody = mapLeadToDfsMetaBody({
  id: 'lead-fallback',
  field_data: [{ name: 'anzahl_fenster', values: ['irgend_was_neues'] }],
});
assert.equal(fallbackBody.windowCount, 'Irgend was neues');

{
  const now = Date.parse('2026-08-06T12:00:00.000Z');
  const result = await pollOnce({
    lookbackHours: 6,
    now: () => now,
    pageAccessTokenFn: async () => 'page-token',
    graphFn: async (path) => {
      if (path.endsWith('/leadgen_forms')) return { data: [
        { id: 'aktiv', status: 'ACTIVE' },
        { id: 'pausiert', status: 'PAUSED' },
      ] };
      return { data: [
        { id: 'neu', created_time: '2026-08-06T11:00:00.000Z' },
        { id: 'alt', created_time: '2026-08-06T05:00:00.000Z' },
      ] };
    },
    processLeadgenChangeFn: async (change) => {
      assert.deepEqual(change, { value: { leadgen_id: 'neu', form_id: 'aktiv' } });
      return { forwarded: 201, dedupe: 'created' };
    },
  });
  assert.deepEqual(result, {
    ok: true,
    dry: false,
    formsChecked: 1,
    leadsSeen: 2,
    eligible: 1,
    attempted: 1,
    forwarded: 1,
    created: 1,
    skipped: 0,
    truncated: false,
    errors: [],
  });
}

{
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.DFS_META_INTAKE_URL;
  const originalToken = process.env.DFS_META_LEAD_TOKEN;
  const expectedBody = { metaLeadId: 'lead-forward' };
  process.env.DFS_META_INTAKE_URL = 'https://example.test/api/leads/dfs-meta';
  process.env.DFS_META_LEAD_TOKEN = 'test-token';
  globalThis.fetch = async (url, options) => {
    assert.equal(url, process.env.DFS_META_INTAKE_URL);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.authorization, 'Bearer test-token');
    assert.equal(options.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), expectedBody);
    return { status: 200, json: async () => ({ dedupe: 'created' }) };
  };
  try {
    const result = await forwardToSchwarzwald(expectedBody);
    assert.deepEqual(result, { status: 200, data: { dedupe: 'created' } });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.DFS_META_INTAKE_URL;
    else process.env.DFS_META_INTAKE_URL = originalUrl;
    if (originalToken === undefined) delete process.env.DFS_META_LEAD_TOKEN;
    else process.env.DFS_META_LEAD_TOKEN = originalToken;
  }
}

{
  const originalSecret = process.env.CRON_SECRET;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  delete process.env.CRON_SECRET;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('kein Netz-Call erwartet'); };
  try {
    const result = await poll({ method: 'GET', headers: {}, query: {} });
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: 'CONFIG_MISSING' });
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  }
}

{
  const originalSecret = process.env.CRON_SECRET;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  process.env.CRON_SECRET = 'richtig';
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('kein Netz-Call erwartet'); };
  try {
    const result = await poll({ method: 'GET', headers: { authorization: 'Bearer falsch' }, query: {} });
    assert.equal(result.status, 401);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  }
}

{
  const result = await poll({ method: 'DELETE', headers: {}, query: {} });
  assert.equal(result.status, 405);
}

async function runPollCase(query, {
  dedupe = 'created',
  targetStatus = 200,
  singleLead = false,
  listFailure = false,
  leadsFailure = false,
} = {}) {
  const originalFetch = globalThis.fetch;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalMetaToken = process.env.META_ACCESS_TOKEN;
  const originalDfsToken = process.env.DFS_META_LEAD_TOKEN;
  const now = Date.now();
  process.env.CRON_SECRET = 'cron-test';
  process.env.META_ACCESS_TOKEN = 'system-token';
  process.env.DFS_META_LEAD_TOKEN = 'dfs-token';

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const path = url.pathname.replace('/v21.0/', '');
    if (options.method === 'POST') {
      return { status: targetStatus, json: async () => ({ dedupe }) };
    }
    if (path === '1192875973914275' && url.searchParams.get('fields') === 'access_token') {
      return { json: async () => ({ access_token: 'page-token' }) };
    }
    if (path === '1192875973914275/leadgen_forms') {
      if (listFailure) throw new Error('Meta Listing nicht erreichbar');
      return { json: async () => ({ data: [
        { id: 'form-1', name: 'Eins', status: 'ACTIVE' },
        ...(!singleLead ? [{ id: 'form-2', name: 'Zwei', status: 'ACTIVE' }] : []),
      ] }) };
    }
    if (path === 'form-1/leads') {
      if (leadsFailure) throw new Error('Meta Leads nicht erreichbar');
      return { json: async () => ({ data: [
        { id: 'lead-1', created_time: new Date(now - 60_000).toISOString() },
        ...(!singleLead ? [
          { id: 'lead-alt', created_time: new Date(now - 7 * 60 * 60 * 1000).toISOString() },
          { id: 'lead-zu-alt', created_time: new Date(now - 800 * 60 * 60 * 1000).toISOString() },
        ] : []),
      ] }) };
    }
    if (path === 'form-2/leads') {
      return { json: async () => ({ data: [
        { id: 'lead-2', created_time: new Date(now - 120_000).toISOString() },
      ] }) };
    }
    if (path === 'lead-1' || path === 'lead-2' || path === 'lead-alt') {
      return { json: async () => ({
        id: path,
        form_id: path === 'lead-2' ? 'form-2' : 'form-1',
        created_time: new Date(now).toISOString(),
        field_data: [],
      }) };
    }
    if (path === 'form-1' || path === 'form-2') {
      return { json: async () => ({ name: path }) };
    }
    throw new Error(`Unerwarteter Fetch: ${url} ${options.method || 'GET'}`);
  };

  try {
    return await poll({
      method: 'GET',
      headers: { authorization: 'Bearer cron-test' },
      query,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalMetaToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = originalMetaToken;
    if (originalDfsToken === undefined) delete process.env.DFS_META_LEAD_TOKEN;
    else process.env.DFS_META_LEAD_TOKEN = originalDfsToken;
  }
}

{
  const result = await runPollCase({});
  assert.equal(result.status, 200);
  assert.equal(result.body.formsChecked, 2);
  assert.equal(result.body.leadsSeen, 4);
  assert.equal(result.body.eligible, 2);
  assert.equal(result.body.attempted, 2);
  assert.equal(result.body.forwarded, 2);
  assert.equal(result.body.created, 2);
  assert.equal(result.body.skipped, 0);
}

{
  const result = await runPollCase({ dry: '1' });
  assert.equal(result.status, 200);
  assert.equal(result.body.formsChecked, 2);
  assert.equal(result.body.leadsSeen, 4);
  assert.equal(result.body.eligible, 2);
  assert.equal(result.body.attempted, 0);
  assert.equal(result.body.forwarded, 0);
}

{
  const result = await runPollCase({}, { dedupe: 'skipped', singleLead: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.eligible, 1);
  assert.equal(result.body.attempted, 1);
  assert.equal(result.body.forwarded, 1);
  assert.equal(result.body.created, 0);
  assert.equal(result.body.skipped, 1);
}

{
  const result = await runPollCase({}, { targetStatus: 503, singleLead: true });
  assert.equal(result.status, 502);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.attempted, 1);
  assert.equal(result.body.forwarded, 0);
  assert.deepEqual(result.body.errors, [
    { leadId: 'lead-1', formId: 'form-1', grund: 'forward_503' },
  ]);
}

{
  const result = await runPollCase({}, { listFailure: true });
  assert.equal(result.status, 502);
  assert.deepEqual(result.body, { ok: false, error: 'GRAPH_LIST_FAILED' });
}

{
  const result = await runPollCase({}, { leadsFailure: true, singleLead: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.formsChecked, 1);
  assert.equal(result.body.ok, false);
  assert.deepEqual(result.body.errors, [
    { formId: 'form-1', grund: 'leads_list_failed' },
  ]);
}

{
  const result = await runPollCase({ hours: '9999' });
  assert.equal(result.status, 200);
  assert.equal(result.body.leadsSeen, 4);
  assert.equal(result.body.eligible, 3);
  assert.equal(result.body.attempted, 3);
  assert.equal(result.body.forwarded, 3);
}

console.log('meta-leadgen ok');
