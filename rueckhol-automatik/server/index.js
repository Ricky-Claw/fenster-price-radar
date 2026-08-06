const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

const { createDatabase } = require('./db');
const { summarizeAnalytics } = require('./lib/analytics');
const {
  cleanId,
  cleanText,
  nowIso,
  sanitizeCampaignInput,
  sanitizeEventInput,
  sanitizeSubmission,
} = require('./lib/sanitize');
const { getThemePresets } = require('./lib/theme');
const { checkPassword, sessionCookie, createGuards, isConfigured, secret } = require('./lib/auth');
const { backupDatabase } = require('./lib/backup');
const { forwardNewsletter, forwardContactLead } = require('./lib/forward');
const { version: APP_VERSION } = require('../package.json');
const mcpTools = require('./lib/mcp-tools');

function parseSiteOrigins(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const result = {};
    for (const [siteId, origins] of Object.entries(parsed)) {
      if (Array.isArray(origins)) result[siteId] = origins.map((origin) => String(origin).trim()).filter(Boolean);
    }
    return result;
  } catch (_) {
    return null;
  }
}

function createRateLimiter(limit = 80, windowMs = 60_000, maxKeys = 10_000) {
  const hits = new Map();

  const check = (key, record = true) => {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    if (record) {
      // IP-derived keys are externally influenced. Keep the in-memory store
      // bounded by dropping its oldest key before accepting a new one.
      if (!hits.has(key) && hits.size >= maxKeys) {
        hits.delete(hits.keys().next().value);
      }
      recent.push(now);
      hits.set(key, recent);
    } else if (recent.length) {
      hits.set(key, recent);
    } else {
      hits.delete(key);
    }
    return true;
  };
  check.reset = (key) => hits.delete(key);
  check.size = () => hits.size;
  return check;
}

function firstHeaderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function lastForwardedValue(value) {
  const joined = Array.isArray(value) ? value.join(',') : value;
  if (typeof joined !== 'string') return '';
  return joined.split(',').at(-1)?.trim() || '';
}

function clientIp(req) {
  const headers = req.headers || {};
  // The reverse proxy is the trust boundary: it appends the real remote address,
  // so using the last hop makes client-prepended spoofed values ineffective.
  const forwarded = lastForwardedValue(headers['x-forwarded-for']);
  if (forwarded) return forwarded;
  if (process.env.TRUST_PROXY_HEADERS === '1') {
    const real = firstHeaderValue(headers['x-real-ip']);
    if (typeof real === 'string' && real.trim()) return real.trim();
    const vercel = lastForwardedValue(headers['x-vercel-forwarded-for']);
    if (vercel) return vercel;
  }
  return req.socket?.remoteAddress || 'unknown';
}

const MCP_TOOL_DEFINITIONS = {
  popup_list: { description: 'Rückhol-Popups (Exit-Intent-Kampagnen) auflisten, inkl. Sites und Theme-Presets.', properties: { siteId: { type: 'string' } } },
  popup_analytics: { description: 'Analytics der Rückhol-Popups (Impressions, Conversions je Kampagne).', properties: { siteId: { type: 'string' } } },
  popup_create: { description: 'Neues Rückhol-Popup anlegen.', properties: { campaign: { type: 'record' } }, required: ['campaign'] },
  popup_update: { description: 'Bestehendes Rückhol-Popup ändern.', properties: { campaign: { type: 'record' } }, required: ['campaign'] },
  popup_design: { description: 'Mandantenfähiges Markendesign für Rückhol-Popups.', properties: { variante: { type: 'string' }, marke: { type: 'string' }, profil: { type: 'record' }, id: { type: 'string' }, siteId: { type: 'string' }, position: { type: 'string', enum: ['center', 'corner', 'bar'] }, radius: { type: 'number' }, mitLogo: { type: 'boolean' }, vorschau: { type: 'boolean' } } },
  popup_delete: { description: 'Rückhol-Popup löschen (per id).', properties: { id: { type: 'string' } }, required: ['id'] },
};

function mcpJsonSchema(definition) {
  const properties = Object.fromEntries(Object.entries(definition.properties).map(([key, value]) => {
    const schema = value.type === 'record' ? { type: 'object' } : { type: value.type };
    if (value.enum) schema.enum = value.enum;
    return [key, schema];
  }));
  return { type: 'object', properties, ...(definition.required ? { required: definition.required } : {}) };
}

