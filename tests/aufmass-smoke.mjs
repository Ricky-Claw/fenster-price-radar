import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import handler from '../api/aufmass.js';
import { extractWindows, hasNonLatinScript } from '../src/aufmass/extractWindows.js';
import { AUFMASS_FIELD_KEYS } from '../src/aufmass/schema.js';
import { normalizeWindow, normalizeWindowList } from '../src/aufmass/normalizeWindows.js';
import { createRateLimiter } from '../src/aufmass/rateLimit.js';

function response() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    writeHead(status, headers = {}) { this.statusCode = status; Object.assign(this.headers, headers); },
    end(chunk = '') { this.body += chunk; },
    status(status) { this.statusCode = status; return this; },
    json(payload) { this.body += JSON.stringify(payload); return this; },
  };
}

const previousSubmitWebhook = process.env.AUFMASS_TICKET_WEBHOOK;
delete process.env.AUFMASS_TICKET_WEBHOOK;
let submitHandler;
try {
  ({ default: submitHandler } = await import('../api/aufmass-submit.js'));
} catch (error) {
  assert.fail(`api/aufmass-submit.js must export default handler (${error?.message || error})`);
} finally {
  if (previousSubmitWebhook === undefined) delete process.env.AUFMASS_TICKET_WEBHOOK;
  else process.env.AUFMASS_TICKET_WEBHOOK = previousSubmitWebhook;
}

const normalized = normalizeWindowList([
  {
    raum: 'Wohnzimmer',
    breiteMm: '1200',
    hoeheMm: '1400',
    anzahl: '2',
    oeffnungsart: 'drehkipp',
    verglasung: '2-fach',
    farbe: 'Anthrazit',
    extra: 'strip me',
  },
  {
    breiteMm: 50,
    hoeheMm: 2601,
    anzahl: 999,
    oeffnungsart: 'schiebe',
    verglasung: 'vierfach',
  },
  {},
]);

assert.equal(normalized[0].breiteMm, 1200);
assert.equal(normalized[0].oeffnungsart, 'Dreh-Kipp');
assert.equal(normalized[0].verglasung, '2fach');
assert.equal(normalized[0].needsReview, false);
assert.equal(Object.hasOwn(normalized[0], 'extra'), false);

assert.deepEqual(AUFMASS_FIELD_KEYS, ['raum', 'anzahl', 'breiteMm', 'hoeheMm', 'oeffnungsart', 'anschlag', 'material', 'verglasung', 'farbe', 'notiz']);

assert.equal(hasNonLatinScript('你好'), true);
assert.equal(hasNonLatinScript('Привет'), true);
assert.equal(hasNonLatinScript('Wohnzimmer 你好'), true);
assert.equal(hasNonLatinScript('Wohnzimmer Weiß Anthrazit größer'), false);

