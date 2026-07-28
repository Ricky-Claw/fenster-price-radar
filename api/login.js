import { safeEqualSecret, sign } from '../src/auth/session.js';

const COOKIE = 'fenster_radar_session';
const DAY = 24 * 60 * 60;
const BODY_MAX_BYTES = 16384;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_KEY = 5;
const MAX_FAILURES_GLOBAL = 500;
const failuresByKey = new Map();
const globalFailures = [];

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}
function secret() { return process.env.FENSTER_RADAR_AUTH_SECRET || process.env.FENSTER_RADAR_PASSWORD || ''; }
function expectedPassword() { return process.env.FENSTER_RADAR_PASSWORD || ''; }
function firstHeaderValue(value) { return Array.isArray(value) ? value[0] : value; }
function clientIp(req) {
  const headers = req?.headers || {};
  const vercel = firstHeaderValue(headers['x-vercel-forwarded-for']);
  if (typeof vercel === 'string' && vercel.split(',')[0]?.trim()) return vercel.split(',')[0].trim();
  const real = firstHeaderValue(headers['x-real-ip']);
  if (typeof real === 'string' && real.trim()) return real.trim();
  const forwarded = firstHeaderValue(headers['x-forwarded-for']);
  if (typeof forwarded === 'string' && forwarded.split(',').at(-1)?.trim()) return forwarded.split(',').at(-1).trim();
  return 'unknown';
}
function pruneFailures(failures, cutoff) {
  while (failures.length && failures[0] <= cutoff) failures.shift();
}
function failureLimit(key, record = false) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  pruneFailures(globalFailures, cutoff);
  const failures = failuresByKey.get(key) || [];
  pruneFailures(failures, cutoff);
  if (!failures.length) failuresByKey.delete(key);
  const blockedFailures = globalFailures.length >= MAX_FAILURES_GLOBAL ? globalFailures : failures;
  const blocked = globalFailures.length >= MAX_FAILURES_GLOBAL || failures.length >= MAX_FAILURES_PER_KEY;
  if (blocked) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedFailures[0] + RATE_LIMIT_WINDOW_MS - now) / 1000)),
    };
  }
  if (record) {
    failures.push(now);
    globalFailures.push(now);
    failuresByKey.set(key, failures);
  }
  return { allowed: true };
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
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const ip = clientIp(req);
  const rl = failureLimit(ip);
  if (!rl.allowed) return json(res, 429, { ok: false, error: 'rate_limited' }, { 'retry-after': String(rl.retryAfterSeconds) });
  if (!expectedPassword() || !secret()) return json(res, 503, { ok: false, error: 'login_not_configured' });
  let body = {};
  try { body = await readBody(req); } catch (error) {
    if (error.message === 'request_too_large') return json(res, 413, { ok: false, error: 'request_too_large' });
    return json(res, 400, { ok: false, error: 'invalid_request' });
  }
  if (!safeEqualSecret(String(body.password || ''), expectedPassword())) {
    failureLimit(ip, true);
    return json(res, 401, { ok: false, error: 'invalid_password' });
  }
  const expires = Math.floor(Date.now() / 1000) + DAY;
  const payload = `v1.${expires}`;
  const cookie = `${payload}.${sign(payload)}`;
  return json(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=${cookie}; Path=/; Max-Age=${DAY}; HttpOnly; SameSite=Lax; Secure` });
}
