export const GRAPH_VERSION = 'v21.0';
export const DFS_PAGE_ID = '1192875973914275';
const FORWARD_TIMEOUT_MS = 10000;

const FORM_LABELS = {
  '1770519120792722': 'Formular 1',
  '1691921855402106': 'Formular 2',
  '2255693698516004': 'Formular 1 (alt)',
  '1693914745167295': 'Formular 2 (alt)',
  '1767645384579656': 'Formular 3 (alt)',
};

const ANTWORT_LABELS = {
  ja_liegt_vor: 'Ja, liegt vor',
  'ja,_liegt_vor': 'Ja, liegt vor',
  in_arbeit: 'In Arbeit',
  nein_ich_brauche_hilfe: 'Nein — ich brauche Hilfe bei der Planung',
  'nein_—_ich_brauche_hilfe_bei_der_planung': 'Nein — ich brauche Hilfe bei der Planung',
  '1_2': '1–2 Fenster',
  '3_5': '3–5 Fenster',
  mehr_als_5: 'Mehr als 5 Fenster',
};

function antwortLabel(rohwert) {
  if (rohwert === undefined || rohwert === null) return undefined;
  const wert = String(rohwert);
  const fallback = wert.replaceAll('_', ' ');
  return ANTWORT_LABELS[wert] || fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

export async function graph(path, token, params = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function pageAccessToken() {
  const systemToken = process.env.META_ACCESS_TOKEN;
  if (!systemToken) throw new Error('META_ACCESS_TOKEN fehlt');
  const r = await graph(DFS_PAGE_ID, systemToken, { fields: 'access_token' });
  if (r.error || !r.access_token) throw new Error(`Page-Token-Abruf fehlgeschlagen: ${r.error?.message || 'unbekannt'}`);
  return r.access_token;
}

export function fieldValues(lead) {
  const out = {};
  for (const f of lead.field_data || []) {
    const key = String(f.name || '').toLowerCase();
    out[key] = Array.isArray(f.values) ? f.values[0] : f.values;
  }
  return out;
}

export function mapLeadToDfsMetaBody(lead, formName) {
  const fields = fieldValues(lead);
  const fullName =
    fields.full_name ||
    [fields.first_name, fields.last_name].filter(Boolean).join(' ') ||
    undefined;
  const hasFensterliste =
    fields['haben_sie_schon_eine_fensterliste_oder_einen_sanierungsplan'] ||
    fields['haben_sie_schon_eine_fensterliste_oder_einen_sanierungsplan?'] ||
    undefined;
  const windowCount =
    fields['anzahl_fenster'] ||
    fields['wie_viele_fenster_planen_sie_zu_tauschen'] ||
    fields['wie_viele_fenster_planen_sie_zu_tauschen?'] ||
    undefined;
  return {
    metaLeadId: lead.id,
    formName: FORM_LABELS[String(lead.form_id)] || formName || undefined,
    fullName,
    email: fields.email,
    phone: fields.phone_number,
    postCode: fields.post_code,
    hasFensterliste: antwortLabel(hasFensterliste),
    windowCount: antwortLabel(windowCount),
    submittedAt: lead.created_time,
  };
}

export async function forwardToSchwarzwald(body) {
  const url = process.env.DFS_META_INTAKE_URL || 'https://schwarzwald-agent.de/api/leads/dfs-meta';
  const token = process.env.DFS_META_LEAD_TOKEN;
  if (!token) throw new Error('DFS_META_LEAD_TOKEN fehlt');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

export async function processLeadgenChange(change) {
  const leadgenId = change?.value?.leadgen_id;
  const formId = change?.value?.form_id;
  if (!leadgenId) return { skipped: 'no_leadgen_id' };

  const token = await pageAccessToken();
  const lead = await graph(leadgenId, token, { fields: 'id,created_time,field_data,form_id' });
  if (lead.error) return { skipped: 'graph_error', detail: lead.error.message };

  let formName;
  if (formId) {
    const form = await graph(formId, token, { fields: 'name' });
    formName = form.name;
  }

  const body = mapLeadToDfsMetaBody(lead, formName);
  const forwarded = await forwardToSchwarzwald(body);
  const replayed = typeof forwarded.data?.replayed === 'boolean'
    ? forwarded.data.replayed
    : undefined;
  const dedupe = forwarded.data?.dedupe
    || (replayed === true ? 'skipped' : replayed === false ? 'created' : undefined);
  return {
    leadgenId,
    forwarded: forwarded.status,
    dedupe,
    delivery: forwarded.data?.delivery,
    mailed: forwarded.data?.mailed,
    delivered: forwarded.data?.delivered,
  };
}

export async function pollOnce({
  dry = false,
  lookbackHours = 6,
  processingBudgetMs = Infinity,
  now = Date.now,
  graphFn = graph,
  pageAccessTokenFn = pageAccessToken,
  processLeadgenChangeFn = processLeadgenChange,
} = {}) {
  const startedAt = now();
  const cutoff = startedAt - lookbackHours * 60 * 60 * 1000;
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
    token = await pageAccessTokenFn();
  } catch {
    return { ok: false, error: 'GRAPH_AUTH_FAILED' };
  }

  let forms;
  try {
    const response = await graphFn(`${DFS_PAGE_ID}/leadgen_forms`, token, {
      fields: 'id,name,status',
      limit: '50',
    });
    if (response.error) throw new Error('graph_error');
    if (!Array.isArray(response.data)) throw new Error('graph_shape');
    forms = response.data.filter((form) => form.status === 'ACTIVE');
  } catch {
    return { ok: false, error: 'GRAPH_LIST_FAILED' };
  }

  for (const form of forms) {
    if (now() - startedAt >= processingBudgetMs) {
      result.truncated = true;
      break;
    }
    result.formsChecked += 1;

    let leads;
    try {
      const response = await graphFn(`${form.id}/leads`, token, {
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
      if (now() - startedAt >= processingBudgetMs) {
        result.truncated = true;
        break;
      }
      if (Date.parse(lead.created_time) < cutoff) continue;
      result.eligible += 1;
      if (dry) continue;
      result.attempted += 1;

      try {
        const processed = await processLeadgenChangeFn({
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

  result.ok = result.errors.length === 0;
  return result;
}
