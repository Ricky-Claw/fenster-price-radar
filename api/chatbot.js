import { answerFenstershopChatbotWithLlm, chunkKnowledgeText } from '../src/chatbot/fenstershopChatbot.js';
import { createRateLimiter } from '../src/aufmass/rateLimit.js';
import { cookieValue, safeEqual, validSession } from '../src/auth/session.js';

// Der Chatbot nutzt GPT-5.6 Luna mit Claude als Ausweichpfad. Drosselung,
// Body-Cap und eine feste Standard-Herkunft schützen den öffentlichen Endpunkt.
const BODY_MAX_BYTES = 131072;
const MESSAGE_MAX_CHARS = 2000;
const KNOWLEDGE_MAX_FILES = 3;
const KNOWLEDGE_MAX_CHARS = 30000;

// Sitzungs-Wissen von der Testseite: kommt pro Request mit, wird nie gespeichert.
// Serverless ist zur Laufzeit read-only — dauerhaftes Wissen geht über knowledge/ im Repo.
function extraChunksFromBody(body) {
  const files = Array.isArray(body.knowledge) ? body.knowledge.slice(0, KNOWLEDGE_MAX_FILES) : [];
  const chunks = [];
  for (const file of files) {
    const content = String(file?.content || '').slice(0, KNOWLEDGE_MAX_CHARS);
    chunks.push(...chunkKnowledgeText(content, {
      fallbackHeading: 'Hochgeladenes Wissen',
      url: 'upload:knowledge',
      sourceType: 'upload',
    }));
  }
  return chunks;
}
const ALLOW_ORIGIN = process.env.CHATBOT_ALLOW_ORIGIN || 'https://deutscher-fenstershop.de';
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

function mayUploadKnowledge(req) {
  if (validSession(cookieValue(req.headers?.cookie || '', 'fenster_radar_session'))) return true;
  const expected = process.env.CHATBOT_KNOWLEDGE_TOKEN || '';
  const provided = firstHeaderValue(req.headers?.['x-knowledge-token']);
  return Boolean(expected) && safeEqual(provided || '', expected);
}

export default async function handler(req, res) {
  res.setHeader?.('access-control-allow-origin', ALLOW_ORIGIN);
  if (req.method === 'OPTIONS') {
    res.setHeader?.('access-control-allow-methods', 'POST,GET,OPTIONS');
    res.setHeader?.('access-control-allow-headers', 'content-type, x-knowledge-token');
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
    // turn = wievielte Nutzer-Nachricht in dieser Sitzung (vom Widget mitgezählt, Server ist stateless).
    // Ab turn>=3 muss die Antwort verbindlich an die richtige Abteilung leiten (Telefon/Mail).
    const turn = Math.max(0, Math.min(999, Number.parseInt(body.turn, 10) || 0));
    const extraChunks = mayUploadKnowledge(req) ? extraChunksFromBody(body) : [];
    const answer = await answerFenstershopChatbotWithLlm({ message, extraChunks, turn });
    const hasValidSession = validSession(cookieValue(req.headers?.cookie || '', 'fenster_radar_session'));
    if (!hasValidSession && answer.llm && Object.hasOwn(answer.llm, 'attempts')) {
      const { attempts, ...publicLlm } = answer.llm;
      answer.llm = publicLlm;
    }
    return sendJson(res, 200, answer);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: 'invalid_request', message: error.message });
  }
}
