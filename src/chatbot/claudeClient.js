import { LLM_ANSWER_RULES } from './llmPromptRules.js';

// Claude Haiku als Qualitäts-Primärprovider. Zwei Auth-Wege möglich:
// - CLAUDE_CODE_OAUTH_TOKEN (per `claude setup-token` aus einem Claude-Abo erzeugt) -> Bearer + oauth-Beta-Header,
//   läuft über das Abo-Kontingent statt separater API-Abrechnung.
// - ANTHROPIC_API_KEY -> klassischer x-api-key, nutzungsbasiert abgerechnet.
// OAuth hat Vorrang, wenn beide gesetzt sind.
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5';
const OAUTH_BETA_HEADER = 'oauth-2025-04-20';

function claudeAuth(env = process.env) {
  const oauthToken = env.CLAUDE_CODE_OAUTH_TOKEN || '';
  if (oauthToken) return { mode: 'oauth', token: oauthToken };
  const apiKey = env.ANTHROPIC_API_KEY || '';
  if (apiKey) return { mode: 'apikey', token: apiKey };
  return null;
}

export async function polishFenstershopAnswerClaude({ message, draft, knowledge = [], env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.FENSTERSHOP_LLM_ENABLED === '0') return null;
  const auth = claudeAuth(env);
  if (!auth || typeof fetchImpl !== 'function') return null;
  const model = env.FENSTERSHOP_CLAUDE_MODEL || DEFAULT_MODEL;
  const prompt = `Du bist der Hilfechat vom Deutschen Fenstershop. Formuliere eine kurze, freundliche deutsche Antwort als reinen Text (kein JSON, keine Anführungszeichen drumherum).

${LLM_ANSWER_RULES}

Nutzerfrage: ${message}
Intent: ${draft.intent}
Draft-Antwort: ${draft.answer}
Links: ${JSON.stringify(draft.links || [])}
Kontakte: ${JSON.stringify(draft.contacts || [])}
Wissensquellen: ${JSON.stringify(knowledge.map((chunk) => ({ title: chunk.title, text: chunk.text.slice(0, 900) })))}
`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(env.FENSTERSHOP_CLAUDE_TIMEOUT_MS || 15000));
  try {
    const authHeaders = auth.mode === 'oauth'
      ? { authorization: `Bearer ${auth.token}`, 'anthropic-beta': OAUTH_BETA_HEADER }
      : { 'x-api-key': auth.token };
    const response = await fetchImpl(CLAUDE_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`claude_failed_${response.status}`);
    const data = await response.json();
    if (data.stop_reason === 'refusal') return null;
    const answer = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (!answer || answer.length > 700) return null;
    return { answer, model: data.model || model };
  } finally {
    clearTimeout(timer);
  }
}
