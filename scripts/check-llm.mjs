import { polishFenstershopAnswerGpt } from '../src/chatbot/gptClient.js';
import { polishFenstershopAnswerClaude } from '../src/chatbot/claudeClient.js';

const BASE = process.env.AUFMASS_BASE_URL || 'https://fenster-price-radar.vercel.app';
const TIMEOUT_MS = 15000;
const TEST_MESSAGE = 'Welche Farben gibt es?';
const SECRET_ENV_NAMES = [
  'OPENAI_API_KEY',
  'OPENAI_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_API_KEY',
];
const draft = {
  intent: 'fallback',
  answer: 'Fenster sind in verschiedenen Farben und Dekoren erhältlich. Die konkrete Auswahl hängt vom gewählten Profil ab.',
  links: [],
  contacts: [],
};

function report(status, name, detail) {
  console.log(`${status} ${name} ${detail}`);
}

function sanitizeDetail(value) {
  let detail = String(value?.message || value || 'unbekannter_fehler');
  for (const name of SECRET_ENV_NAMES) {
    const secret = process.env[name];
    if (secret) detail = detail.split(secret).join('[ENTFERNT]');
  }
  return detail
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(Bearer|authorization|x-api-key|api[_-]?key|access[_-]?token)\s*[:=]?\s*\S+/gi, '$1 [ENTFERNT]')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[ENTFERNT]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[ENTFERNT]')
    .slice(0, 240)
    .trim();
}

function configuredVariables(names) {
  return names.filter((name) => Boolean(process.env[name]));
}

function reportAccess(provider, names) {
  const configured = configuredVariables(names);
  if (configured.length === 0) {
    report('warn', `zugang-${provider}`, `fehlt (${names.join(' oder ')})`);
    return false;
  }
  report('ok', `zugang-${provider}`, `gesetzt (${configured.join(', ')})`);
  return true;
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

async function checkLocalProvider({ name, configured, polish }) {
  if (!configured) {
    report('warn', name, 'nicht konfiguriert, Funktionstest übersprungen');
    return false;
  }
  try {
    const result = await polish({
      message: TEST_MESSAGE,
      draft,
      knowledge: [],
    });
    if (!result?.answer) {
      report('FAIL', name, 'keine Antwort geliefert');
      return false;
    }
    report('ok', name, `Antwort erhalten, Modell=${result.model || 'unbekannt'}`);
    return true;
  } catch (error) {
    report('FAIL', name, sanitizeDetail(error));
    return false;
  }
}

async function checkLocal() {
  const providers = [
    {
      name: 'gpt',
      configured: reportAccess('gpt', ['OPENAI_API_KEY', 'OPENAI_OAUTH_TOKEN']),
      polish: polishFenstershopAnswerGpt,
    },
    {
      name: 'claude',
      configured: reportAccess('claude', ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']),
      polish: polishFenstershopAnswerClaude,
    },
  ];

  const outcomes = [];
  for (const provider of providers) {
    outcomes.push({
      ...provider,
      working: await checkLocalProvider(provider),
    });
  }

  const serving = outcomes.find((provider) => provider.working);
  if (serving) {
    report('ok', 'gesamt', `${serving.name} bedient den Chatbot mit KI-Politur`);
    return;
  }
  if (outcomes.some((provider) => provider.configured)) {
    report('FAIL', 'gesamt', 'Mindestens ein Anbieter ist konfiguriert, aber keiner antwortet');
    process.exitCode = 1;
    return;
  }
  report('warn', 'gesamt', 'Kein Anbieter ist konfiguriert — der Chatbot arbeitet ohne KI-Politur');
}

async function checkProduction() {
  report('warn', 'zugang-produktion', 'Hosting-Zugänge sind von außen nicht einsehbar; Prüfung erfolgt über /api/chatbot');
  try {
    const response = await timedFetch(`${BASE}/api/chatbot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: TEST_MESSAGE, sessionId: 'check-llm' }),
    });
    let json;
    try {
      json = await response.json();
    } catch (error) {
      throw new Error(`HTTP ${response.status}, ungültige JSON-Antwort: ${sanitizeDetail(error)}`);
    }
    if (!response.ok || json?.ok !== true) {
      const reason = json?.error || json?.message || 'unbekannter_fehler';
      throw new Error(`HTTP ${response.status}, ${reason}`);
    }
    if (json.llm?.used === true) {
      report('ok', 'produktion', `KI-Politur aktiv, Anbieter=${json.llm.provider || 'unbekannt'}, Modell=${json.llm.model || 'unbekannt'}`);
      report('ok', 'gesamt', `${json.llm.provider || 'Ein LLM-Anbieter'} bedient den produktiven Chatbot`);
      return;
    }
    const reason = sanitizeDetail(json.llm?.reason || 'llm-Feld fehlt oder used ist nicht true');
    report('FAIL', 'produktion', `keine KI-Politur, reason=${reason}`);
    report('FAIL', 'gesamt', 'Der produktive Chatbot antwortet ohne KI-Politur');
    process.exitCode = 1;
  } catch (error) {
    const detail = error?.name === 'AbortError'
      ? 'Timeout nach 15s — Live-Deployment und Netzwerk prüfen'
      : `Anfrage fehlgeschlagen: ${sanitizeDetail(error)}`;
    report('FAIL', 'produktion', detail);
    report('FAIL', 'gesamt', 'Der produktive LLM-Status konnte nicht erfolgreich geprüft werden');
    process.exitCode = 1;
  }
}

const args = process.argv.slice(2);
const againstProduction = args.includes('--gegen-produktion');
const unknownArgs = args.filter((arg) => arg !== '--gegen-produktion');

if (unknownArgs.length > 0) {
  report('FAIL', 'argumente', `Unbekannter Schalter: ${unknownArgs.join(', ')}`);
  process.exitCode = 1;
} else if (againstProduction) {
  await checkProduction();
} else {
  await checkLocal();
}