const aufmassHtml = await readFile(new URL('../public/aufmass.html', import.meta.url), 'utf8');
const fieldsLiteral = aufmassHtml.match(/var FIELDS = \[([\s\S]*?)\];/);
assert.ok(fieldsLiteral, 'public/aufmass.html must define inline FIELDS');
const browserFieldKeys = Array.from(fieldsLiteral[1].matchAll(/key:\s*['"]([^'"]+)['"]/g), (match) => match[1]);
assert.deepEqual(browserFieldKeys, AUFMASS_FIELD_KEYS);
assert.match(aufmassHtml, /id="summarySection"/);
assert.match(aufmassHtml, /id="summaryText"/);
assert.match(aufmassHtml, /id="confirmSummary"/);
assert.match(aufmassHtml, /id="rejectSummary"/);
const convertTranscriptBody = aufmassHtml.match(/async function convertTranscript\(\) \{([\s\S]*?)\n        \}/);
assert.ok(convertTranscriptBody, 'public/aufmass.html must define convertTranscript');
assert.match(convertTranscriptBody[1], /^\s*if \(recording && recognition\) \{[\s\S]*?recognition\.stop\(\);/);
assert.match(convertTranscriptBody[1], /hideBanners\(\);\s*hideSummary\(\);\s*var transcript = transcriptEl\.value\.trim\(\);/);
assert.match(aufmassHtml, /confirmSummaryBtn\.addEventListener\('click'/);
assert.match(aufmassHtml, /rejectSummaryBtn\.addEventListener\('click'/);

assert.equal(normalized[1].breiteMm, 300);
assert.equal(normalized[1].hoeheMm, 2600);
assert.equal(normalized[1].anzahl, 500);
assert.equal(normalized[1].oeffnungsart, 'Dreh-Kipp');
assert.equal(normalized[1].verglasung, '3fach');
assert.equal(normalized[1].needsReview, true);
assert.deepEqual(normalized[1].reviewReasons, [
  'breite_geklemmt',
  'hoehe_geklemmt',
  'anzahl_geklemmt',
  'oeffnungsart_unklar',
  'verglasung_unklar',
]);

assert.deepEqual(normalized[2], {
  raum: '',
  anzahl: 1,
  breiteMm: 0,
  hoeheMm: 0,
  oeffnungsart: 'Dreh-Kipp',
  anschlag: '—',
  material: '',
  verglasung: '3fach',
  farbe: 'Weiß',
  notiz: '',
  needsReview: true,
  reviewReasons: ['breite_unklar', 'hoehe_unklar'],
});
assert.deepEqual(normalizeWindowList({}), []);

assert.equal(normalizeWindow({ breiteMm: '120 cm', hoeheMm: '1400' }).breiteMm, 1200);
assert.equal(normalizeWindow({ breiteMm: '1,20 m', hoeheMm: '1400' }).breiteMm, 1200);
assert.equal(normalizeWindow({ breiteMm: '1200 mm', hoeheMm: '1400' }).breiteMm, 1200);

const strippedTextWindow = normalizeWindow({ raum: 'Küche 厨房', material: 'Holz 木' });
assert.equal(strippedTextWindow.raum, 'Küche');
assert.equal(strippedTextWindow.material, 'Holz');
assert.equal(normalizeWindow({ farbe: 'Weiß' }).farbe, 'Weiß');

let t = 1000;
const rl = createRateLimiter({ windowMs: 1000, maxPerKey: 2, maxGlobal: 3, now: () => t });
assert.equal(rl.check('A').allowed, true);
assert.equal(rl.check('A').allowed, true);
const a3 = rl.check('A');
assert.equal(a3.allowed, false);
assert.equal(a3.scope, 'key');
assert.ok(a3.retryAfterSeconds >= 1);
assert.equal(rl.check('B').allowed, true);
const c = rl.check('C');
assert.equal(c.allowed, false);
assert.equal(c.scope, 'global');
t += 1001;
assert.equal(rl.check('A').allowed, true);
console.log('aufmass-rate-limit ok');

const emptySubmitReq = {
  method: 'POST',
  headers: { 'x-real-ip': '203.0.113.10' },
  body: { windows: [] },
};
const emptySubmitRes = response();
await submitHandler(emptySubmitReq, emptySubmitRes);
const emptySubmitBody = JSON.parse(emptySubmitRes.body);
assert.equal(emptySubmitRes.statusCode, 400);
assert.equal(emptySubmitBody.error, 'empty_list');

const validSubmitReq = {
  method: 'POST',
  headers: { 'x-real-ip': '203.0.113.11' },
  body: {
    windows: [{
      raum: 'Wohnzimmer',
      anzahl: 1,
      breiteMm: 1200,
      hoeheMm: 1400,
      oeffnungsart: 'Dreh-Kipp',
      anschlag: 'DIN links',
      material: 'Kunststoff',
      verglasung: '3fach',
      farbe: 'Weiß',
      notiz: '',
    }],
  },
};
const validSubmitRes = response();
await submitHandler(validSubmitReq, validSubmitRes);
const validSubmitBody = JSON.parse(validSubmitRes.body);
assert.equal(validSubmitRes.statusCode, 200);
assert.equal(validSubmitBody.ok, true);
assert.equal(validSubmitBody.forwarded, false);
assert.equal(typeof validSubmitBody.reference, 'string');
assert.match(validSubmitBody.reference, /^AUF-/);
assert.equal(validSubmitBody.windowCount, 1);

const putSubmitReq = { method: 'PUT', headers: { 'x-real-ip': '203.0.113.12' }, body: {} };
const putSubmitRes = response();
await submitHandler(putSubmitReq, putSubmitRes);
assert.equal(putSubmitRes.statusCode, 405);

let submitRateLimitRes;
for (let i = 0; i < 6; i += 1) {
  const req = {
    method: 'POST',
    headers: { 'x-real-ip': '203.0.113.13' },
    body: validSubmitReq.body,
  };
  submitRateLimitRes = response();
  await submitHandler(req, submitRateLimitRes);
}
const submitRateLimitBody = JSON.parse(submitRateLimitRes.body);
assert.equal(submitRateLimitRes.statusCode, 429);
assert.equal(submitRateLimitBody.error, 'rate_limited');

const capped = normalizeWindow({
  breiteMm: 1200,
  hoeheMm: 1400,
  raum: 'r'.repeat(1000),
  material: 'm'.repeat(1000),
  farbe: 'f'.repeat(1000),
  notiz: 'n'.repeat(1000),
});
assert.equal(capped.raum.length, 200);
assert.equal(capped.material.length, 200);
assert.equal(capped.farbe.length, 100);
assert.equal(capped.notiz.length, 500);

const zeroCount = normalizeWindow({ breiteMm: 1200, hoeheMm: 1400, anzahl: 0 });
assert.equal(zeroCount.anzahl, 1);
assert.equal(zeroCount.needsReview, true);
assert.ok(zeroCount.reviewReasons.includes('anzahl_unklar'));

const rangeCount = normalizeWindow({ anzahl: '2-3' });
assert.equal(rangeCount.anzahl, 2);
assert.equal(rangeCount.needsReview, true);
assert.ok(rangeCount.reviewReasons.includes('anzahl_unklar'));

const cleanStringCount = normalizeWindow({ anzahl: '3' });
assert.equal(cleanStringCount.anzahl, 3);
assert.ok(!cleanStringCount.reviewReasons.includes('anzahl_unklar'));

const cleanNumberCount = normalizeWindow({ anzahl: 3 });
assert.equal(cleanNumberCount.anzahl, 3);
assert.ok(!cleanNumberCount.reviewReasons.includes('anzahl_unklar'));

const leftHinge = normalizeWindow({ oeffnungsart: 'DK', anschlag: 'links' });
assert.equal(leftHinge.anschlag, 'DIN links');

const defaultHinge = normalizeWindow({});
assert.equal(defaultHinge.anschlag, '—');
assert.ok(!defaultHinge.reviewReasons.includes('anschlag_unklar'));

const unclearHinge = normalizeWindow({ anschlag: 'quatsch' });
assert.ok(unclearHinge.reviewReasons.includes('anschlag_unklar'));

let llmRequestBody = null;
const llmResult = await extractWindows({
  transcript: 'Wohnzimmer 120 auf 140',
  env: { KIMI_API_KEY: 'test', FENSTERSHOP_LLM_MODEL: 'kimi-test' },
  fetchImpl: async (_url, options) => {
    llmRequestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              windows: [{ raum: 'Wohnzimmer', breiteMm: 1200 }],
              zusammenfassung: 'Ein Fenster im Wohnzimmer mit 120 x 140 cm.',
            }),
          },
        }],
      }),
    };
  },
});
assert.match(llmRequestBody.messages[0].content, /zusammenfassung/);
assert.match(llmRequestBody.messages[0].content, /WICHTIG: Antworte ausschließlich auf Deutsch/);
assert.equal(llmRequestBody.max_tokens, 2500);
assert.equal(llmResult.model, 'kimi-test');
assert.deepEqual(llmResult.windows, [{ raum: 'Wohnzimmer', breiteMm: 1200 }]);
assert.equal(llmResult.summary, 'Ein Fenster im Wohnzimmer mit 120 x 140 cm.');