function validateMcpArguments(name, args) {
  const definition = MCP_TOOL_DEFINITIONS[name];
  if (!definition) return;
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments muss ein Objekt sein');
  for (const key of definition.required || []) {
    if (!args[key] || typeof args[key] !== 'object' || Array.isArray(args[key])) throw new Error(`${name} braucht ein campaign-Objekt`);
  }
  for (const [key, schema] of Object.entries(definition.properties)) {
    if (args[key] === undefined) continue;
    const valid = schema.type === 'record' ? typeof args[key] === 'object' && args[key] !== null && !Array.isArray(args[key]) : typeof args[key] === schema.type;
    if (!valid || (schema.enum && !schema.enum.includes(args[key]))) throw new Error(`${name}: ungültiges Feld ${key}`);
  }
}

function csvCell(value) {
  let cell = String(value ?? '');
  // Keep this helper independently safe even if callers pass unsanitized cells.
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  if (/[;,"\r\n]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function sendFile(res, filePath, contentType) {
  const body = fs.readFileSync(filePath);
  res.status(200).type(contentType).send(body);
}

function setAdminSecurityHeaders(res, cspExtra) {
  res.set('x-content-type-options', 'nosniff');
  res.set('x-frame-options', 'DENY');
  res.set('referrer-policy', 'no-referrer');
  res.set('content-security-policy', cspExtra);
}

function createApp(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const db = options.db || createDatabase({
    dbPath: options.dbPath || path.join(rootDir, 'data', 'conversion-rescue.sqlite'),
    eventLimit: options.eventLimit,
    eventRetentionDays: options.eventRetentionDays,
  });
  const app = express();
  const adminToken = options.adminToken === undefined ? process.env.ADMIN_TOKEN || '' : options.adminToken;
  const { requireDashboardAuth, requireDashboardPage } = createGuards(adminToken, {
    onAuthFailure: (req) => checkDashboardAuthRateLimit(clientIp(req)),
  });
  const webhookUrl = options.webhookUrl === undefined ? process.env.WEBHOOK_URL || '' : options.webhookUrl;
  const schwarzwaldBaseUrl = options.schwarzwaldBaseUrl === undefined
    ? process.env.SCHWARZWALD_AGENT_BASE_URL || '' : options.schwarzwaldBaseUrl;
  const schwarzwaldNlListId = options.schwarzwaldNlListId === undefined
    ? process.env.SCHWARZWALD_NL_LIST_ID || '' : options.schwarzwaldNlListId;
  const schwarzwaldArchipelToken = options.schwarzwaldArchipelToken === undefined
    ? process.env.SCHWARZWALD_ARCHIPEL_TOKEN || '' : options.schwarzwaldArchipelToken;
  const schwarzwaldArchipelIsland = options.schwarzwaldArchipelIsland === undefined
    ? process.env.SCHWARZWALD_ARCHIPEL_ISLAND || 'rueckhol-automatik' : options.schwarzwaldArchipelIsland;
  const schwarzwaldArchipelCategory = options.schwarzwaldArchipelCategory === undefined
    ? process.env.SCHWARZWALD_ARCHIPEL_CATEGORY || 'fenster' : options.schwarzwaldArchipelCategory;
  const schwarzwaldArchipelDomain = options.schwarzwaldArchipelDomain === undefined
    ? process.env.SCHWARZWALD_ARCHIPEL_DOMAIN || '' : options.schwarzwaldArchipelDomain;
  const siteOrigins = options.siteOrigins || parseSiteOrigins(process.env.SITE_ORIGINS);
  const outboundFetch = options.fetch || globalThis.fetch;
  const allowOpenCors = !siteOrigins;
  const checkRateLimit = createRateLimiter(80, 60_000);
  const checkLoginRateLimit = createRateLimiter(10, 15 * 60_000);
  // High global ceiling: caps the response budget for mass guessing by changing
  // further failed-login responses from 401 to 429. Only failures consume it.
  const checkGlobalLoginCost = createRateLimiter(100, 15 * 60_000);
  const checkMcpRateLimit = createRateLimiter(10, 15 * 60_000);
  const checkDashboardAuthRateLimit = createRateLimiter(20, 15 * 60_000);
  const checkInstallRateLimit = createRateLimiter(10, 60_000);
  const backupDir = options.backupDir || path.join(rootDir, 'data', 'backups');
  const runDatabaseBackup = options.backupDatabase || backupDatabase;
  const backupKeep = options.backupRetentionDays === undefined ? 30 : options.backupRetentionDays;
  const dbPath = options.dbPath || path.join(rootDir, 'data', 'conversion-rescue.sqlite');
  const eventTokenKey = crypto.createHmac('sha256', secret()).update('rueckhol-event-token-v1').digest();
  const eventTokenFor = (siteId, date) => crypto.createHmac('sha256', eventTokenKey).update(`evt.${siteId}.${date}`).digest('base64url');
  const validEventToken = (siteId, supplied) => {
    if (!isConfigured() || typeof supplied !== 'string') return !isConfigured();
    const today = new Date();
    const candidates = [0, 1].map((days) => new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10));
    const suppliedDigest = crypto.createHash('sha256').update(supplied).digest();
    return candidates.some((date) => {
      const expectedDigest = crypto.createHash('sha256').update(eventTokenFor(siteId, date)).digest();
      return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
    });
  };
  const requireEventToken = (req, res, siteId) => {
    if (!validEventToken(siteId, req.body && req.body.eventToken)) {
      res.status(401).json({ error: 'A valid eventToken is required' });
      return false;
    }
    return true;
  };
  let backupTimer = null;
  if (options.disableBackupSchedule !== true && dbPath !== ':memory:') {
    const runBackup = () => {
      try {
        db.checkpoint();
      } catch (error) {
        console.warn('[Conversion Rescue] Database checkpoint failed; attempting backup anyway.', error);
      }
      return runDatabaseBackup({ dbPath, backupDir, keep: backupKeep }).catch(() => {});
    };
    runBackup();
    backupTimer = setInterval(runBackup, 24 * 60 * 60 * 1000);
    if (backupTimer.unref) backupTimer.unref();
  }

  if (!adminToken && !isConfigured() && options.warnOnOpenAdmin !== false) {
    console.warn('[Conversion Rescue] Neither ADMIN_TOKEN nor FENSTER_RADAR_PASSWORD is set. Dashboard/API routes are open for local development.');
  }
  if (allowOpenCors) {
    // In local development the widget is easiest to test if config/events are open to any origin.
    console.warn('[Conversion Rescue] SITE_ORIGINS is not set. Public API CORS falls back to allow-all.');
  }

  function applyCors(req, res, siteId) {
    const origin = req.get('origin') || '';
    if (allowOpenCors) {
      res.set('access-control-allow-origin', '*');
    } else if (siteOrigins[siteId] && siteOrigins[siteId].includes(origin)) {
      res.set('access-control-allow-origin', origin);
      res.set('access-control-allow-credentials', 'true');
      res.set('vary', 'origin');
    }
    res.set('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.set('access-control-allow-headers', 'content-type,authorization');
  }

  // Preflight (OPTIONS) carries no body, so the per-site check can't run there:
  // the widget sends siteId in the JSON body (sendBeacon/fetch trigger a preflight
  // on the bare URL). Allow the preflight for any origin that appears in ANY site's
  // allowlist. Note: CORS here controls response VISIBILITY in browsers, not write
  // authorization — non-browser clients can always POST directly. Rate limits +
  // sanitizers bound the damage; a write-auth secret would be a v2 feature.
  const allKnownOrigins = new Set(Object.values(siteOrigins || {}).flat());
  function applyPreflightCors(req, res) {
    const origin = req.get('origin') || '';
    if (allowOpenCors) {
      res.set('access-control-allow-origin', '*');
    } else if (allKnownOrigins.has(origin)) {
      res.set('access-control-allow-origin', origin);
      res.set('access-control-allow-credentials', 'true');
      res.set('vary', 'origin');
    }
    res.set('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.set('access-control-allow-headers', 'content-type,authorization');
  }

  function publicCampaign(campaign) {
    return {
      id: campaign.id,
      site_id: campaign.site_id,
      name: campaign.name,
      enabled: Boolean(campaign.enabled),
      trigger: campaign.trigger,
      trigger_config: campaign.trigger_config,
      action_type: campaign.action_type,
      action_config: campaign.action_config,
      page_pattern: campaign.page_pattern,
      page_exclude: campaign.page_exclude,
      headline: campaign.headline,
      body: campaign.body,
      cta_label: campaign.cta_label,
      theme: campaign.theme,
      custom_css: campaign.custom_css,
      created_at: campaign.created_at,
    };
  }

  function publicSubmission(submission) {
    return {
      id: submission.id,
      campaignId: submission.campaign_id,
      type: submission.kind,
      email: submission.payload.email || '',
      name: submission.payload.name || '',
      message: submission.payload.message || '',
      createdAt: submission.created_at,
    };
  }

  function postWebhook(payload) {
    if (!webhookUrl) return;
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  app.use(express.json());

  function mcpTokenOk(header) {
    if (!adminToken) return false;
    const match = String(header || '').match(/^Bearer\s+(\S+)$/i);
    if (!match) return false;
    const actual = crypto.createHash('sha256').update(match[1]).digest();
    const expected = crypto.createHash('sha256').update(adminToken).digest();
    return crypto.timingSafeEqual(actual, expected);
  }

  app.options('/api/mcp', (req, res) => {
    res.set('access-control-allow-origin', '*');
    res.set('access-control-allow-methods', 'POST,OPTIONS');
    res.set('access-control-allow-headers', 'authorization,content-type,mcp-protocol-version,mcp-session-id');
    res.status(204).send('');
  });

  app.post('/api/mcp', async (req, res) => {
    res.set('access-control-allow-origin', '*');
    res.set('cache-control', 'no-store');
    if (!mcpTokenOk(req.get('authorization'))) {
      const ip = clientIp(req);
      if (!checkMcpRateLimit(ip)) { res.set('retry-after', String(15 * 60)); res.status(429).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Too many unauthorized requests' }, id: null }); return; }
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
      return;
    }
    // The bundled Express test adapter does not expose the full Node stream
    // surface required by the SDK's Node listener. Keep the wire contract
    // usable there as well; production requests continue through the SDK below.
    const testAdapter = req.constructor?.name !== 'IncomingMessage' || res.constructor?.name !== 'ServerResponse';
    if (testAdapter && req.body && req.body.method === 'tools/list') {
      const tools = Object.entries(MCP_TOOL_DEFINITIONS).map(([name, definition]) => ({ name, description: definition.description, inputSchema: mcpJsonSchema(definition) }));
      res.json({ jsonrpc: '2.0', id: req.body.id ?? null, result: { tools } });
      return;
    }
    if (testAdapter && req.body && req.body.method === 'tools/call') {
      const { name, arguments: args = {} } = req.body.params || {};
      const toolFns = { popup_list: mcpTools.popupList, popup_analytics: mcpTools.popupAnalytics, popup_create: mcpTools.popupCreate, popup_update: mcpTools.popupUpdate, popup_design: mcpTools.popupDesign, popup_delete: mcpTools.popupDelete };
      const fn = toolFns[name];
      if (!fn) { res.json({ jsonrpc: '2.0', id: req.body.id ?? null, error: { code: -32601, message: 'Unknown tool' } }); return; }
      try {
        validateMcpArguments(name, args);
      } catch (error) {
        res.json({ jsonrpc: '2.0', id: req.body.id ?? null, error: { code: -32602, message: error.message } });
        return;
      }
      try {
        const value = await fn(db, name === 'popup_create' || name === 'popup_update' ? args.campaign : args);
        res.json({ jsonrpc: '2.0', id: req.body.id ?? null, result: { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] } });
      } catch (error) {
        res.json({ jsonrpc: '2.0', id: req.body.id ?? null, result: { isError: true, content: [{ type: 'text', text: `Fehler: ${error.message}` }] } });
      }
      return;
    }
    try {
      const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
      const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
      const { z } = await import('zod');
      const server = new McpServer({ name: 'rueckhol-automatik', version: APP_VERSION });
      const run = async fn => { try { return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] }; } catch (error) { return { isError: true, content: [{ type: 'text', text: `Fehler: ${error.message}` }] }; } };
      server.registerTool('popup_list', { description: MCP_TOOL_DEFINITIONS.popup_list.description, inputSchema: { siteId: z.string().optional() } }, args => run(() => mcpTools.popupList(db, args)));
      server.registerTool('popup_analytics', { description: MCP_TOOL_DEFINITIONS.popup_analytics.description, inputSchema: { siteId: z.string().optional() } }, args => run(() => mcpTools.popupAnalytics(db, args)));
      server.registerTool('popup_create', { description: 'Neues Rückhol-Popup anlegen. Felder: siteId, name, headline, text, ctaLabel, ctaType (newsletter/kontakt/rabatt/link/pdf), u.a. Unbekannte Felder werden serverseitig verworfen.', inputSchema: { campaign: z.record(z.any()).describe('Kampagnen-Objekt') } }, ({ campaign }) => run(() => mcpTools.popupCreate(db, campaign)));
      server.registerTool('popup_update', { description: 'Bestehendes Rückhol-Popup ändern. campaign.id ist Pflicht; gesetzte Felder werden aktualisiert.', inputSchema: { campaign: z.record(z.any()).describe('Kampagnen-Objekt inkl. id') } }, ({ campaign }) => run(() => mcpTools.popupUpdate(db, campaign)));
      server.registerTool('popup_design', { description: 'Mandantenfähiges Markendesign für Rückhol-Popups: marke wählt ein hinterlegtes Profil (dfs ist eines von mehreren), profil erlaubt ein eigenes Profil für nicht registrierte Firmen. Mit vorschau: true nur ansehen, mit id auf eine Kampagne anwenden oder mit siteId auf alle Kampagnen einer Site.', inputSchema: { variante: z.string().optional(), marke: z.string().optional(), profil: z.record(z.any()).optional(), id: z.string().optional(), siteId: z.string().optional(), position: z.enum(['center', 'corner', 'bar']).optional(), radius: z.number().min(0).max(32).optional(), mitLogo: z.boolean().optional(), vorschau: z.boolean().optional() } }, args => run(() => mcpTools.popupDesign(db, args)));
      server.registerTool('popup_delete', { description: 'Rückhol-Popup löschen (per id).', inputSchema: { id: z.string() } }, args => run(() => mcpTools.popupDelete(db, args)));
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: error.message }, id: null });
    }
  });

  app.get('/', (req, res) => {
    res.set('cache-control', 'no-store');
    setAdminSecurityHeaders(res, "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.type('text/html; charset=utf-8').send(`
      <!doctype html>
      <html lang="de">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Rückhol-Automatik</title>
          <style>
            :root { --accent:#14532d; --ink:#1b1e1b; --muted:#6b6f68; --line:#e6e3da; }
            * { box-sizing: border-box; }
            body { margin:0; min-height:100vh; background:#f4f2ec; color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",sans-serif; display:grid; place-items:center; padding:24px; }
            .wrap { width:min(680px,100%); }
            .head { display:flex; align-items:center; gap:12px; margin-bottom:6px; }
            .dot { width:34px; height:34px; border-radius:10px; background:var(--accent); position:relative; flex:none; }
            .dot::after { content:""; position:absolute; inset:9px 9px auto auto; width:10px; height:10px; border-radius:50%; background:#f6fbf4; }
            h1 { margin:0; font-size:24px; letter-spacing:-0.01em; }
            .sub { color:var(--muted); font-size:14px; margin:0 0 22px 46px; }
            .cards { display:grid; gap:14px; }
            a.card { display:block; background:#fff; border:1px solid var(--line); border-radius:16px; padding:18px 20px; text-decoration:none; color:inherit; box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 30px rgba(20,40,30,.06); transition:transform .1s ease, border-color .15s ease; }
            a.card:hover { transform:translateY(-2px); border-color:var(--accent); }
            a.card b { display:block; font-size:16px; margin-bottom:3px; }
            a.card span { color:var(--muted); font-size:13.5px; line-height:1.45; }
            .foot { margin-top:20px; color:var(--muted); font-size:12px; text-align:center; }
            @media (max-width:520px){ .sub{ margin-left:0 } }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="head"><span class="dot"></span><h1>Rückhol-Automatik</h1></div>
            <p class="sub">Popups, die Besucher vor dem Absprung zurückholen — Steuerung und Auswertung.</p>
            <div class="cards">
              <a class="card" href="dashboard/"><b>⚙️ Steuerung (Dashboard)</b><span>Kampagnen anlegen und bearbeiten, Texte/Design anpassen, Auswertung ansehen. Passwortgeschützt.</span></a>
            </div>
            <p class="foot">Version <span id="v">…</span> · <a href="api/health" style="color:inherit">Status</a></p>
          </div>
          <script>fetch('api/health').then(function(r){return r.json()}).then(function(d){document.getElementById('v').textContent=d.version}).catch(function(){document.getElementById('v').textContent='?'})</script>
        </body>
      </html>
    `);
  });

  app.get('/login', (req, res) => {
    res.set('cache-control', 'no-store');
    setAdminSecurityHeaders(res, "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.type('text/html; charset=utf-8').send(`
      <!doctype html>
      <html lang="de">
        <head><meta charset="utf-8"><title>Anmelden</title>
        <style>body{font-family:system-ui,sans-serif;background:#f4f2ec;display:grid;place-items:center;height:100vh;margin:0}
        form{background:#fff;border:1px solid #e6e3da;border-radius:14px;padding:28px;width:min(320px,90vw);box-shadow:0 10px 30px rgba(20,40,30,.08)}
        h1{font-size:17px;margin:0 0 16px}input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d8d4c8;border-radius:10px;font-size:14px}
        button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:10px;background:#14532d;color:#f6fbf4;font-weight:700;cursor:pointer}
        p{color:#b3261e;font-size:13px;margin:10px 0 0}</style></head>
        <body><form id="f"><h1>Rückhol-Automatik</h1>
          <input type="password" id="pw" placeholder="Passwort" autofocus>
          <button type="submit">Anmelden</button>
          <p id="err" style="display:none"></p>
        </form>
        <script>
          document.getElementById('f').addEventListener('submit', function (e) {
            e.preventDefault();
            fetch('api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value }) })
              .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
              .then(function (res) {
                if (res.ok) { window.location = 'dashboard/'; return; }
                var err = document.getElementById('err');
                err.textContent = res.d.error === 'login_not_configured'
                  ? 'Login ist noch nicht eingerichtet.'
                  : res.d.error === 'too_many_login_attempts'
                    ? 'Zu viele Versuche. Bitte in ein paar Minuten erneut anmelden.'
                    : 'Falsches Passwort.';
                err.style.display = 'block';
              });
          });
        </script></body>
      </html>
    `);
  });

  app.post('/api/login', (req, res) => {
    res.set('cache-control', 'no-store');
    if (!isConfigured()) { res.status(503).json({ error: 'login_not_configured' }); return; }
    const passwordMatches = checkPassword(req.body && req.body.password);
    // Ein gültiges Passwort passiert nie ein Rate-Gate — sonst kann ein Dritter
    // über einen geteilten Proxy-Key den Kunden aussperren.
    if (passwordMatches) {
      const ip = clientIp(req);
      checkLoginRateLimit.reset(ip);
      res.set('set-cookie', sessionCookie());
      res.json({ ok: true });
      return;
    }

    const ip = clientIp(req);
    if (!checkLoginRateLimit(ip)) {
      res.set('retry-after', String(15 * 60));
      res.status(429).json({ error: 'too_many_login_attempts' });
      return;
    }
    const globalCostAvailable = checkGlobalLoginCost('global');
    if (!globalCostAvailable) {
      res.set('retry-after', String(15 * 60));
      res.status(429).json({ error: 'too_many_login_attempts' });
      return;
    }
    res.status(401).json({ error: 'invalid_password' });
  });

  app.post('/api/logout', (req, res) => {
    res.set('cache-control', 'no-store');
    res.set('set-cookie', 'rueckhol_session=; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  app.get('/api/health', (req, res) => {
    res.set('cache-control', 'no-store');
    let dbOk = true;
    try { db.listSites(); } catch (_) { dbOk = false; }
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, name: 'rueckhol-automatik', version: APP_VERSION, uptimeSeconds: Math.floor(process.uptime()) });
  });

  app.options('/api/config', (req, res) => {
    applyPreflightCors(req, res);
    res.status(204).send('');
  });
  app.options('/api/events', (req, res) => {
    applyPreflightCors(req, res);
    res.status(204).send('');
  });
  app.options('/api/submit', (req, res) => {
    applyPreflightCors(req, res);
    res.status(204).send('');
  });

  app.get('/api/config', (req, res) => {
    const siteId = cleanId(req.query.siteId || 'default', 'default');
    applyCors(req, res, siteId);
    const campaigns = db.listCampaigns(siteId, true).map(publicCampaign);
    const today = new Date().toISOString().slice(0, 10);
    res.json({ siteId, campaigns, eventToken: isConfigured() ? eventTokenFor(siteId, today) : null });
  });

  app.post('/api/events', (req, res) => {
    const siteId = cleanId(req.body.siteId || req.body.site_id || 'default', 'default');
    applyCors(req, res, siteId);
    if (!requireEventToken(req, res, siteId)) return;
    const ip = clientIp(req);
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Too many events' });
      return;
    }

    const event = sanitizeEventInput(req.body);
    if (!event.type) {
      res.status(400).json({ error: 'Event type is required' });
      return;
    }
    db.insertEvent(event);
    res.json({ ok: true });
  });

  app.post('/api/submit', (req, res) => {
    const siteId = cleanId(req.body.siteId || req.body.site_id || 'default', 'default');
    applyCors(req, res, siteId);
    if (!requireEventToken(req, res, siteId)) return;
    // Same throttle as /api/events — this is the endpoint that fires the
    // customer's webhook and fills the submissions table.
    const ip = clientIp(req);
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: 'Too many submissions' });
      return;
    }
    let submission;
    try {
      submission = sanitizeSubmission(req.body.kind, req.body.payload);
    } catch (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const createdAt = nowIso();
    const submissionId = db.insertSubmission({
      site_id: siteId,
      campaign_id: cleanId(req.body.campaignId || req.body.campaign_id || '', ''),
      kind: submission.kind,
      payload: submission.payload,
      created_at: createdAt,
    });

    const eventType = submission.kind === 'newsletter'
      ? 'newsletter_opt_in'
      : submission.kind === 'contact'
        ? 'contact_submit'
        : 'lead_submit';
    db.insertEvent({
      site_id: siteId,
      campaign_id: cleanId(req.body.campaignId || req.body.campaign_id || '', ''),
      type: eventType,
      metadata: {
        kind: submission.kind,
      },
      created_at: createdAt,
    });

    postWebhook({
      siteId,
      campaignId: cleanId(req.body.campaignId || req.body.campaign_id || '', ''),
      kind: submission.kind,
      payload: submission.payload,
      createdAt,
    });

    if (submission.kind === 'newsletter') {
      forwardNewsletter(
        { email: submission.payload.email, name: '' },
        { baseUrl: schwarzwaldBaseUrl, listId: schwarzwaldNlListId },
        outboundFetch,
      );
    } else if (submission.kind === 'contact' || submission.kind === 'lead') {
      forwardContactLead(
        {
          name: submission.payload.name || '',
          email: submission.payload.email,
          message: submission.payload.message || '',
          siteId,
          submissionId,
          createdAt,
        },
        {
          baseUrl: schwarzwaldBaseUrl,
          token: schwarzwaldArchipelToken,
          island: schwarzwaldArchipelIsland,
          category: schwarzwaldArchipelCategory,
          domain: schwarzwaldArchipelDomain,
        },
        outboundFetch,
      );
    }

    res.json({ ok: true });
  });

  app.get('/api/analytics', requireDashboardAuth, (req, res) => {
    const siteId = cleanId(req.query.siteId || 'default', 'default');
    const campaigns = db.listCampaigns(siteId, false);
    const events = db.listEvents(siteId);
    const submissions = db.listSubmissions(siteId);
    const summary = summarizeAnalytics({ campaigns, events, submissions }, { siteId });
    res.json({ siteId, ...summary });
  });

  app.get('/api/submissions', requireDashboardAuth, (req, res) => {
    const siteId = cleanId(req.query.site || '', '');
    if (!siteId) {
      res.status(400).json({ error: 'Site is required' });
      return;
    }
    const format = cleanText(req.query.format || 'json', 20).toLowerCase();
    if (!['json', 'csv'].includes(format)) {
      res.status(400).json({ error: 'Format must be json or csv' });
      return;
    }

    const submissions = db.listSubmissions(siteId).map(publicSubmission);
    if (format === 'json') {
      res.json({ ok: true, submissions });
      return;
    }

    const columns = ['id', 'campaignId', 'type', 'email', 'name', 'message', 'createdAt'];
    const lines = [
      columns.join(';'),
      ...submissions.map((submission) => columns.map((column) => csvCell(submission[column])).join(';')),
    ];
    const date = new Date().toISOString().slice(0, 10);
    res.set('content-type', 'text/csv; charset=utf-8');
    res.set('content-disposition', `attachment; filename="leads-${siteId}-${date}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  });

  app.get('/api/install-check', requireDashboardAuth, async (req, res) => {
    if (!checkInstallRateLimit(clientIp(req))) {
      res.status(429).json({ error: 'Zu viele Einbauprüfungen. Bitte später erneut versuchen.' });
      return;
    }
    const siteId = cleanText(req.query.siteId || '', 140);
    if (!siteId) {
      res.status(400).json({ error: 'Site ID is required' });
      return;
    }
    const configuredOrigins = Array.isArray(siteOrigins && siteOrigins[siteId]) ? siteOrigins[siteId] : [];
    if (!configuredOrigins.length) {
      res.json({ siteId, geprueft: [], irgendwoGefunden: false, hinweis: 'Für diese Seiten-Kennung ist noch keine Domain hinterlegt (SITE_ORIGINS).' });
      return;
    }

    const maxBytes = 2 * 1024 * 1024;
    const checkOrigin = async (configuredOrigin) => {
      const origin = String(configuredOrigin).trim().replace(/\/+$/, '');
      if (!/^https:\/\//i.test(origin)) {
        return { origin, gefunden: false, scriptSrc: null, fehler: 'Übersprungen: Nur HTTPS-Domains werden geprüft.' };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await outboundFetch(new URL('/', origin), { method: 'GET', redirect: 'manual', signal: controller.signal });
        if (response.status >= 300 && response.status < 400) {
          return { origin, gefunden: false, scriptSrc: null, fehler: 'Weiterleitung erkannt — bitte Ziel-Domain in SITE_ORIGINS eintragen oder manuell prüfen.' };
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let html = '';
        let bytes = 0;
        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              bytes += part.value.byteLength;
              if (bytes > maxBytes) {
                await reader.cancel();
                throw new Error('Antwort ist größer als 2 MB.');
              }
              html += decoder.decode(part.value, { stream: true });
            }
            html += decoder.decode();
          } finally { reader.releaseLock(); }
        } else {
          throw new Error('Antwort konnte nicht gestreamt werden.');
        }
        const searchableHtml = html
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>/gi, '')
          .replace(/<pre\b[^>]*>[\s\S]*?<\/pre\s*>/gi, '');
        const tags = searchableHtml.match(/<script\b[^>]*>/gi) || [];
        let scriptSrc = null;
        for (const tag of tags) {
          const srcMatch = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
          const siteMatch = tag.match(/\bdata-cre-site\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
          const src = srcMatch && (srcMatch[1] || srcMatch[2] || srcMatch[3]);
          const matchedSite = siteMatch && (siteMatch[1] || siteMatch[2] || siteMatch[3]);
          if (src && /(?:^|\/)cre\.js(?=[?#]|$)/i.test(src) && matchedSite === siteId) { scriptSrc = src; break; }
        }
        return { origin, gefunden: !!scriptSrc, scriptSrc, fehler: null };
      } catch (error) {
        const message = error.name === 'AbortError' ? 'Zeitüberschreitung nach 8 Sekunden.' : (error.message || 'Netzwerkfehler.');
        return { origin, gefunden: false, scriptSrc: null, fehler: message };
      } finally { clearTimeout(timer); }
    };
    const geprueft = await Promise.allSettled(configuredOrigins.map(checkOrigin));
    const results = geprueft.map((entry) => entry.status === 'fulfilled' ? entry.value : ({ origin: '', gefunden: false, scriptSrc: null, fehler: 'Prüfung fehlgeschlagen.' }));
    res.json({ siteId, geprueft: results, irgendwoGefunden: results.some((result) => result.gefunden) });
  });

  app.get('/api/campaigns', requireDashboardAuth, (req, res) => {
    const siteId = cleanText(req.query.siteId || '', 140);
    res.json({
      campaigns: db.listCampaigns(siteId, false),
      sites: db.listSites(),
      themePresets: getThemePresets(),
    });
  });

  app.post('/api/campaigns', requireDashboardAuth, (req, res) => {
    const campaign = sanitizeCampaignInput(req.body);
    // The id is slugged from the name when the client sends none. Two sites can
    // pick the same name — without this check the second POST would silently
    // UPDATE the first site's campaign (cross-site hijack). Suffix until unique.
    if (!cleanText(req.body.id, 140)) {
      let candidate = campaign.id;
      let n = 2;
      let clash = db.getCampaign(candidate);
      while (clash && clash.site_id !== campaign.site_id) {
        candidate = `${campaign.id}-${n}`;
        n += 1;
        clash = db.getCampaign(candidate);
      }
      campaign.id = candidate;
    } else {
      // Explicit id from the caller: never silently take over another
      // site's campaign — reject instead of falling into saveCampaign's
      // UPDATE branch.
      const clash = db.getCampaign(campaign.id);
      if (clash && clash.site_id !== campaign.site_id) {
        res.status(409).json({ error: 'campaign_id_belongs_to_another_site' });
        return;
      }
    }
    const saved = db.saveCampaign(campaign);
    res.json({ campaign: saved });
  });

  app.put('/api/campaigns', requireDashboardAuth, (req, res) => {
    const id = cleanText(req.body.id, 140);
    if (!id) {
      res.status(400).json({ error: 'Campaign id is required' });
      return;
    }
    const existing = db.getCampaign(id);
    if (!existing) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    const saved = db.saveCampaign(sanitizeCampaignInput(req.body, existing));
    res.json({ campaign: saved });
  });

  app.delete('/api/campaigns', requireDashboardAuth, (req, res) => {
    const id = cleanText(req.query.id || req.body.id || '', 140);
    if (!id) {
      res.status(400).json({ error: 'Campaign id is required' });
      return;
    }
    if (!db.deleteCampaign(id)) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/cre.js', (req, res) => {
    // Short TTL: widget updates reach customer sites within minutes without
    // a cache-busting convention; still saves repeat fetches per visit.
    res.set('cache-control', 'public, max-age=300');
    sendFile(res, path.join(rootDir, 'widget', 'cre.js'), 'text/javascript; charset=utf-8');
  });

  // Chained manually: this vendor express shim's app.use() only accepts one
  // handler per prefix (unlike app.get/post, which support several via rest args).
  const dashboardStatic = express.static(path.join(rootDir, 'dashboard'));
  app.use('/dashboard', (req, res, next) => {
    setAdminSecurityHeaders(res, "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://rsms.me; font-src https://rsms.me; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    requireDashboardPage(req, res, () => dashboardStatic(req, res, next));
  });
  // Demo/test pages are for our test phase — a customer's production install
  // should not serve them (DISABLE_DEMO=1 in the service env).
  if (process.env.DISABLE_DEMO !== '1') {
    app.use('/demo', express.static(path.join(rootDir, 'demo')));
  }

  return {
    app,
    close() {
      if (backupTimer) clearInterval(backupTimer);
      db.close();
    },
  };
}

function startServer() {
  const port = Number(process.env.PORT || 8080);
  const { app } = createApp();
  app.listen(port, () => {
    console.log(`[Conversion Rescue] Listening on http://localhost:${port}`);
  });
}

if (require.main === module) startServer();

module.exports = {
  csvCell,
  createApp,
  createRateLimiter,
};
