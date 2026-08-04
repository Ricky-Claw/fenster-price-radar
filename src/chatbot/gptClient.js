import { buildFenstershopLlmPrompt } from './llmPromptRules.js';

// GPT-5.6 Luna als Qualitäts-Primärprovider. Zwei Auth-Wege möglich:
// - OPENAI_API_KEY -> klassischer Bearer-Key.
// - OPENAI_OAUTH_TOKEN -> OAuth-Access-Token, optional mit ChatGPT-Account-ID.
// Der API-Key hat Vorrang, wenn beide gesetzt sind.
const GPT_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6-luna';

function gptAuth(env = process.env) {
  const apiKey = env.OPENAI_API_KEY || '';
  if (apiKey) return { mode: 'apikey', token: apiKey };
  const oauthToken = env.OPENAI_OAUTH_TOKEN || '';
  if (oauthToken) return { mode: 'oauth', token: oauthToken };
  return null;
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  return output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

export async function polishFenstershopAnswerGpt({ message, draft, knowledge = [], env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.FENSTERSHOP_LLM_ENABLED === '0') return null;
  const auth = gptAuth(env);
  if (!auth || typeof fetchImpl !== 'function') return null;
  const model = env.FENSTERSHOP_GPT_MODEL || DEFAULT_MODEL;
  const prompt = buildFenstershopLlmPrompt({ message, draft, knowledge });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(env.FENSTERSHOP_GPT_TIMEOUT_MS || 8000));
  try {
    const authHeaders = {
      authorization: `Bearer ${auth.token}`,
      ...(auth.mode === 'oauth' && env.OPENAI_ACCOUNT_ID ? { 'chatgpt-account-id': env.OPENAI_ACCOUNT_ID } : {}),
    };
    const response = await fetchImpl(GPT_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: Number(env.FENSTERSHOP_GPT_MAX_OUTPUT_TOKENS) || 2000,
        reasoning: {
          // Umformulieren braucht kein Nachdenken. 'minimal' lehnt gpt-5.6-luna mit HTTP 400 ab;
          // gueltig sind none/low/medium/high/xhigh/max.
          effort: env.FENSTERSHOP_GPT_REASONING_EFFORT || 'none',
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`gpt_failed_${response.status}`);
    const data = await response.json();
    if (data.status === 'incomplete') {
      throw new Error(`gpt_incomplete_${data.incomplete_details?.reason || 'unknown'}`);
    }
    const answer = extractOutputText(data).trim();
    if (!answer) return null;
    if (answer.length > 700) throw new Error('gpt_answer_too_long');
    return { answer, model: data.model || model };
  } finally {
    clearTimeout(timer);
  }
}
