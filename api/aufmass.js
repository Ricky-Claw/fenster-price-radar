import { extractWindows } from '../src/aufmass/extractWindows.js';
import { normalizeWindowList, TRANSCRIPT_MAX } from '../src/aufmass/normalizeWindows.js';

const BODY_MAX_BYTES = 65536;
const ALLOW_ORIGIN = process.env.AUFMASS_ALLOW_ORIGIN || '';

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

export default async function handler(req, res) {
  if (ALLOW_ORIGIN) res.setHeader?.('access-control-allow-origin', ALLOW_ORIGIN);
  if (req.method === 'OPTIONS') {
    if (ALLOW_ORIGIN) {
      res.setHeader?.('access-control-allow-methods', 'POST,GET,OPTIONS');
      res.setHeader?.('access-control-allow-headers', 'content-type');
    }
    return sendJson(res, 204, '');
  }
  if (req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'aufmass' });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  try {
    const body = await readBody(req);
    let transcript = String(body.transcript || body.text || '').trim();
    if (!transcript) {
      return sendJson(res, 400, {
        ok: false,
        error: 'empty_transcript',
        message: 'Bitte zuerst die Fensterliste eindiktieren oder einfuegen.',
      });
    }

    const truncated = transcript.length > TRANSCRIPT_MAX;
    if (truncated) transcript = transcript.slice(0, TRANSCRIPT_MAX);
    const raw = await extractWindows({ transcript });
    const windows = normalizeWindowList(raw?.windows);
    const model = raw?.model || null;
    return sendJson(res, 200, {
      ok: true,
      source: raw ? 'llm' : 'empty',
      windows,
      meta: {
        transcriptChars: transcript.length,
        transcriptTruncated: truncated,
        windowCount: windows.length,
        uncertainCount: windows.filter((windowItem) => windowItem.needsReview).length,
        model,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return sendJson(res, 400, { ok: false, error: 'invalid_json', message: 'Ungueltiges JSON im Anfrage-Body.' });
    }
    if (error?.message === 'request_too_large') {
      return sendJson(res, 413, { ok: false, error: 'request_too_large', message: 'Anfrage zu gross.' });
    }
    console.error('[aufmass] request failed', error);
    return sendJson(res, 400, { ok: false, error: 'invalid_request', message: 'Anfrage konnte nicht verarbeitet werden.' });
  }
}