const fencedResult = await extractWindows({
  transcript: 'Bad fix 60 auf 40',
  env: { KIMI_API_KEY: 'test' },
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '```json\n{"windows":[{"raum":"Bad"}],"zusammenfassung":123}\n```' } }] }),
  }),
});
assert.deepEqual(fencedResult.windows, [{ raum: 'Bad' }]);
assert.equal(fencedResult.summary, '');

const proseResult = await extractWindows({
  transcript: 'Flur 100 auf 120',
  env: { KIMI_API_KEY: 'test' },
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'Hier ist das JSON:\n{"windows":[{"raum":"Flur"}]}' } }] }),
  }),
});
assert.deepEqual(proseResult.windows, [{ raum: 'Flur' }]);
assert.equal(proseResult.summary, '');

const chineseOnlyConsoleError = console.error;
const chineseOnlyLoggedErrors = [];
console.error = (...args) => { chineseOnlyLoggedErrors.push(args); };
let chineseOnlyResult;
try {
  chineseOnlyResult = await extractWindows({
    transcript: 'x',
    env: { KIMI_API_KEY: 'test' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              windows: [{ raum: 'Wohnzimmer', breiteMm: 1200 }],
              zusammenfassung: '你好世界',
            }),
          },
        }],
      }),
    }),
  });
} finally {
  console.error = chineseOnlyConsoleError;
}
assert.equal(chineseOnlyResult, null);
assert.equal(chineseOnlyLoggedErrors.length, 1);
assert.equal(chineseOnlyLoggedErrors[0][0], '[aufmass] KIMI non-german output rejected');

