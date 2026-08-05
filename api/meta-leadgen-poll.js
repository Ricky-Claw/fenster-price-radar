// Polling-Fallback, weil Metas Leadgen-Webhook bei Standard Access keine echten Kunden-Leads liefert.
// Trigger: VPS-Cron auf nexus-host per curl (Muster wie Weekly-Update).
// Runbook: docs/kampagne-meta-foerderheld.md, Abschnitt 6a.
import crypto from 'node:crypto';
import {
  pollOnce,
} from '../src/leads/metaLeadgen.js';

const PROCESSING_BUDGET_MS = 20000;

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function tokenOk(header, expected) {
  const match = String(header || '').match(/^Bearer\s+(\S+)$/i);
  if (!match) return false;
  const actualDigest = crypto.createHash('sha256').update(match[1]).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function lookbackHours(req) {
  const configured = Number(process.env.META_POLL_LOOKBACK_HOURS);
  const fallback = Number.isFinite(configured) && configured > 0 ? configured : 6;
  const override = Number(req.query?.hours);
  const hours = Number.isFinite(override) && override > 0 ? override : fallback;
  return Math.min(720, Math.max(1, hours));
}

function log(result) {
  console.log('[meta-leadgen-poll]', JSON.stringify(result));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    json(res, 503, { error: 'CONFIG_MISSING' });
    return;
  }
  if (!tokenOk(req.headers?.authorization, secret)) {
    json(res, 401, { error: 'UNAUTHORIZED' });
    return;
  }

  const dry = String(req.query?.dry || '') === '1';
  const result = await pollOnce({
    dry,
    lookbackHours: lookbackHours(req),
    processingBudgetMs: PROCESSING_BUDGET_MS,
  });

  const status = result.error || (result.attempted > 0 && result.forwarded === 0) ? 502 : 200;
  log(result);
  json(res, status, result);
}
