import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

process.env.MCP_AGENT_TOKEN = 'test-mcp-token';
// Popup-Tools brauchen kein echtes VPS im Test — sie sollen sauber "nicht konfiguriert" melden.
delete process.env.RUECKHOL_ADMIN_TOKEN;

const { default: handler } = await import('../api/mcp.js');
const { popupDesign } = await import('../src/mcp/tools.js');
const { sanitizeCampaignInput } = await import('../rueckhol-automatik/server/lib/sanitize.js');

const server = http.createServer((req, res) => handler(req, res));
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const url = new URL(`http://127.0.0.1:${port}/api/mcp`);

// 1) Ohne Token -> 401
const noAuth = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' });
assert.equal(noAuth.status, 401, 'ohne Token muss 401 kommen');

// 2) Mit Token -> MCP-Client verbindet, listet Tools, ruft radar-Tool
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { authorization: 'Bearer test-mcp-token' } },
});
const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
const expected = ['dfs_chatbot_ask', 'ebook_status', 'ebook_validate', 'popup_analytics', 'popup_create', 'popup_delete', 'popup_design', 'popup_list', 'popup_update', 'radar_get_config', 'radar_get_summary', 'radar_get_trend', 'radar_list_configs'];
assert.deepEqual(names, expected, `Tool-Liste stimmt nicht: ${names.join(',')}`);

const summary = await client.callTool({ name: 'radar_get_summary', arguments: {} });
const summaryData = JSON.parse(summary.content[0].text);
assert.ok(summaryData.summary?.configs > 0, 'radar_get_summary liefert configs');
assert.ok(summaryData.generatedAt, 'radar_get_summary liefert generatedAt');

const list = await client.callTool({ name: 'radar_list_configs', arguments: { brand: 'Aluplast', onlyWithPurchase: true } });
const listData = JSON.parse(list.content[0].text);
assert.ok(listData.count > 0, 'Aluplast mit Einkaufspreis vorhanden');
assert.ok(listData.configs.every((c) => typeof c.purchasePrice === 'number'), 'onlyWithPurchase filtert korrekt');

const one = await client.callTool({ name: 'radar_get_config', arguments: { brand: 'Aluplast', profile: 'Ideal 4000, 2fach', size: '500x500' } });
const oneData = JSON.parse(one.content[0].text);
assert.equal(oneData.found, true, 'radar_get_config findet die Zeile');

// 3) ebook_validate: gültige Beispiel-Config -> valid, kaputte Config -> Fehlerliste
const { readFileSync } = await import('node:fs');
const exampleConfig = JSON.parse(readFileSync(new URL('../tools/ebook-maker/example-ebook.json', import.meta.url), 'utf8'));
const validRes = await client.callTool({ name: 'ebook_validate', arguments: { config: exampleConfig } });
const validData = JSON.parse(validRes.content[0].text);
assert.equal(validData.valid, true, `example-ebook.json muss gültig sein: ${JSON.stringify(validData.errors)}`);

const brokenRes = await client.callTool({ name: 'ebook_validate', arguments: { config: { slug: 'Kaputt!', pages: [] } } });
const brokenData = JSON.parse(brokenRes.content[0].text);
assert.equal(brokenData.valid, false, 'kaputte Config muss invalid sein');
assert.ok(brokenData.errors.some((e) => /kebab-case/.test(e)), 'meldet slug-Fehler');
assert.ok(brokenData.errors.some((e) => /Pflichtfeld/.test(e)), 'meldet Pflichtfelder');

// 4) ebook_status: falscher slug -> isError; HEAD-Checks werden gemockt nicht — nur Slug-Validierung testen
const badSlug = await client.callTool({ name: 'ebook_status', arguments: { slug: 'NÖ!' } });
assert.equal(badSlug.isError, true, 'ebook_status mit kaputtem slug muss isError sein');

// 5) Popup ohne konfiguriertes Token -> sauberer isError, kein Crash
const popup = await client.callTool({ name: 'popup_list', arguments: {} });
assert.equal(popup.isError, true, 'popup_list ohne Token muss isError sein');
assert.match(popup.content[0].text, /RUECKHOL_ADMIN_TOKEN/, 'nennt fehlende Env');

// 6) popup_design: DFS-Theme vorschauen und gezielt anwenden, ohne Kampagneninhalte zu überschreiben
const noPopupFetch = async () => { throw new Error('Vorschau darf fetchImpl nicht aufrufen'); };
const preview = await popupDesign({}, { fetchImpl: noPopupFetch, env: {} });
assert.deepEqual(preview, {
  marke: 'dfs',
  variante: 'blau',
  theme: {
    name: 'DFS Blau',
    position: 'center',
    colors: {
      accent: '#003A66',
      accent_text: '#FFFFFF',
      text: '#333333',
      muted: '#6B7280',
      surface: '#FFFFFF',
      border: '#E5E7EB',
      backdrop: 'rgba(0,58,102,0.55)',
    },
    font_family: 'Arial, Helvetica, sans-serif',
    radius: 14,
    logo_url: 'https://deutscher-fenstershop.de/grafik/logo/fenster-online-kaufen-logo.png',
    logo_max_height: 44,
  },
  angewendetAuf: [],
  vorschau: true,
});