const languageFallbackConsoleError = console.error;
const languageFallbackLoggedErrors = [];
console.error = (...args) => { languageFallbackLoggedErrors.push(args); };
let languageFallbackResult;
const languageFallbackUrls = [];
try {
  languageFallbackResult = await extractWindows({
    transcript: 'Wohnzimmer 120 auf 140',
    env: { NVIDIA_API_KEY: 'nvidia-test', KIMI_API_KEY: 'kimi-test' },
    fetchImpl: async (url) => {
      languageFallbackUrls.push(String(url));
      if (String(url).includes('nvidia.com')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify({
                  windows: [{ raum: '卧室', breiteMm: 1200 }],
                  zusammenfassung: '你好世界',
                }),
              },
            }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                windows: [{ raum: 'Wohnzimmer', breiteMm: 1200, hoeheMm: 1400 }],
                zusammenfassung: 'Ein Fenster im Wohnzimmer.',
              }),
            },
          }],
        }),
      };
    },
  });
} finally {
  console.error = languageFallbackConsoleError;
}
assert.match(languageFallbackUrls[0], /integrate\.api\.nvidia\.com/);
assert.match(languageFallbackUrls[1], /api\.moonshot\.ai/);
assert.deepEqual(languageFallbackResult.windows, [{ raum: 'Wohnzimmer', breiteMm: 1200, hoeheMm: 1400 }]);
assert.equal(languageFallbackResult.summary, 'Ein Fenster im Wohnzimmer.');
assert.equal(languageFallbackResult.provider, 'KIMI');
assert.equal(languageFallbackLoggedErrors.length, 1);
assert.equal(languageFallbackLoggedErrors[0][0], '[aufmass] NEMOTRON non-german output rejected');

