import { buildFenstershopLlmPrompt } from './llmPromptRules.js';

// Poliert über die Codex-CLI, die auf dem VPS angemeldet ist (Abo-Kontingent statt
// API-Abrechnung). Der Chatbot läuft serverlos und hat dort keine CLI, deshalb die
// schmale HTTP-Brücke aus tools/janela-bridge/. Aktiv nur mit URL + Token.
const DEFAULT_TIMEOUT_MS = 20000;
const ANSWER_MAX_CHARS = 700;

// Wie api/trigger-update.js: nur der eigene VPS. Eine falsch gesetzte Variable darf
// Kundennachrichten nicht an eine fremde Gegenstelle schicken.
function bridgeEndpoint(env) {
  const raw = env.JANELA_BRIDGE_URL || '';
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.hstgr.cloud')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function polishFenstershopAnswerCodex({ message, draft, knowledge = [], env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.FENSTERSHOP_LLM_ENABLED === '0') return null;
  const token = env.JANELA_BRIDGE_TOKEN || '';
  const endpoint = bridgeEndpoint(env);
  if (!token || !endpoint || typeof fetchImpl !== 'function') return null;
  const prompt = buildFenstershopLlmPrompt({ message, draft, knowledge });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(env.JANELA_BRIDGE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
      // Keiner Weiterleitung folgen: Token und Kundennachricht dürfen nie an eine
      // vom Ziel untergeschobene fremde Adresse gehen.
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`codex_failed_${response.status}`);
    const data = await response.json();
    if (data?.ok !== true) throw new Error(`codex_failed_${String(data?.error || 'unknown').slice(0, 60)}`);
    const answer = String(data.answer || '').trim();
    if (!answer) return null;
    if (answer.length > ANSWER_MAX_CHARS) throw new Error('codex_answer_too_long');
    return { answer, model: data.model || 'codex-bridge' };
  } finally {
    clearTimeout(timer);
  }
}