const orangePreview = await popupDesign({ variante: 'orange' }, { fetchImpl: noPopupFetch, env: {} });
assert.equal(orangePreview.theme.colors.accent, '#F47C26', 'orange nutzt den offiziellen DFS-Orangeton');
assert.equal(orangePreview.theme.colors.accent_text, '#333333', 'orange nutzt den kontrasttauglichen DFS-Texttoken');

const existingCampaign = {
  id: 'kampagne-1',
  headline: 'Bestehende Überschrift',
  body: 'Bestehender Text',
  trigger: 'exit_intent',
  trigger_config: { frequencyHours: 6 },
  action_type: 'coupon',
  action_config: { code: 'BLEIB10' },
  cta_label: 'Jetzt sichern',
  page_pattern: '/angebot/*',
  enabled: true,
  custom_css: '.popup { color: red; }',
};
let storedCampaign = { ...existingCampaign };
const idRequests = [];
const popupJsonResponse = (data) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});
const idFetch = async (requestUrl, init = {}) => {
  const request = {
    url: String(requestUrl),
    method: init.method,
    body: init.body ? JSON.parse(init.body) : undefined,
  };
  idRequests.push(request);
  if (request.method === 'GET') return popupJsonResponse({ campaigns: [storedCampaign] });
  if (request.method === 'PUT') {
    storedCampaign = sanitizeCampaignInput(request.body, storedCampaign);
    return popupJsonResponse({ campaign: storedCampaign });
  }
  throw new Error(`Unerwarteter Popup-Aufruf: ${request.method}`);
};
const popupDeps = {
  fetchImpl: idFetch,
  env: { RUECKHOL_BASE_URL: 'https://popup.test', RUECKHOL_ADMIN_TOKEN: 'test-token' },
};
const applied = await popupDesign({ id: existingCampaign.id }, popupDeps);
const idUpdates = idRequests.filter((request) => request.method === 'PUT');
assert.equal(idRequests.filter((request) => request.method === 'GET').length, 1, 'Kampagne wird vor dem Anwenden gelesen');
assert.equal(idUpdates.length, 1, 'id löst genau ein Update aus');
assert.deepEqual(Object.keys(idUpdates[0].body).sort(), ['id', 'theme'], 'Update sendet nur id und theme');
for (const key of ['name', 'position', 'font_family', 'radius', 'logo_url', 'logo_max_height']) {
  assert.equal(idUpdates[0].body.theme[key], applied.theme[key], `Theme-${key} wird unverändert übernommen`);
}
for (const key of ['accent', 'accent_text', 'text', 'muted', 'surface', 'border', 'backdrop']) {
  assert.equal(idUpdates[0].body.theme.colors[key], applied.theme.colors[key], `Theme-Farbe ${key} wird unverändert übernommen`);
}
assert.deepEqual(applied.angewendetAuf, [existingCampaign.id]);
assert.equal(applied.vorschau, false);
assert.equal(storedCampaign.headline, existingCampaign.headline, 'Überschrift bleibt erhalten');
assert.equal(storedCampaign.body, existingCampaign.body, 'Text bleibt erhalten');
assert.equal(storedCampaign.trigger, existingCampaign.trigger, 'Trigger bleibt erhalten');
assert.equal(storedCampaign.trigger_config.frequencyHours, existingCampaign.trigger_config.frequencyHours, 'Trigger-Daten bleiben erhalten');
assert.equal(storedCampaign.action_config.code, 'BLEIB10', 'Aktionsdaten bleiben erhalten');
for (const field of ['headline', 'body', 'cta_label', 'page_pattern', 'enabled', 'custom_css']) {
  assert.deepEqual(storedCampaign[field], existingCampaign[field], `${field} bleibt erhalten`);
}

const siteRequests = [];
const siteFetch = async (requestUrl, init = {}) => {
  const url = new URL(requestUrl);
  const body = init.body ? JSON.parse(init.body) : undefined;
  siteRequests.push({ url, method: init.method, body });
  if (init.method === 'GET') {
    assert.equal(url.searchParams.get('siteId'), 'dfs-shop', 'Site-Filter wird an popup_list übergeben');
    return popupJsonResponse({ campaigns: [{ id: 'site-kampagne-1', site_id: 'dfs-shop' }, { id: 'site-kampagne-2', site_id: 'dfs-shop' }] });
  }
  if (init.method === 'PUT') return popupJsonResponse({ campaign: body });
  throw new Error(`Unerwarteter Popup-Aufruf: ${init.method}`);
};
const siteApplied = await popupDesign({ siteId: 'dfs-shop' }, {
  fetchImpl: siteFetch,
  env: { RUECKHOL_BASE_URL: 'https://popup.test', RUECKHOL_ADMIN_TOKEN: 'test-token' },
});
assert.deepEqual(siteApplied.angewendetAuf, ['site-kampagne-1', 'site-kampagne-2']);
assert.equal(siteRequests.filter((request) => request.method === 'PUT').length, 2, 'siteId aktualisiert jede Kampagne einmal');