let nemotronPrimaryUrl = '';
let nemotronPrimaryBody = null;
const nemotronPrimaryResult = await extractWindows({
  transcript: 'Bad fest 60 auf 40',
  env: { NVIDIA_API_KEY: 'nvidia-test', KIMI_API_KEY: 'kimi-test', FENSTERSHOP_NEMOTRON_MODEL: 'nemotron-test' },
  fetchImpl: async (url, options) => {
    nemotronPrimaryUrl = String(url);
    nemotronPrimaryBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '<think>{"draft":true}</think>\n{"windows":[{"raum":"Bad","breiteMm":600,"hoeheMm":400}],"zusammenfassung":"Ein Fenster im Bad."}',
          },
        }],
      }),
    };
  },
});
assert.match(nemotronPrimaryUrl, /^https:\/\/integrate\.api\.nvidia\.com/);
assert.equal(nemotronPrimaryBody.model, 'nemotron-test');
assert.equal(nemotronPrimaryBody.stream, false);
assert.equal(Object.hasOwn(nemotronPrimaryBody, 'response_format'), false);
assert.deepEqual(nemotronPrimaryResult.windows, [{ raum: 'Bad', breiteMm: 600, hoeheMm: 400 }]);
assert.equal(nemotronPrimaryResult.summary, 'Ein Fenster im Bad.');
assert.equal(nemotronPrimaryResult.provider, 'NEMOTRON');

const fallbackConsoleError = console.error;
const fallbackLoggedErrors = [];
console.error = (...args) => { fallbackLoggedErrors.push(args); };
let fallbackResult;
const fallbackUrls = [];
try {
  fallbackResult = await extractWindows({
    transcript: 'Kueche 100 auf 120',
    env: { NVIDIA_API_KEY: 'nvidia-test', KIMI_API_KEY: 'kimi-test', FENSTERSHOP_LLM_MODEL: 'kimi-fallback-test' },
    fetchImpl: async (url) => {
      fallbackUrls.push(String(url));
      if (String(url).includes('nvidia.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                windows: [{ raum: 'Kueche', breiteMm: 1000, hoeheMm: 1200 }],
                zusammenfassung: 'Ein Fenster in der Kueche.',
              }),
            },
          }],
        }),
      };
    },
  });
} finally {
  console.error = fallbackConsoleError;
}
assert.match(fallbackUrls[0], /integrate\.api\.nvidia\.com/);
assert.match(fallbackUrls[1], /api\.moonshot\.ai/);
assert.deepEqual(fallbackResult.windows, [{ raum: 'Kueche', breiteMm: 1000, hoeheMm: 1200 }]);
assert.equal(fallbackResult.summary, 'Ein Fenster in der Kueche.');
assert.equal(fallbackResult.model, 'kimi-fallback-test');
assert.equal(fallbackResult.provider, 'KIMI');
assert.equal(fallbackLoggedErrors.length, 1);
assert.equal(fallbackLoggedErrors[0][0], '[aufmass] NEMOTRON failed');
assert.equal(fallbackLoggedErrors[0][1], 500);

let noKeyFetchCalled = false;
const noKeyResult = await extractWindows({
  transcript: 'Bad fest 60 auf 40',
  env: {},
  fetchImpl: async () => { noKeyFetchCalled = true; },
});
assert.equal(noKeyResult, null);
assert.equal(noKeyFetchCalled, false);

const originalConsoleError = console.error;
const loggedErrors = [];
console.error = (...args) => { loggedErrors.push(args); };
try {
  const throwingResult = await extractWindows({
    transcript: 'kaputt',
    env: { KIMI_API_KEY: 'test' },
    fetchImpl: async () => { throw new Error('network'); },
  });
  assert.equal(throwingResult, null);
} finally {
  console.error = originalConsoleError;
}
assert.equal(loggedErrors.length, 1);
assert.equal(loggedErrors[0][0], '[aufmass] KIMI failed');

const failedLoggedErrors = [];
console.error = (...args) => { failedLoggedErrors.push(args); };
let failedResult;
try {
  failedResult = await extractWindows({
    transcript: 'kaputt',
    env: { KIMI_API_KEY: 'test' },
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  });
} finally {
  console.error = originalConsoleError;
}
assert.equal(failedResult, null);
assert.equal(failedLoggedErrors.length, 1);
assert.equal(failedLoggedErrors[0][0], '[aufmass] KIMI failed');
assert.equal(failedLoggedErrors[0][1], 500);

