// Echtzeit-Empfänger für Metas Leadgen-Webhook (DFS Meta-Ads Instant Forms).
// GET  = Meta-Verifizierungs-Handshake (hub.challenge).
// POST = Meta meldet neue Lead-IDs (kein Klartext) -> wir holen den vollen
//        Datensatz per Graph API und reichen ihn an die Schwarzwald-Route
//        /api/leads/dfs-meta weiter (CRM-Eintrag + Mail + Push).
// Setup: docs/kampagne-meta-foerderheld.md Abschnitt 6a.
import crypto from 'node:crypto';

const GRAPH_VERSION = 'v21.0';
const DFS_PAGE_ID = '1192875973914275';
const FORWARD_TIMEOUT_MS = 10000;

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function signatureOk(rawBody, header) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  const match = String(header || '').match(/^sha256=([0-9a-f]{64})$/i);
  if (!match) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(match[1].toLowerCase(), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function graph(path, token, params = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function pageAccessToken() {
  const systemToken = process.env.META_ACCESS_TOKEN;
  if (!systemToken) throw new Error('META_ACCESS_TOKEN fehlt');
  const r = await graph(DFS_PAGE_ID, systemToken, { fields: 'access_token' });
  if (r.error || !r.access_token) throw new Error(`Page-Token-Abruf fehlgeschlagen: ${r.error?.message || 'unbekannt'}`);
  return r.access_token;
}

function fieldValues(lead) {
  const out = {};
  for (const f of lead.field_data || []) {
    const key = String(f.name || '').toLowerCase();
    out[key] = Array.isArray(f.values) ? f.values[0] : f.values;
  }
  return out;
}

function mapLeadToDfsMetaBody(lead, formName) {
  const fields = fieldValues(lead);
  const fullName =
    fields.full_name ||
    [fields.first_name, fields.last_name].filter(Boolean).join(' ') ||
    undefined;
  return {
    metaLeadId: lead.id,
    formName: formName || undefined,
    fullName,
    email: fields.email,
    phone: fields.phone_number,
    postCode: fields.post_code,
    hasFensterliste:
      fields['haben_sie_schon_eine_fensterliste_oder_einen_sanierungsplan?'] ||
      undefined,
    windowCount: fields['wie_viele_fenster_planen_sie_zu_tauschen?'] || undefined,
    submittedAt: lead.created_time,
  };
}

async function forwardToSchwarzwald(body) {
  const url = process.env.DFS_META_INTAKE_URL || 'https://schwarzwald-agent.de/api/leads/dfs-meta';
  const token = process.env.DFS_META_LEAD_TOKEN;
  if (!token) throw new Error('DFS_META_LEAD_TOKEN fehlt');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function processLeadgenChange(change) {
  const leadgenId = change?.value?.leadgen_id;
  const formId = change?.value?.form_id;
  if (!leadgenId) return { skipped: 'no_leadgen_id' };

  const token = await pageAccessToken();
  const lead = await graph(leadgenId, token, { fields: 'id,created_time,field_data,form_id' });
  if (lead.error) return { skipped: 'graph_error', detail: lead.error.message };

  let formName;
  if (formId) {
    const form = await graph(formId, token, { fields: 'name' });
    formName = form.name;
  }

  const body = mapLeadToDfsMetaBody(lead, formName);
  const forwarded = await forwardToSchwarzwald(body);
  return { leadgenId, forwarded: forwarded.status, dedupe: forwarded.data?.dedupe };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && expected && token === expected) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(String(challenge || ''));
      return;
    }
    json(res, 403, { error: 'verify_failed' });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    json(res, 400, { error: 'body_read_failed' });
    return;
  }

  if (!signatureOk(rawBody, req.headers['x-hub-signature-256'])) {
    json(res, 401, { error: 'bad_signature' });
    return;
  }

  let payload;
  try {
    payload = rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    json(res, 400, { error: 'invalid_json' });
    return;
  }

  // Wichtig: Vercel kann die Function nach res.end() einfrieren, bevor
  // ausstehende Promises weiterlaufen — Verarbeitung deshalb VOR der Antwort
  // abschließen, nicht danach. Meta toleriert bis zu ~20s.
  const results = [];
  try {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change.field !== 'leadgen') continue;
        const result = await processLeadgenChange(change);
        console.log('[meta-leadgen-webhook]', JSON.stringify(result));
        results.push(result);
      }
    }
  } catch (err) {
    console.error('[meta-leadgen-webhook] Verarbeitung fehlgeschlagen:', err.message);
  }

  json(res, 200, { received: true, results });
}
