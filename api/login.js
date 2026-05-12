import crypto from 'node:crypto';

const COOKIE = 'fenster_radar_session';
const DAY = 24 * 60 * 60;

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}
function secret() { return process.env.FENSTER_RADAR_AUTH_SECRET || process.env.FENSTER_RADAR_PASSWORD || ''; }
function expectedPassword() { return process.env.FENSTER_RADAR_PASSWORD || ''; }
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('base64url'); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (!expectedPassword() || !secret()) return json(res, 503, { ok: false, error: 'login_not_configured' });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
  if (String(body.password || '') !== expectedPassword()) return json(res, 401, { ok: false, error: 'invalid_password' });
  const expires = Math.floor(Date.now() / 1000) + DAY;
  const payload = `v1.${expires}`;
  const cookie = `${payload}.${sign(payload)}`;
  return json(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=${cookie}; Path=/; Max-Age=${DAY}; HttpOnly; SameSite=Lax; Secure` });
}
