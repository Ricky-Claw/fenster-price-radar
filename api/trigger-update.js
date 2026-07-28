import { cookieValue, validSession } from '../src/auth/session.js';

const COOKIE = 'fenster_radar_session';
const DEFAULT_TRIGGER_URL = 'https://srv1332950.hstgr.cloud/fpr';
const TIMEOUT_MS = 10000;

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(payload));
}

function endpoint(base, path) {
  return `${String(base || DEFAULT_TRIGGER_URL).replace(/\/+$/, '')}/${path}`;
}

function triggerBase() {
  const raw = process.env.FPR_TRIGGER_URL || DEFAULT_TRIGGER_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.hstgr.cloud')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchUpstream(url, method, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!response.ok) throw new Error('upstream_not_ok');
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTrigger(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.started !== 'boolean' || typeof body.running !== 'boolean') return null;
  const normalized = { started: body.started, running: body.running };
  if (typeof body.reason === 'string') normalized.reason = body.reason;
  return normalized;
}

function stringOrNull(value) {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStatus(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.running !== 'boolean') return null;
  return {
    running: body.running,
    startedAt: stringOrNull(body.startedAt),
    finishedAt: stringOrNull(body.finishedAt),
    lastExit: numberOrNull(body.lastExit),
    dataGeneratedAt: stringOrNull(body.dataGeneratedAt)
  };
}

export default async function handler(req, res) {
  if (!validSession(cookieValue(req.headers.cookie || '', COOKIE))) return json(res, 401, { ok: false, error: 'unauthorized' });

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'method_not_allowed' }, { allow: 'GET, POST' });
  }

  const token = process.env.FPR_TRIGGER_TOKEN || '';
  if (!token) return json(res, 503, { ok: false, error: 'trigger_not_configured' });

  const base = triggerBase();
  if (!base) return json(res, 500, { ok: false, error: 'trigger_misconfigured' });

  if (req.method === 'POST') {
    try {
      const body = normalizeTrigger(await fetchUpstream(endpoint(base, 'trigger'), 'POST', token));
      if (!body) throw new Error('invalid_trigger_response');
      return json(res, 200, body);
    } catch {
      return json(res, 502, { ok: false, error: 'trigger_unreachable' });
    }
  }

  if (req.method === 'GET') {
    try {
      const body = normalizeStatus(await fetchUpstream(endpoint(base, 'status'), 'GET', token));
      if (!body) throw new Error('invalid_status_response');
      return json(res, 200, body);
    } catch {
      return json(res, 502, { ok: false, error: 'status_unreachable' });
    }
  }
}
