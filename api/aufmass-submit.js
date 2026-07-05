import { createRateLimiter } from '../src/aufmass/rateLimit.js';
import { normalizeWindowList, MAX_WINDOWS } from '../src/aufmass/normalizeWindows.js';

const BODY_MAX_BYTES = 65536;
const ALLOW_ORIGIN = process.env.AUFMASS_ALLOW_ORIGIN || '';
const WEBHOOK_URL = process.env.AUFMASS_TICKET_WEBHOOK || '';
const rateLimiter = createRateLimiter({
  windowMs: Number(process.env.AUFMASS_SUBMIT_RL_WINDOW_MS) || 60000,
  maxPerKey: Number(process.env.AUFMASS_SUBMIT_RL_MAX_PER_IP) || 5,
  maxGlobal: Number(process.env.AUFMASS_SUBMIT_RL_MAX_GLOBAL) || 30,
});

function sendJson(res, status, payload) {
  res.setHeader?.('content-type', 'application/json; charset=utf-8');
  res.setHeader?.('cache-control', 'no-store');
  if (typeof res.status === 'function') return res.status(status).json(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  return res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

async function readBody(req) {
  // Already-parsed object bodies still count against the same serialized request cap.
  if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > BODY_MAX_BYTES) throw new Error('request_too_large');
    return req.body;
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > BODY_MAX_BYTES) throw new Error('request_too_large');
    return JSON.parse(req.body || '{}');
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
  return raw.trim() ? JSON.parse(raw) : {};
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function clientIp(req) {
  const headers = req?.headers || {};
  const vercelForwardedFor = firstHeaderValue(headers['x-vercel-forwarded-for']);
  if (typeof vercelForwardedFor === 'string') {
    const firstVercelForwardedIp = vercelForwardedFor.split(',')[0]?.trim();
    if (firstVercelForwardedIp) return firstVercelForwardedIp;
  }

  const realIp = firstHeaderValue(headers['x-real-ip']);
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

  const forwardedFor = firstHeaderValue(headers['x-forwarded-for']);
  if (typeof forwardedFor === 'string') {
    const forwardedIps = forwardedFor.split(',');
    const lastForwardedIp = forwardedIps[forwardedIps.length - 1]?.trim();
    if (lastForwardedIp) return lastForwardedIp;
  }

  return 'unknown';
}

function fallbackId(payload, submittedAt) {
  const input = JSON.stringify({ payload, submittedAt });
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, '0').slice(0, 8);
}

function makeReference(payload, submittedAt) {
  const datePart = submittedAt.slice(0, 10).replace(/-/g, '');
  const cryptoApi = globalThis.crypto;
  const id = cryptoApi && typeof cryptoApi.randomUUID === 'function'
    ? cryptoApi.randomUUID().slice(0, 8)
    : fallbackId(payload, submittedAt);
  return `AUF-${datePart}-${id}`;
}

export default async function handler(req, res) {
  if (ALLOW_ORIGIN) res.setHeader?.('access-control-allow-origin', ALLOW_ORIGIN);
  if (req.method === 'OPTIONS') {
    if (ALLOW_ORIGIN) {
      res.setHeader?.('access-control-allow-methods', 'POST,GET,OPTIONS');
      res.setHeader?.('access-control-allow-headers', 'content-type');
    }
    return sendJson(res, 204, '');
  }
  if (req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'aufmass-submit', configured: WEBHOOK_URL !== '' });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

  const rl = rateLimiter.check(clientIp(req));
  if (!rl.allowed) {
    res.setHeader?.('retry-after', String(rl.retryAfterSeconds));
    return sendJson(res, 429, {
      ok: false,
      error: 'rate_limited',
      message: 'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.',
    });
  }

  try {
    const body = await readBody(req);
    if (!Array.isArray(body.windows) || body.windows.length === 0) {
      return sendJson(res, 400, { ok: false, error: 'empty_list', message: 'Keine Fenster zum Absenden.' });
    }

    const windows = normalizeWindowList(body.windows);
    if (windows.length === 0) {
      return sendJson(res, 400, { ok: false, error: 'empty_list', message: 'Keine Fenster zum Absenden.' });
    }

    const note = String(body.note || '').slice(0, 2000);
    const submittedAt = new Date().toISOString();
    const reference = makeReference({ windows, note, maxWindows: MAX_WINDOWS }, submittedAt);
    const outbound = { reference, submittedAt, windowCount: windows.length, windows, note };

    let forwarded = false;
    // WEBHOOK_URL comes only from our own env, not user input, so this is not an SSRF vector.
    // Do not accept a destination URL from the request body.
    if (WEBHOOK_URL) {
      let timer;
      try {
        const controller = new AbortController();
        timer = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(outbound),
          signal: controller.signal,
        });
        forwarded = resp.ok;
      } catch (e) {
        forwarded = false;
        console.error('[aufmass-submit] webhook forward failed', e && e.message ? e.message : e);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    console.log('[aufmass-submit]', reference, 'windows=' + windows.length, 'forwarded=' + forwarded);
    return sendJson(res, 200, { ok: true, reference, forwarded, windowCount: windows.length });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return sendJson(res, 400, { ok: false, error: 'invalid_json', message: 'Ungueltiges JSON im Anfrage-Body.' });
    }
    if (error?.message === 'request_too_large') {
      return sendJson(res, 413, { ok: false, error: 'request_too_large', message: 'Anfrage zu gross.' });
    }
    console.error('[aufmass-submit] request failed', error);
    return sendJson(res, 400, { ok: false, error: 'invalid_request', message: 'Anfrage konnte nicht verarbeitet werden.' });
  }
}
