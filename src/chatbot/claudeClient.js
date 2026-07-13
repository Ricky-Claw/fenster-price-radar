import { LLM_ANSWER_RULES } from './llmPromptRules.js';

// Claude Haiku als Qualitäts-Primärprovider; aktiviert sich nur, wenn ANTHROPIC_API_KEY gesetzt ist.
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5';

function claudeApiKey(env = process.env) {
  return env.ANTHROPIC_API_KEY || '';
}

export async function polishFenstershopAnswerClaude({ message, draft, knowledge = [], env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.FENSTERSHOP_LLM_ENABLED === '0') return null;
  const apiKey = claudeApiKey(env);
  if (!apiKey || typeof fetchImpl !== 'function') return null;
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
    const response = await fetchImpl(CLAUDE_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
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
