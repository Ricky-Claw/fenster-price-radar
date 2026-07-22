#!/usr/bin/env node
// Meta-Radar: (A) Puls der eigenen Meta-Kampagnen via Marketing API, (B) Konkurrenz-Blick via Meta Ad Library.
// Ohne META_ACCESS_TOKEN + META_AD_ACCOUNT_ID läuft nur Teil B — ehrlicher Leerstand statt Fehler.
// Runbook: docs/meta-radar.md · Secrets NIE im Repo/Chat, nur Env (lokal .env / VPS).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const API_VERSION = 'v23.0';
const DATE_PRESET = process.env.META_DATE_PRESET || 'last_7d';
const TOKEN = process.env.META_ACCESS_TOKEN || '';
const ACCOUNT_ID = (process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');

const konkurrenz = JSON.parse(fs.readFileSync(path.join(HERE, 'konkurrenz.json'), 'utf8'));

function adLibraryLink(query) {
  const params = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country: 'DE',
    media_type: 'all',
    search_type: 'keyword_unordered',
    q: query,
  });
  return `https://www.facebook.com/ads/library/?${params}`;
}

async function graphGet(pathname, params) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', TOKEN);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    const code = body?.error?.code ?? res.status;
    throw new Error(`Marketing API Fehler (Code ${code}): ${msg}`);
  }
  return body;
}

const LEAD_ACTION_TYPES = new Set(['lead', 'leadgen_grouped', 'onsite_conversion.lead_grouped']);

function leadsAus(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions
    .filter((a) => LEAD_ACTION_TYPES.has(a.action_type))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

async function eigeneKampagnen() {
  const rows = [];
  let page = await graphGet(`act_${ACCOUNT_ID}/insights`, {
    level: 'campaign',
    date_preset: DATE_PRESET,
    fields: 'campaign_name,spend,impressions,clicks,ctr,actions',
    limit: '50',
  });
  for (;;) {
    rows.push(...(page.data || []));
    const next = page?.paging?.next;
    if (!next) break;
    const res = await fetch(next);
    page = await res.json();
    if (!res.ok) break;
  }
  return rows.map((r) => {
    const leads = leadsAus(r.actions);
    const spend = Number(r.spend || 0);
    return {
      kampagne: r.campaign_name,
      spend,
      impressionen: Number(r.impressions || 0),
      klicks: Number(r.clicks || 0),
      ctr: Number(r.ctr || 0),
      leads,
      cpl: leads > 0 ? spend / leads : null,
    };
  });
}

function eur(n) {
  return n == null ? '—' : `${n.toFixed(2).replace('.', ',')} €`;
}

async function main() {
  const heute = new Date().toISOString().slice(0, 10);
  const zeilen = [`# Meta-Radar — ${heute}`, ''];

  zeilen.push(`## Eigene Kampagnen (${DATE_PRESET})`, '');
  if (TOKEN && ACCOUNT_ID) {
    const rows = await eigeneKampagnen();
    if (rows.length === 0) {
      zeilen.push('Keine aktiven Kampagnen-Daten im Zeitraum.', '');
    } else {
      zeilen.push('| Kampagne | Spend | Impressionen | Klicks | CTR | Leads | CPL |', '|---|---|---|---|---|---|---|');
      for (const r of rows) {
        zeilen.push(
          `| ${r.kampagne} | ${eur(r.spend)} | ${r.impressionen.toLocaleString('de-DE')} | ${r.klicks} | ${r.ctr.toFixed(2)} % | ${r.leads} | ${eur(r.cpl)} |`,
        );
      }
      zeilen.push('');
    }
  } else {
    zeilen.push(
      '_Nicht verbunden: `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` fehlen (siehe docs/meta-radar.md, Stufe 2). Konkurrenz-Teil läuft trotzdem._',
      '',
    );
  }

  for (const [titel, liste] of [
    ['Eigene Seite (QS-Blick)', konkurrenz.eigene],
    ['Wettbewerber', konkurrenz.wettbewerber],
    ['Partner', konkurrenz.partner],
  ]) {
    zeilen.push(`## Ad Library: ${titel}`, '');
    for (const eintrag of liste || []) {
      zeilen.push(`- **${eintrag.name}** → [aktive DE-Anzeigen](${adLibraryLink(eintrag.query)})`);
    }
    zeilen.push('');
  }
  zeilen.push('_Quelle Konkurrenz: Meta Ad Library (öffentlich). Eigene Zahlen: Meta Marketing API._', '');

  const outDir = path.join(ROOT, 'results', 'meta-radar');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `report-${heute}.md`);
  fs.writeFileSync(outFile, zeilen.join('\n'));
  console.log(zeilen.join('\n'));
  console.log(`\nReport gespeichert: ${path.relative(ROOT, outFile)}`);
}

main().catch((err) => {
  console.error(`Meta-Radar abgebrochen: ${err.message}`);
  process.exit(1);
});