for (const invalidSiteId of ['   ', '*']) {
  let writes = 0;
  await assert.rejects(() => popupDesign({ siteId: invalidSiteId }, {
    fetchImpl: async (_url, init = {}) => { if (init.method === 'PUT') writes += 1; throw new Error('darf nicht aufgerufen werden'); },
    env: { RUECKHOL_BASE_URL: 'https://popup.test', RUECKHOL_ADMIN_TOKEN: 'test-token' },
  }), /siteId/);
  assert.equal(writes, 0, `siteId ${JSON.stringify(invalidSiteId)} darf nicht schreiben`);
}

const foreignFetch = async (_url, init = {}) => {
  if (init.method === 'PUT') throw new Error('PUT darf nach fremder Kampagne nicht erfolgen');
  return popupJsonResponse({ campaigns: [{ id: 'fremd', site_id: 'andere-site' }] });
};
await assert.rejects(() => popupDesign({ siteId: 'meine-site' }, { fetchImpl: foreignFetch, env: { RUECKHOL_BASE_URL: 'https://popup.test', RUECKHOL_ADMIN_TOKEN: 'test-token' } }), /außerhalb von siteId/);
await assert.rejects(() => popupDesign({ id: 'fremd', siteId: 'meine-site' }, { fetchImpl: foreignFetch, env: { RUECKHOL_BASE_URL: 'https://popup.test', RUECKHOL_ADMIN_TOKEN: 'test-token' } }), /außerhalb von siteId|gehört nicht zu siteId/);

const massRequests = [];
const massFetch = async (_url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  massRequests.push({ method: init.method, body });
  if (init.method === 'GET') return popupJsonResponse({ campaigns: [{ id: 'ok-1', site_id: 'mass-site' }, { id: 'bad-1', site_id: 'mass-site' }, { id: 'ok-2', site_id: 'mass-site' }] });
  if (body.id === 'bad-1') return { ok: false, status: 500, text: async () => 'kaputt' };
  return popupJsonResponse({ campaign: body });
};
const massApplied = await popupDesign({ siteId: 'mass-site' }, { fetchImpl: massFetch, env: { RUECKHOL_BASE_URL: 'https://popup.test', RUECKHOL_ADMIN_TOKEN: 'test-token' } });
assert.deepEqual(massApplied.angewendetAuf.sort(), ['ok-1', 'ok-2']);
assert.deepEqual(massApplied.fehlgeschlagen.map((item) => item.id), ['bad-1']);
assert.equal(massApplied.unvollstaendig, true);

let namedBody;
const namedFetch = async (_url, init = {}) => init.method === 'GET'
  ? popupJsonResponse({ campaigns: [{ id: 'named', site_id: 'named-site' }], sites: [{ id: 'named-site', name: 'Deutscher Fenstershop' }] })
  : (namedBody = JSON.parse(init.body), popupJsonResponse({ campaign: namedBody }));
await popupDesign({ siteId: 'named-site' }, { fetchImpl: namedFetch, env: { RUECKHOL_BASE_URL: 'https://popup.test', RUECKHOL_ADMIN_TOKEN: 'test-token' } });
assert.equal(namedBody.site_name, 'Deutscher Fenstershop');

await assert.rejects(() => popupDesign({ profil: { name: 'Eigene Firma', schrift: 'Verdana', logo: '', varianten: { eigen: { name: 'Eigen', colors: { accent: 'not-a-color', accent_text: '#FFFFFF', text: '#333333', muted: '#6B7280', surface: '#FFFFFF', border: '#E5E7EB', backdrop: 'rgba(0,0,0,0.5)' } } } } }), /accent.*not-a-color/);

await assert.rejects(
  () => popupDesign({ variante: 'lila' }),
  /Erlaubt sind: blau, orange, hell/,
  'unbekannte Variante nennt die erlaubten Werte',
);

await assert.rejects(() => popupDesign({ marke: 'unbekannt' }), /Bekannte Kennungen: dfs/);
const eigenesProfil = { name: 'Eigene Firma', schrift: 'Verdana', logo: '', varianten: { eigen: { name: 'Eigen', colors: { accent: '#123456', accent_text: '#FFFFFF', text: '#333333', muted: '#6B7280', surface: '#FFFFFF', border: '#E5E7EB', backdrop: 'rgba(0,0,0,0.5)' } } } };
const eigeneVorschau = await popupDesign({ marke: 'dfs', profil: eigenesProfil, variante: 'eigen' }, { fetchImpl: noPopupFetch, env: {} });
assert.equal(eigeneVorschau.theme.name, 'Eigen');
await assert.rejects(() => popupDesign({ profil: { name: 'Unvollständig' } }), /schrift/);
await assert.rejects(() => popupDesign({ profil: eigenesProfil, variante: 'blau' }), /Erlaubt sind: eigen/);

await client.close();
await new Promise((resolve) => server.close(resolve));
console.log('mcp-smoke ok');
