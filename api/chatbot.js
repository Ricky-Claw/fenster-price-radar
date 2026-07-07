import { answerFenstershopChatbotWithLlm, chunkKnowledgeText } from '../src/chatbot/fenstershopChatbot.js';
import { createRateLimiter } from '../src/aufmass/rateLimit.js';

// Der Chatbot ruft bezahlte LLMs (Nemotron/Moonshot). Ohne Drossel + Body-Cap
// koennte jeder die Kosten hochtreiben. Gleiche Schutzschicht wie api/aufmass.js.
// CORS bleibt offen (Widget ist auf der Shop-Domain eingebettet) — per
// CHATBOT_ALLOW_ORIGIN auf eine feste Herkunft verschaerfbar.
const BODY_MAX_BYTES = 131072;
const MESSAGE_MAX_CHARS = 2000;
const KNOWLEDGE_MAX_FILES = 3;
const KNOWLEDGE_MAX_CHARS = 30000;
const KNOWLEDGE_NAME_MAX = 100;

// Sitzungs-Wissen von der Testseite: kommt pro Request mit, wird nie gespeichert.
// Serverless ist zur Laufzeit read-only — dauerhaftes Wissen geht über knowledge/ im Repo.
function extraChunksFromBody(body) {
  const files = Array.isArray(body.knowledge) ? body.knowledge.slice(0, KNOWLEDGE_MAX_FILES) : [];
  const chunks = [];
  for (const file of files) {
    const name = String(file?.name || 'upload.md').slice(0, KNOWLEDGE_NAME_MAX);
    const content = String(file?.content || '').slice(0, KNOWLEDGE_MAX_CHARS);
    chunks.push(...chunkKnowledgeText(content, {
      fallbackHeading: name.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' '),
      url: `upload:${name}`,
      sourceType: 'upload',
    }));
  }
  return chunks;
}
const ALLOW_ORIGIN = process.env.CHATBOT_ALLOW_ORIGIN || '*';
const rateLimiter = createRateLimiter({
  windowMs: Number(process.env.CHATBOT_RL_WINDOW_MS) || 60000,
  maxPerKey: Number(process.env.CHATBOT_RL_MAX_PER_IP) || 12,
  maxGlobal: Number(process.env.CHATBOT_RL_MAX_GLOBAL) || 80,
});

function sendJson(res, status, payload) {
  res.setHeader?.('content-type', 'application/json; charset=utf-8');
  res.setHeader?.('cache-control', 'no-store');
  if (typeof res.status === 'function') return res.status(status).json(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  return res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

async function readBody(req) {
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

export default async function handler(req, res) {
  res.setHeader?.('access-control-allow-origin', ALLOW_ORIGIN);
  if (req.method === 'OPTIONS') {
    res.setHeader?.('access-control-allow-methods', 'POST,GET,OPTIONS');
    res.setHeader?.('access-control-allow-headers', 'content-type');
    return sendJson(res, 204, '');
  }
  if (req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'janela', mode: 'rule-first-rag-mvp' });
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
    const message = String(body.message || body.question || body.text || '').slice(0, MESSAGE_MAX_CHARS);
    return sendJson(res, 200, await answerFenstershopChatbotWithLlm({ message, extraChunks: extraChunksFromBody(body) }));
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: 'invalid_request', message: error.message });
  }
}
