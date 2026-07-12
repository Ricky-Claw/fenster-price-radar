const BASE = process.env.AUFMASS_BASE_URL || 'https://fenster-price-radar.vercel.app';
const TIMEOUT_MS = 15000;
const results = [];

function report(status, name, detail) {
  results.push(status);
  console.log(`${status} ${name} ${detail}`);
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function check(name, run) {
  try {
    await run();
  } catch (error) {
    const detail = error?.name === 'AbortError'
      ? 'Timeout nach 15s — Live-Deployment und Netzwerk pruefen'
      : `Anfrage fehlgeschlagen: ${error?.message || error}`;
    report('FAIL', name, detail);
  }
}

await check('page', async () => {
  const response = await timedFetch(`${BASE}/aufmass.html`, { redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location') || 'unbekannt';
    report('FAIL', 'page', `Seite ist nicht oeffentlich erreichbar (Redirect: ${location}) — Vercel Deployment Protection pruefen`);
    return;
  }
  const body = await response.text();
  const markers = ['micBtn', 'summarySection', 'doc-settings', 'id="ticket"'];
  const missing = markers.filter((marker) => !body.includes(marker));
  if (response.status === 200 && missing.length === 0) {
    report('ok', 'page', 'HTTP 200, alle Seiten-Marker gefunden');
  } else {
    report('FAIL', 'page', `HTTP ${response.status}, fehlende Marker: ${missing.join(', ') || 'keine'}`);
  }
});

await check('api-health', async () => {
  const response = await timedFetch(`${BASE}/api/aufmass`);
  const json = await response.json();
  if (response.status === 200 && json.ok === true) report('ok', 'api-health', 'HTTP 200, API bereit');
  else report('FAIL', 'api-health', `HTTP ${response.status}, ok=${String(json.ok)}`);
});

await check('api-guard', async () => {
  const response = await timedFetch(`${BASE}/api/aufmass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript: '' }),
  });
  const json = await response.json();
  if (response.status === 429) {
    report('warn', 'api-guard', 'Rate-Limit aktiv — evtl. gerade viele Tests von dieser IP');
  } else if (response.status === 400 && json.error === 'empty_transcript') {
    report('ok', 'api-guard', 'HTTP 400, empty_transcript ohne LLM-Call');
  } else {
    report('FAIL', 'api-guard', `HTTP ${response.status}, error=${json.error || 'unbekannt'}`);
  }
});

await check('submit-health', async () => {
  const response = await timedFetch(`${BASE}/api/aufmass-submit`);
  const json = await response.json();
  if (response.status === 200 && json.ok === true) {
    if (json.configured === true) {
      report('ok', 'submit-health', 'Webhook konfiguriert: ja');
    } else {
      report('warn', 'submit-health', 'Webhook konfiguriert: NEIN — Aufmasse werden nicht weitergeleitet (AUFMASS_TICKET_WEBHOOK setzen)');
    }
  } else {
    report('FAIL', 'submit-health', `HTTP ${response.status}, ok=${String(json.ok)}`);
  }
});

if (process.env.CHECK_LIVE_KI === '1') {
  await check('live-ki', async () => {
    const response = await timedFetch(`${BASE}/api/aufmass`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript: 'Bad fest 60 auf 40' }),
    });
    const json = await response.json();
    if (response.status === 200 && json.ok === true && Array.isArray(json.windows)) {
      report('ok', 'live-ki', `source=${json.source || 'unbekannt'}, model=${json.meta?.model || 'unbekannt'}`);
    } else {
      report('FAIL', 'live-ki', `HTTP ${response.status}, error=${json.error || 'unbekannt'}`);
    }
  });
}

const okCount = results.filter((status) => status === 'ok').length;
const warnCount = results.filter((status) => status === 'warn').length;
if (results.includes('FAIL')) {
  console.log('LIVE-CHECK FAILED');
  process.exitCode = 1;
} else {
  console.log(`LIVE-CHECK PASSED (${okCount} ok, ${warnCount} warn)`);
}
