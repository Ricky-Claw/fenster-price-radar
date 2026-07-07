import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

process.env.MCP_AGENT_TOKEN = 'test-mcp-token';
// Popup-Tools brauchen kein echtes VPS im Test — sie sollen sauber "nicht konfiguriert" melden.
delete process.env.RUECKHOL_ADMIN_TOKEN;

const { default: handler } = await import('../api/mcp.js');

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
const expected = ['dfs_chatbot_ask', 'popup_analytics', 'popup_create', 'popup_delete', 'popup_list', 'popup_update', 'radar_get_config', 'radar_get_summary', 'radar_get_trend', 'radar_list_configs'];
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

// 3) Popup ohne konfiguriertes Token -> sauberer isError, kein Crash
const popup = await client.callTool({ name: 'popup_list', arguments: {} });
assert.equal(popup.isError, true, 'popup_list ohne Token muss isError sein');
assert.match(popup.content[0].text, /RUECKHOL_ADMIN_TOKEN/, 'nennt fehlende Env');

await client.close();
await new Promise((resolve) => server.close(resolve));
console.log('mcp-smoke ok');
