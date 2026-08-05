// Polling-Fallback, weil Metas Leadgen-Webhook bei Standard Access keine echten Kunden-Leads liefert.
// Trigger: VPS-Cron auf nexus-host per curl (Muster wie Weekly-Update).
// Runbook: docs/kampagne-meta-foerderheld.md, Abschnitt 6a.
import crypto from 'node:crypto';
import {
  DFS_PAGE_ID,
  graph,
  pageAccessToken,
  processLeadgenChange,
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
  const startedAt = Date.now();
  const cutoff = startedAt - lookbackHours(req) * 60 * 60 * 1000;
  const result = {
    ok: true,
    dry,
    formsChecked: 0,
    leadsSeen: 0,
    eligible: 0,
    attempted: 0,
    forwarded: 0,
    created: 0,
    skipped: 0,
    truncated: false,
    errors: [],
  };

  let token;
  try {
    token = await pageAccessToken();
  } catch {
    const failure = { ok: false, error: 'GRAPH_AUTH_FAILED' };
    log(failure);
    json(res, 502, failure);
    return;
  }

  let forms;
  try {
    const response = await graph(`${DFS_PAGE_ID}/leadgen_forms`, token, {
      fields: 'id,name,status',
      limit: '50',
    });
    if (response.error) throw new Error('graph_error');
    if (!Array.isArray(response.data)) throw new Error('graph_shape');
    forms = response.data.filter((form) => form.status === 'ACTIVE');
  } catch {
    const failure = { ok: false, error: 'GRAPH_LIST_FAILED' };
    log(failure);
    json(res, 502, failure);
    return;
  }

  for (const form of forms) {
    if (Date.now() - startedAt >= PROCESSING_BUDGET_MS) {
      result.truncated = true;
      break;
    }
    result.formsChecked += 1;

    let leads;
    try {
      const response = await graph(`${form.id}/leads`, token, {
        fields: 'id,created_time',
        limit: '25',
      });
      if (response.error) throw new Error('graph_error');
      leads = Array.isArray(response.data) ? response.data : [];
    } catch {
      result.errors.push({ formId: form.id, grund: 'leads_list_failed' });
      continue;
    }

    result.leadsSeen += leads.length;
    for (const lead of leads) {
      if (Date.now() - startedAt >= PROCESSING_BUDGET_MS) {
        result.truncated = true;
        break;
      }
      if (Date.parse(lead.created_time) < cutoff) continue;
      result.eligible += 1;
      if (dry) continue;
      result.attempted += 1;

      try {
        const processed = await processLeadgenChange({
          value: { leadgen_id: lead.id, form_id: form.id },
        });
        if (processed.skipped) {
          result.errors.push({ leadId: lead.id, formId: form.id, grund: processed.skipped });
        } else if (processed.forwarded >= 200 && processed.forwarded <= 299) {
          result.forwarded += 1;
          if (processed.dedupe === 'created') result.created += 1;
          else if (processed.dedupe === 'skipped') result.skipped += 1;
          else result.errors.push({ leadId: lead.id, formId: form.id, grund: 'dedupe_unbekannt' });
        } else {
          result.errors.push({ leadId: lead.id, formId: form.id, grund: `forward_${processed.forwarded}` });
        }
      } catch {
        result.errors.push({ leadId: lead.id, formId: form.id, grund: 'exception' });
      }
    }
    if (result.truncated) break;
  }

  const status = result.attempted > 0 && result.forwarded === 0 ? 502 : 200;
  result.ok = result.errors.length === 0;
  log(result);
  json(res, status, result);
}
