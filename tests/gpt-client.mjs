import assert from 'node:assert/strict';
import { polishFenstershopAnswerGpt } from '../src/chatbot/gptClient.js';

const request = {
  message: 'Was bedeutet der Ug-Wert?',
  draft: {
    intent: 'knowledge_rag',
    answer: 'Der Ug-Wert beschreibt die Wärmedämmung der Verglasung.',
    links: [],
    contacts: [],
  },
  knowledge: [{ title: 'Ug-Wert', text: 'Der Ug-Wert gilt für die Verglasung.' }],
};

{
  let called = false;
  const result = await polishFenstershopAnswerGpt({
    ...request,
    env: {},
    fetchImpl: async () => {
      called = true;
      throw new Error('fetch must not be called');
    },
  });
  assert.equal(result, null);
  assert.equal(called, false);
}

{
  let called = false;
  const result = await polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key', FENSTERSHOP_LLM_ENABLED: '0' },
    fetchImpl: async () => {
      called = true;
      throw new Error('fetch must not be called');
    },
  });
  assert.equal(result, null);
  assert.equal(called, false);
}

{
  const result = await polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ output_text: '  Direkte GPT-Antwort.  ' }),
    }),
  });
  assert.deepEqual(result, { answer: 'Direkte GPT-Antwort.', model: 'gpt-5.6-luna' });
}

{
  const result = await polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        model: 'gpt-5.6-luna',
        output: [{ content: [{ type: 'output_text', text: 'Antwort aus output[].' }] }],
      }),
    }),
  });
  assert.deepEqual(result, { answer: 'Antwort aus output[].', model: 'gpt-5.6-luna' });
}

await assert.rejects(
  polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => ({ ok: false, status: 401 }),
  }),
  /gpt_failed_401/
);

{
  let capturedUrl;
  let capturedInit;
  await polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-api-key' },
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return { ok: true, json: async () => ({ output_text: 'Geprüfte Antwort.' }) };
    },
  });
  assert.equal(capturedUrl, 'https://api.openai.com/v1/responses');
  assert.equal(capturedInit.headers.authorization, 'Bearer test-api-key');
  assert.equal(JSON.parse(capturedInit.body).model, 'gpt-5.6-luna');
}

for (const payload of [
  { output: {} },
  { output: 'x' },
  {},
  { output: [{ content: 'kein-array' }] },
]) {
  const result = await polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => payload,
    }),
  });
  assert.equal(result, null);
}

await assert.rejects(
  polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
      }),
    }),
  }),
  /max_output_tokens/
);

await assert.rejects(
  polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: 'incomplete',
        output: [],
      }),
    }),
  }),
  /unknown/
);

{
  let capturedBody;
  await polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ output_text: 'Geprüfte Antwort.' }) };
    },
  });
  assert.equal(capturedBody.max_output_tokens, 2000);
  assert.equal(capturedBody.reasoning.effort, 'minimal');
}

{
  let capturedBody;
  await polishFenstershopAnswerGpt({
    ...request,
    env: {
      OPENAI_API_KEY: 'test-key',
      FENSTERSHOP_GPT_MAX_OUTPUT_TOKENS: '1234',
      FENSTERSHOP_GPT_REASONING_EFFORT: 'low',
    },
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ output_text: 'Geprüfte Antwort.' }) };
    },
  });
  assert.equal(capturedBody.max_output_tokens, 1234);
  assert.equal(capturedBody.reasoning.effort, 'low');
}

await assert.rejects(
  polishFenstershopAnswerGpt({
    ...request,
    env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ output_text: 'x'.repeat(701) }),
    }),
  }),
  /gpt_answer_too_long/
);

console.log('gpt-client ok');
