import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import handler from '../api/aufmass.js';
import { extractWindows } from '../src/aufmass/extractWindows.js';
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
assert.equal(loggedErrors[0][0], '[aufmass] extractWindows failed');

const failedResult = await extractWindows({
  transcript: 'kaputt',
  env: { KIMI_API_KEY: 'test' },
  fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
});
assert.equal(failedResult, null);

const hadFetch = Object.hasOwn(globalThis, 'fetch');
const originalFetch = globalThis.fetch;
const previousKey = process.env.KIMI_API_KEY;
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
