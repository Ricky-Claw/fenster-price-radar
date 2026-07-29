import assert from 'node:assert/strict';
import { polishFenstershopAnswerCodex } from '../src/chatbot/codexBridgeClient.js';

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

const gueltigeUmgebung = {
  JANELA_BRIDGE_URL: 'https://srv1332950.hstgr.cloud/janela/polish',
  JANELA_BRIDGE_TOKEN: 'bridge-token-for-tests',
};

function stubDerNieLaufenDarf(state) {
  return async () => {
    state.called = true;
    throw new Error('fetch must not be called');
  };
}

// Ohne Zugangsdaten wird die Bruecke gar nicht erst kontaktiert.
{
  const state = { called: false };
  const result = await polishFenstershopAnswerCodex({ ...request, env: {}, fetchImpl: stubDerNieLaufenDarf(state) });
  assert.equal(result, null);
  assert.equal(state.called, false, 'ohne Zugang darf kein Aufruf rausgehen');
}

// Nur Token, keine Adresse -> kein Aufruf.
{
  const state = { called: false };
  const result = await polishFenstershopAnswerCodex({
    ...request,
    env: { JANELA_BRIDGE_TOKEN: 'x' },
    fetchImpl: stubDerNieLaufenDarf(state),
  });
  assert.equal(result, null);
  assert.equal(state.called, false);
}

// Wichtigste Zusicherung: eine fremde Gegenstelle bekommt NIE Kundennachrichten,
// auch wenn die Variable falsch gesetzt ist.
for (const fremdeAdresse of [
  'https://example.com/janela/polish',
  'http://srv1332950.hstgr.cloud/janela/polish',
  'https://boese.hstgr.cloud.angreifer.example/janela',
  'nicht-mal-eine-url',
]) {
  const state = { called: false };
  const result = await polishFenstershopAnswerCodex({
    ...request,
    env: { ...gueltigeUmgebung, JANELA_BRIDGE_URL: fremdeAdresse },
    fetchImpl: stubDerNieLaufenDarf(state),
  });
  assert.equal(result, null, `fremde Adresse abgelehnt: ${fremdeAdresse}`);
  assert.equal(state.called, false, `kein Aufruf an fremde Adresse: ${fremdeAdresse}`);
}

// Abschalter greift trotz gueltiger Konfiguration.
{
  const state = { called: false };
  const result = await polishFenstershopAnswerCodex({
    ...request,
    env: { ...gueltigeUmgebung, FENSTERSHOP_LLM_ENABLED: '0' },
    fetchImpl: stubDerNieLaufenDarf(state),
  });
  assert.equal(result, null);
  assert.equal(state.called, false);
}

// Erfolgsfall: Token im Kopf, Prompt im Rumpf, Antwort wird uebernommen.
{
  let capturedUrl = '';
  let capturedInit = null;
  const result = await polishFenstershopAnswerCodex({
    ...request,
    env: gueltigeUmgebung,
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return { ok: true, json: async () => ({ ok: true, answer: 'Der Ug-Wert beschreibt die Dämmung der Scheibe.', model: 'gpt-5.6-luna' }) };
    },
  });
  assert.equal(capturedUrl, gueltigeUmgebung.JANELA_BRIDGE_URL);
  assert.equal(capturedInit.method, 'POST');
  assert.equal(capturedInit.headers.authorization, `Bearer ${gueltigeUmgebung.JANELA_BRIDGE_TOKEN}`);
  const body = JSON.parse(capturedInit.body);
  assert.ok(body.prompt.includes('Was bedeutet der Ug-Wert?'), 'Prompt enthält die Nutzerfrage');
  assert.ok(body.prompt.includes('Der Ug-Wert beschreibt die Wärmedämmung der Verglasung.'), 'Prompt enthält den Entwurf');
  assert.equal(result.answer, 'Der Ug-Wert beschreibt die Dämmung der Scheibe.');
  assert.equal(result.model, 'gpt-5.6-luna');
}

// HTTP-Fehler der Bruecke wird sprechend weitergereicht.
{
  await assert.rejects(
    polishFenstershopAnswerCodex({
      ...request,
      env: gueltigeUmgebung,
      fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
    }),
    /codex_failed_502/,
  );
}

// Fachlicher Fehlschlag trotz HTTP 200.
{
  await assert.rejects(
    polishFenstershopAnswerCodex({
      ...request,
      env: gueltigeUmgebung,
      fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false, error: 'timeout' }) }),
    }),
    /codex_failed_timeout/,
  );
}

// Leere Antwort -> null (Ausweichpfad auf den naechsten Anbieter).
{
  const result = await polishFenstershopAnswerCodex({
    ...request,
    env: gueltigeUmgebung,
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, answer: '   ' }) }),
  });
  assert.equal(result, null);
}

// Ueberlange Antwort wird abgelehnt.
{
  await assert.rejects(
    polishFenstershopAnswerCodex({
      ...request,
      env: gueltigeUmgebung,
      fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, answer: 'a'.repeat(701) }) }),
    }),
    /codex_answer_too_long/,
  );
}

console.log('codex-bridge ok');
