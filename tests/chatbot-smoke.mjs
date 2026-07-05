import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler from '../api/chatbot.js';
import { answerFenstershopChatbot, answerFenstershopChatbotWithLlm, retrieveFenstershopKnowledge } from '../src/chatbot/fenstershopChatbot.js';


globalThis.fetch = async (url) => {
  if (String(url).includes('integrate.api.nvidia.com')) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Nemotron-Antwort direkt aus Atlas.' } }] }) };
  }
  if (String(url).includes('api.moonshot.ai')) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: 'Kurz poliert aus Atlas.' }) } }] }) };
  }
  throw new Error(`unexpected fetch ${url}`);
};

function ask(message) {
  return answerFenstershopChatbot({ message });
}

let answer = ask('Der Fahrer steht heute vor Ort, was tun?');
assert.equal(answer.intent, 'delivery_emergency');
assert.match(answer.answer, /\+49 7221 3022 157/);
assert.equal(answer.guardrails.noBackendAccess, true);

answer = ask('Wie ist der Status meiner Bestellung 123456?');
assert.equal(answer.intent, 'order_status');
assert.match(answer.answer, /bestellstatus@deutscher-fenstershop\.de/);
assert.match(answer.answer, /keinen Zugriff/i);
assert.match(answer.answer, /Datenschutz-Hinweis/);
assert.doesNotMatch(answer.answer, /in Produktion|morgen versendet|Zahlung ist eingegangen/i);

answer = ask('Ich habe einen sichtbaren Transportschaden bei der Anlieferung');
assert.equal(answer.intent, 'delivery_damage');
assert.equal(answer.links[0].url, 'https://deutscher-fenstershop.de/system/reklamation');

answer = ask('Welchen Uw-Wert hat diese konkrete Produkt-ID?');
assert.equal(answer.intent, 'technical_specific');
assert.match(answer.answer, /\+49 7221 3022 126/);

answer = ask('Kann ich Hilfe beim Konfigurator bekommen?');
assert.equal(answer.intent, 'configurator_help');
assert.ok(answer.links.some((link) => link.url.includes('/konfigurator/fenster')));

answer = ask('Was bedeutet Ug Wert bei Fenstern?');
assert.ok(['knowledge_rag', 'technical_specific'].includes(answer.intent));
assert.ok(answer.links.some((link) => /fensterbegriffe|profilschnitte/.test(link.url)));


const llmAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: { KIMI_API_KEY: 'test', FENSTERSHOP_LLM_MODEL: 'kimi-test' } });
assert.equal(llmAnswer.llm.used, true);
assert.equal(llmAnswer.llm.provider, 'moonshot');
assert.match(llmAnswer.answer, /Kurz poliert aus Atlas\./);
assert.match(llmAnswer.answer, /https:\/\/deutscher-fenstershop\.de\/fensterbegriffe/);

const nemotronAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: { NVIDIA_API_KEY: 'test', KIMI_API_KEY: 'test' } });
assert.equal(nemotronAnswer.llm.used, true);
assert.equal(nemotronAnswer.llm.provider, 'nemotron');
assert.match(nemotronAnswer.answer, /Nemotron-Antwort direkt aus Atlas\./);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes('integrate.api.nvidia.com')) return { ok: false, status: 500 };
  if (String(url).includes('api.moonshot.ai')) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: 'Kimi rettet die Antwort.' }) } }] }) };
  throw new Error(`unexpected fetch ${url}`);
};
const fallbackAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: { NVIDIA_API_KEY: 'test', KIMI_API_KEY: 'test' } });
assert.equal(fallbackAnswer.llm.used, true);
assert.equal(fallbackAnswer.llm.provider, 'moonshot');
assert.match(fallbackAnswer.answer, /Kimi rettet die Antwort\./);
globalThis.fetch = originalFetch;

const noProviderAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: {} });
assert.equal(noProviderAnswer.llm.used, false);

globalThis.fetch = async (url) => {
  if (String(url).includes('api.moonshot.ai')) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: 'Der Uw-Wert 体现了整体的隔热性 ist wichtig.' }) } }] }) };
  throw new Error(`unexpected fetch ${url}`);
};
const chineseLeakAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: { KIMI_API_KEY: 'test' } });
assert.equal(chineseLeakAnswer.llm.used, false, 'Antwort mit chinesischen Zeichen darf nicht durchgehen');
assert.doesNotMatch(chineseLeakAnswer.answer, /[一-鿿]/, 'Draft-Fallback darf keine chinesischen Zeichen enthalten');
globalThis.fetch = originalFetch;
assert.equal(noProviderAnswer.llm.reason, 'all_providers_failed_or_unconfigured');

const llmGuardrail = await answerFenstershopChatbotWithLlm({ message: 'Wie ist der Status meiner Bestellung 123456?', env: { KIMI_API_KEY: 'test', FENSTERSHOP_LLM_MODEL: 'kimi-test' } });
assert.equal(llmGuardrail.intent, 'order_status');
assert.equal(llmGuardrail.llm, null);
assert.match(llmGuardrail.answer, /keinen Zugriff/i);

const chunks = retrieveFenstershopKnowledge('Lieferadresse ändern Kosten', { limit: 2 });
assert.ok(chunks.length >= 1, 'knowledge retrieval should find chatbot md chunks');

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

const req = Readable.from([Buffer.from(JSON.stringify({ message: 'Zahlung eingegangen?' }))]);
req.method = 'POST';
const res = response();
await handler(req, res);
const body = JSON.parse(res.body);
assert.equal(res.statusCode, 200);
assert.equal(body.intent, 'payment_status');
assert.match(body.answer, /zahlung@deutscher-fenstershop\.de/);

console.log('chatbot-smoke ok');
