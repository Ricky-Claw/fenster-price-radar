import { answerFenstershopChatbotWithLlm } from '../src/chatbot/fenstershopChatbot.js';

function sendJson(res, status, payload) {
  res.setHeader?.('content-type', 'application/json; charset=utf-8');
  res.setHeader?.('cache-control', 'no-store');
  if (typeof res.status === 'function') return res.status(status).json(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  return res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  res.setHeader?.('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader?.('access-control-allow-methods', 'POST,GET,OPTIONS');
    res.setHeader?.('access-control-allow-headers', 'content-type');
    return sendJson(res, 204, '');
  }
  if (req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'janela', mode: 'rule-first-rag-mvp' });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  try {
    const body = await readBody(req);
    const message = body.message || body.question || body.text || '';
    return sendJson(res, 200, await answerFenstershopChatbotWithLlm({ message }));
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: 'invalid_request', message: error.message });
  }
}