const hadFetch = Object.hasOwn(globalThis, 'fetch');
const originalFetch = globalThis.fetch;
const previousKey = process.env.KIMI_API_KEY;
const previousNvidiaKey = process.env.NVIDIA_API_KEY;
try {
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.moonshot.ai')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                windows: [{ raum: 'Kueche', breiteMm: 1200, hoeheMm: 1300 }],
                zusammenfassung: 'Ein Fenster in der Kueche mit 120 x 130 cm.',
              }),
            },
          }],
        }),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  delete process.env.NVIDIA_API_KEY;
  process.env.KIMI_API_KEY = 'test';

  const req = Readable.from([Buffer.from(JSON.stringify({ transcript: 'Kueche 120 auf 130' }))]);
  req.method = 'POST';
  const res = response();
  await handler(req, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.source, 'llm');
  assert.equal(body.summary, 'Ein Fenster in der Kueche mit 120 x 130 cm.');
  assert.equal(body.meta.transcriptChars, 'Kueche 120 auf 130'.length);
  assert.equal(body.meta.transcriptTruncated, false);
  assert.equal(body.meta.windowCount, 1);
  assert.equal(body.meta.uncertainCount, 0);
  assert.equal(body.meta.model, 'moonshot-v1-8k');

  const emptyReq = Readable.from([Buffer.from(JSON.stringify({ transcript: '  ' }))]);
  emptyReq.method = 'POST';
  const emptyRes = response();
  await handler(emptyReq, emptyRes);
  const emptyBody = JSON.parse(emptyRes.body);
  assert.equal(emptyRes.statusCode, 400);
  assert.equal(emptyBody.error, 'empty_transcript');
} finally {
  if (hadFetch) globalThis.fetch = originalFetch;
  else delete globalThis.fetch;

  if (previousKey === undefined) delete process.env.KIMI_API_KEY;
  else process.env.KIMI_API_KEY = previousKey;

  if (previousNvidiaKey === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = previousNvidiaKey;
}

const badJsonReq = Readable.from([Buffer.from('{"transcript":')]);
badJsonReq.method = 'POST';
const badJsonRes = response();
await handler(badJsonReq, badJsonRes);
const badJsonBody = JSON.parse(badJsonRes.body);
assert.equal(badJsonRes.statusCode, 400);
assert.equal(badJsonBody.error, 'invalid_json');

const oversizedReq = Readable.from([Buffer.alloc(65537, 'a')]);
oversizedReq.method = 'POST';
const oversizedRes = response();
await handler(oversizedReq, oversizedRes);
const oversizedBody = JSON.parse(oversizedRes.body);
assert.notEqual(oversizedRes.statusCode, 200);
assert.ok([400, 413].includes(oversizedRes.statusCode));
assert.equal(oversizedBody.error, 'request_too_large');

const oversizedStringReq = { method: 'POST', body: JSON.stringify({ transcript: 'x'.repeat(70000) }) };
const oversizedStringRes = response();
await handler(oversizedStringReq, oversizedStringRes);
assert.equal(oversizedStringRes.statusCode, 413);

const oversizedObjectReq = { method: 'POST', body: { transcript: 'x'.repeat(70000) } };
const oversizedObjectRes = response();
await handler(oversizedObjectReq, oversizedObjectRes);
assert.equal(oversizedObjectRes.statusCode, 413);

const middleware = await readFile(new URL('../middleware.js', import.meta.url), 'utf8');
assert.match(middleware, /cpath === ['"]\/aufmass\.html['"]/);
const publicFileMatch = middleware.match(/const PUBLIC_FILE = ([^\n]+)/);
assert.ok(publicFileMatch);
assert.doesNotMatch(publicFileMatch[1], /html/);

console.log('aufmass-smoke ok');
