import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler from '../api/chatbot.js';
import { answerFenstershopChatbot, retrieveFenstershopKnowledge } from '../src/chatbot/fenstershopChatbot.js';

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
