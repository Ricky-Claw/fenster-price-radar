// HTTP-Empfänger für Metas Leadgen-Webhook (DFS Meta-Ads Instant Forms).
// GET  = Meta-Verifizierungs-Handshake (hub.challenge).
// POST = Signatur und Payload prüfen, dann Leadgen-Änderungen verarbeiten.
// Setup: docs/kampagne-meta-foerderheld.md Abschnitt 6a.
import crypto from 'node:crypto';
import { processLeadgenChange } from '../src/leads/metaLeadgen.js';

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
