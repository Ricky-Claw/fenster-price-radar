import { LLM_ANSWER_RULES } from './llmPromptRules.js';

const KIMI_URL = 'https://api.moonshot.ai/v1/chat/completions';

function kimiApiKey(env = process.env) {
  return env.KIMI_API_KEY || env.MOONSHOT_API_KEY || '';
}

function extractJson(text = '') {
  const raw = String(text).match(/\{[\s\S]*\}/)?.[0] || '{}';
  return JSON.parse(raw);
}

export async function polishFenstershopAnswer({ message, draft, knowledge = [], env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.FENSTERSHOP_LLM_ENABLED === '0') return null;
  const apiKey = kimiApiKey(env);
  if (!apiKey || typeof fetchImpl !== 'function') return null;
  const prompt = `Du bist der Hilfechat vom Deutschen Fenstershop. Formuliere eine kurze, freundliche deutsche Antwort.

${LLM_ANSWER_RULES}
- Gib nur valides JSON zurück: {"answer":"..."}

Nutzerfrage: ${message}
Intent: ${draft.intent}
Draft-Antwort: ${draft.answer}
Links: ${JSON.stringify(draft.links || [])}
Kontakte: ${JSON.stringify(draft.contacts || [])}
Wissensquellen: ${JSON.stringify(knowledge.map((chunk) => ({ title: chunk.title, text: chunk.text.slice(0, 900) })))}
`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(env.FENSTERSHOP_LLM_TIMEOUT_MS || 12000));
  try {
    const response = await fetchImpl(KIMI_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.FENSTERSHOP_LLM_MODEL || env.LISA_LLM_MODEL || 'moonshot-v1-8k',
        temperature: 1,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`kimi_failed_${response.status}`);
    const data = await response.json();
    const parsed = extractJson(data.choices?.[0]?.message?.content || '{}');
    let answer = String(parsed.answer || '').trim();
    if (!answer) answer = String(data.choices?.[0]?.message?.content || '').trim();
    if (!answer || answer.length > 700) return null;
    return { answer, model: env.FENSTERSHOP_LLM_MODEL || env.LISA_LLM_MODEL || 'moonshot-v1-8k' };
  } finally {
    clearTimeout(timer);
  }
}
