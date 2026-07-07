// MCP-Server (Streamable HTTP, stateless) für Agents wie Alpha.
// Endpoint: POST /api/mcp mit Authorization: Bearer $MCP_AGENT_TOKEN.
// Tools: Fensterradar lesen, Rückhol-Popups CRUD, DFS-Website-Chatbot fragen.
import crypto from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  radarGetSummary, radarListConfigs, radarGetConfig, radarGetTrend,
  popupList, popupAnalytics, popupCreate, popupUpdate, popupDelete,
  dfsChatbotAsk,
} from '../src/mcp/tools.js';

const BODY_MAX_BYTES = 262144;

function tokenOk(header) {
  const expected = process.env.MCP_AGENT_TOKEN || '';
  if (!expected) return false;
  const m = String(header || '').match(/^Bearer\s+(\S+)$/i);
  if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1]).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function readBody(req) {
  // Vercel parst JSON-Bodies teils schon vor -> req.body nutzen; sonst Rohstream lesen (wie api/chatbot.js, api/aufmass.js).
  if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > BODY_MAX_BYTES) throw new Error('request_too_large');
    return req.body;
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > BODY_MAX_BYTES) throw new Error('request_too_large');
    return req.body.trim() ? JSON.parse(req.body) : undefined;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > BODY_MAX_BYTES) throw new Error('request_too_large');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.trim() ? JSON.parse(raw) : undefined;
}

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function fail(error) {
  return { isError: true, content: [{ type: 'text', text: `Fehler: ${error?.message || error}` }] };
}
async function run(fn) {
  try { return ok(await fn()); } catch (error) { return fail(error); }
}

function buildServer() {
  const server = new McpServer({ name: 'fensterradar', version: '1.0.0' });

  server.registerTool('radar_get_summary',
    { description: 'Aktueller Fensterradar-Überblick: Stand, Zählstände, Einkaufspreis-Lauf, Wochen-Baseline, Verifizierung.', inputSchema: {} },
    async () => run(() => radarGetSummary()));

  server.registerTool('radar_list_configs',
    {
      description: 'Fensterkonfigurationen mit Preisen (DFS-Endpreis, günstigster Wettbewerber, Abstand, Eko4u-Einkaufspreis + Marge). Optional filtern.',
      inputSchema: {
        brand: z.string().optional().describe('Markenfilter, z.B. "Aluplast"'),
        profile: z.string().optional().describe('Profilfilter, z.B. "Ideal 4000"'),
        layout: z.enum(['1flg', '2flg_pfosten', '2flg_stulp_dk_dreh', 'balkontuer']).optional(),
        glazing: z.string().optional().describe('"2fach" oder "3fach"'),
        onlyWithPurchase: z.boolean().optional().describe('Nur Zeilen mit Eko4u-Einkaufspreis'),
      },
    },
    async (args) => run(() => radarListConfigs(args)));

  server.registerTool('radar_get_config',
    {
      description: 'Eine Konfiguration im Detail (alle Anbieter, Rabatte, Einkaufspreis, Verifizierung). Per key ODER brand+profile+size.',
      inputSchema: {
        key: z.string().optional(),
        brand: z.string().optional(),
        profile: z.string().optional(),
        size: z.string().optional().describe('z.B. "1000x1200"'),
      },
    },
    async (args) => run(() => radarGetConfig(args)));

  server.registerTool('radar_get_trend',
    { description: '3-Monats-Preistrend-Index je Anbieter.', inputSchema: {} },
    async () => run(() => radarGetTrend()));

  server.registerTool('popup_list',
    { description: 'Rückhol-Popups (Exit-Intent-Kampagnen) auflisten, inkl. Sites und Theme-Presets.', inputSchema: { siteId: z.string().optional() } },
    async (args) => run(() => popupList(args)));

  server.registerTool('popup_analytics',
    { description: 'Analytics der Rückhol-Popups (Impressions, Conversions je Kampagne).', inputSchema: {} },
    async () => run(() => popupAnalytics()));

  server.registerTool('popup_create',
    {
      description: 'Neues Rückhol-Popup anlegen. Felder: siteId, name, headline, text, ctaLabel, ctaType (newsletter/kontakt/rabatt/link/pdf), u.a. Unbekannte Felder werden serverseitig verworfen.',
      inputSchema: { campaign: z.record(z.any()).describe('Kampagnen-Objekt') },
    },
    async ({ campaign }) => run(() => popupCreate(campaign)));

  server.registerTool('popup_update',
    {
      description: 'Bestehendes Rückhol-Popup ändern. campaign.id ist Pflicht; gesetzte Felder werden aktualisiert.',
      inputSchema: { campaign: z.record(z.any()).describe('Kampagnen-Objekt inkl. id') },
    },
    async ({ campaign }) => run(() => popupUpdate(campaign)));

  server.registerTool('popup_delete',
    { description: 'Rückhol-Popup löschen (per id).', inputSchema: { id: z.string() } },
    async (args) => run(() => popupDelete(args)));

  server.registerTool('dfs_chatbot_ask',
    {
      description: 'Frage an den Website-Chatbot von deutscher-fenstershop.de (Rule-first RAG, Janela). Antwortet aus Firmenwissen; bei Unsicherheit verweist er auf Kontakt.',
      inputSchema: { message: z.string().describe('Kundenfrage'), sessionId: z.string().optional() },
    },
    async (args) => run(() => dfsChatbotAsk(args)));

  return server;
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', process.env.MCP_ALLOW_ORIGIN || '*');
  res.setHeader('access-control-allow-methods', 'POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization,content-type,mcp-protocol-version,mcp-session-id');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Nur POST (stateless MCP)' }, id: null }));
  }
  if (!tokenOk(req.headers.authorization)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }));
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    res.statusCode = error?.message === 'request_too_large' ? 413 : 400;
    return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Invalid body' }, id: null }));
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
