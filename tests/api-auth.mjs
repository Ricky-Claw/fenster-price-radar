import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import chatbotHandler from '../api/chatbot.js';
import logoutHandler from '../api/logout.js';
import quoteHandler from '../api/quote.js';
import { cookieValue, safeEqualSecret, validSession } from '../src/auth/session.js';

const originalSecret = process.env.FENSTER_RADAR_AUTH_SECRET;
const originalPassword = process.env.FENSTER_RADAR_PASSWORD;
const testSecret = 'api-auth-test-secret';

function signedCookie(expires, secret = testSecret) {
  const payload = `v1.${expires}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

try {
  process.env.FENSTER_RADAR_AUTH_SECRET = testSecret;
  process.env.FENSTER_RADAR_PASSWORD = 'fallback-password';

  const future = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(validSession(signedCookie(future)), true, 'gültiges Cookie muss akzeptiert werden');

  const valid = signedCookie(future);
  const wrongSignature = `${valid.slice(0, valid.lastIndexOf('.') + 1)}${'A'.repeat(43)}`;
  assert.equal(validSession(wrongSignature), false, 'falsche Signatur muss abgelehnt werden');

  const expired = Math.floor(Date.now() / 1000) - 60;
  assert.equal(validSession(signedCookie(expired)), false, 'abgelaufenes Cookie muss abgelehnt werden');
  assert.equal(validSession(''), false, 'leeres Cookie muss abgelehnt werden');
  assert.equal(validSession(), false, 'fehlendes Cookie muss abgelehnt werden');

  process.env.FENSTER_RADAR_AUTH_SECRET = '';
  process.env.FENSTER_RADAR_PASSWORD = '';
  assert.equal(validSession(signedCookie(future)), false, 'fehlendes Secret muss fail-closed ablehnen');

  assert.equal(
    cookieValue('theme=dark; fenster_radar_session=v1.test.signature; locale=de', 'fenster_radar_session'),
    'v1.test.signature',
    'Cookie muss zwischen mehreren Cookies gefunden werden',
  );
} finally {
  if (originalSecret === undefined) delete process.env.FENSTER_RADAR_AUTH_SECRET;
  else process.env.FENSTER_RADAR_AUTH_SECRET = originalSecret;
  if (originalPassword === undefined) delete process.env.FENSTER_RADAR_PASSWORD;
  else process.env.FENSTER_RADAR_PASSWORD = originalPassword;
}

assert.equal(safeEqualSecret('gleiches-geheimnis', 'gleiches-geheimnis'), true, 'gleiche Secrets müssen akzeptiert werden');
assert.equal(safeEqualSecret('gleich-lang-a', 'gleich-lang-b'), false, 'unterschiedliche gleich lange Secrets müssen abgelehnt werden');
assert.equal(safeEqualSecret('kurz', 'deutlich-laenger'), false, 'unterschiedlich lange Secrets müssen abgelehnt werden');

function response() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      for (const [key, value] of Object.entries(headers)) this.headers[String(key).toLowerCase()] = value;
    },
    end(chunk = '') { this.body += chunk; return this; },
    status(status) { this.statusCode = status; return this; },
    json(payload) { this.body += JSON.stringify(payload); return this; },
  };
}

{
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('quote fetch must not be called without a valid session');
  };
  try {
    const res = response();
    await quoteHandler({ method: 'GET', headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(fetchCalls, 0, 'Quote-Handler darf ohne Session keinen externen Aufruf starten');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const getRes = response();
  await logoutHandler({ method: 'GET' }, getRes);
  assert.equal(getRes.statusCode, 405);

  const postRes = response();
  await logoutHandler({ method: 'POST' }, postRes);
  assert.equal(postRes.statusCode, 200);
}

{
  const originalKnowledgeToken = process.env.CHATBOT_KNOWLEDGE_TOKEN;
  const originalLlmEnabled = process.env.FENSTERSHOP_LLM_ENABLED;
  const knowledgeToken = 'knowledge-token-for-tests';
  const knowledge = [{
    name: 'polarsternfenster.md',
    content: '# Polarsternfenster Sondervorteil\n\nFür Polarsternfenster gilt im Juli ein Sondervorteil von sieben Prozent auf alle passenden Konfigurationen.',
  }];
  process.env.CHATBOT_KNOWLEDGE_TOKEN = knowledgeToken;
  process.env.FENSTERSHOP_LLM_ENABLED = '0';
  try {
    const anonymousRes = response();
    await chatbotHandler({
      method: 'POST',
      headers: { 'x-real-ip': 'api-auth-anonymous' },
      body: { message: 'Welcher Sondervorteil gilt für Polarsternfenster?', knowledge },
    }, anonymousRes);
    const anonymousBody = JSON.parse(anonymousRes.body);
    assert.equal(anonymousRes.statusCode, 200);
    assert.doesNotMatch(anonymousBody.answer, /sieben Prozent/i, 'Wissen ohne Session oder Token muss ignoriert werden');
    assert.equal('attempts' in anonymousBody.llm, false, 'anonyme Antworten dürfen keine Provider-Diagnose enthalten');

    const tokenRes = response();
    await chatbotHandler({
      method: 'POST',
      headers: { 'x-real-ip': 'api-auth-token', 'x-knowledge-token': knowledgeToken },
      body: { message: 'Welcher Sondervorteil gilt für Polarsternfenster?', knowledge },
    }, tokenRes);
    const tokenBody = JSON.parse(tokenRes.body);
    assert.equal(tokenRes.statusCode, 200);
    assert.match(tokenBody.answer, /sieben Prozent/i, 'Wissen mit gültigem Token muss berücksichtigt werden');
  } finally {
    if (originalKnowledgeToken === undefined) delete process.env.CHATBOT_KNOWLEDGE_TOKEN;
    else process.env.CHATBOT_KNOWLEDGE_TOKEN = originalKnowledgeToken;
    if (originalLlmEnabled === undefined) delete process.env.FENSTERSHOP_LLM_ENABLED;
    else process.env.FENSTERSHOP_LLM_ENABLED = originalLlmEnabled;
  }
}

console.log('api-auth ok');
