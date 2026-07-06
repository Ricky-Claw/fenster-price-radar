import { LLM_ANSWER_RULES } from './llmPromptRules.js';

const NEMOTRON_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

function nemotronApiKey(env = process.env) {
  return env.NVIDIA_API_KEY || '';
}

function stripReasoning(text = '') {
  return String(text || '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

export async function polishFenstershopAnswerNemotron({ message, draft, knowledge = [], env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.FENSTERSHOP_LLM_ENABLED === '0') return null;
  const apiKey = nemotronApiKey(env);
  if (!apiKey || typeof fetchImpl !== 'function') return null;
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
  const timer = setTimeout(() => controller.abort(), Number(env.FENSTERSHOP_NEMOTRON_TIMEOUT_MS || 30000));
  try {
    const response = await fetchImpl(NEMOTRON_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.FENSTERSHOP_NEMOTRON_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 4000,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`nemotron_failed_${response.status}`);
    const data = await response.json();
    const answer = stripReasoning(data.choices?.[0]?.message?.content || '');
    if (!answer || answer.length > 700) return null;
    return { answer, model: env.FENSTERSHOP_NEMOTRON_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' };
  } finally {
    clearTimeout(timer);
  }
}
