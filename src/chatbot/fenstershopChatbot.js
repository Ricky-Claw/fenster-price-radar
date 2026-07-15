import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { polishFenstershopAnswerClaude } from './claudeClient.js';

const KNOWLEDGE_FILE = new URL('../../programmierlogik_chatbot_final_mit_anfrage_status.md', import.meta.url);
const DFS_KNOWLEDGE_FILE = new URL('../../public/data/dfs-knowledge.json', import.meta.url);
const COMPANY_KNOWLEDGE_DIR = fileURLToPath(new URL('../../knowledge/', import.meta.url));

export const CONTACTS = {
  centralPhone: '+49 7221 3022 333',
  logisticsPhone: '+49 7221 3022 157',
  technicalPhone: '+49 7221 3022 126',
  logisticsEmail: 'logistik@deutscher-fenstershop.de',
  technicalEmail: 'technik@deutscher-fenstershop.de',
  orderStatusEmail: 'bestellstatus@deutscher-fenstershop.de',
  paymentEmail: 'zahlung@deutscher-fenstershop.de',
  inquiryEmail: 'anfrage@deutscher-fenstershop.de',
};

export const LINKS = {
  configurator: 'https://deutscher-fenstershop.de/konfigurator/fenster',
  complaint: 'https://deutscher-fenstershop.de/system/reklamation',
  callback: 'https://deutscher-fenstershop.de/callback',
  delivery: 'https://deutscher-fenstershop.de/fenster#versand-und-lieferzeiten',
  terms: 'https://deutscher-fenstershop.de/grafik/agb/AGB.pdf',
  deliveryTerms: 'https://deutscher-fenstershop.de/grafik/agb/Lieferbedingungen.pdf',
  knowledge: 'https://deutscher-fenstershop.de/wissenswertes',
  videos: 'https://deutscher-fenstershop.de/erklaervideo',
  glossary: 'https://deutscher-fenstershop.de/fensterbegriffe',
  profiles: 'https://deutscher-fenstershop.de/profilschnitte-detailzeichnungen/pvc',
};

const RULES_FILE = new URL('../../knowledge/chatbot-regeln.json', import.meta.url);

function resolveRulePlaceholders(value = '') {
  return String(value).replace(/\{\{(contacts|links)\.([a-zA-Z]+)\}\}/g, (match, group, key) => {
    const source = group === 'contacts' ? CONTACTS : LINKS;
    return source[key] ?? match;
  });
}

let cachedRules = null;
function loadHardRules() {
  if (cachedRules) return cachedRules;
  try {
    const parsed = JSON.parse(readFileSync(RULES_FILE, 'utf8'));
    cachedRules = (parsed.regeln || []).map((rule) => ({
      intent: rule.intent,
      action: rule.action,
      patterns: (rule.stichwoerter || []).map((pattern) => new RegExp(pattern)),
      notPatterns: (rule.nicht || []).map((pattern) => new RegExp(pattern)),
      answer: resolveRulePlaceholders(rule.antwort),
      contacts: (rule.kontakte || []).map((contact) => ({ type: contact.type, label: contact.label, value: resolveRulePlaceholders(contact.wert) })),
      links: (rule.links || []).map((link) => ({ label: link.label, url: resolveRulePlaceholders(link.url) })),
      sources: [{ title: `Regelwerk: ${rule.quelle || rule.intent}`, url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    }));
  } catch (error) {
    // Kaputte Regel-Datei darf den Bot nicht töten: laut loggen, ohne harte Regeln weiterlaufen (RAG/Fallback greifen).
    console.error('[chatbot] knowledge/chatbot-regeln.json konnte nicht geladen werden:', error?.message || error);
    cachedRules = [];
  }
  return cachedRules;
}

const STOPWORDS = new Set('ich du sie er es wir ihr der die das ein eine einer eines einem einen und oder aber wenn dann ist sind war waren mit ohne für auf an im in zu zur zum von vom den dem des bei bitte kann können könnte gerne mal wie was wann wo wohin welche welcher welches meine meiner mein dein ihre ihrer hat habe haben wird wurde wurden gibt noch schon auch'.split(/\s+/));

function lower(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
}

function terms(value = '') {
  return lower(value).split(/[^a-z0-9]+/).filter((term) => ((term.length > 2 || ['ug','uw'].includes(term)) && !STOPWORDS.has(term)));
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasSensitiveData(text) {
  return /\b(bestell(?:nummer|nr)|auftrags(?:nummer|nr)|ticket|anfrage[-\s]?id|rechnung|iban|adresse|lieferadresse|telefonnummer)\b/i.test(text)
    || /\b\d{5,}\b/.test(text);
}

export function chunkKnowledgeText(raw, { fallbackHeading = 'Wissen', url = '', sourceType = 'firmenwissen', minLength = 60 } = {}) {
  const chunks = [];
  let heading = fallbackHeading;
  for (const block of String(raw || '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
    const headingMatch = block.match(/^#{1,3}\s+(.{3,120})$/m);
    if (headingMatch) heading = headingMatch[1].trim();
    const text = block.replace(/^#{1,6}\s+.*$/gm, '').replace(/\s+/g, ' ').trim();
    if (text.length >= minLength) chunks.push({ title: heading, text, url, sourceType });
  }
  return chunks;
}

function companyKnowledgeChunks() {
  let files = [];
  try {
    files = readdirSync(COMPANY_KNOWLEDGE_DIR).filter((name) => /\.(md|txt)$/i.test(name) && !/^anleitung/i.test(name));
  } catch { return []; }
  const chunks = [];
  for (const file of files.sort()) {
    let raw = '';
    try { raw = readFileSync(`${COMPANY_KNOWLEDGE_DIR}${file}`, 'utf8'); } catch { continue; }
    chunks.push(...chunkKnowledgeText(raw, {
      fallbackHeading: file.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' '),
      url: `knowledge/${file}`,
      sourceType: 'firmenwissen',
    }));
  }
  return chunks;
}

let cachedChunks;
function knowledgeChunks() {
  if (cachedChunks) return cachedChunks;
  const chunks = [...companyKnowledgeChunks()];
  try {
    const dfs = JSON.parse(readFileSync(DFS_KNOWLEDGE_FILE, 'utf8'));
    for (const doc of dfs.documents || []) {
      for (const chunk of doc.chunks || []) {
        chunks.push({ title: doc.title || doc.url, text: String(chunk.content || '').replace(/\s+/g, ' '), url: doc.url, sourceType: 'dfs_website', chunkIndex: chunk.index || 0 });
      }
    }
  } catch {}
  let raw = '';
  try { raw = readFileSync(KNOWLEDGE_FILE, 'utf8'); } catch { raw = ''; }
  let heading = 'Chatbot-Regelwerk';
  for (const block of raw.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
    if (/^(\d+\.|[A-ZÄÖÜ][A-ZÄÖÜ\s/-]{8,})/.test(block) && block.length < 120) heading = block.replace(/\n/g, ' ');
    if (block.length >= 90) chunks.push({ title: heading, text: block.replace(/\s+/g, ' '), url: 'programmierlogik_chatbot_final_mit_anfrage_status.md', sourceType: 'rule_file' });
  }
  cachedChunks = chunks;
  return chunks;
}

export function retrieveFenstershopKnowledge(query, { limit = 3, extraChunks = [] } = {}) {
  const qTerms = terms(query);
  if (!qTerms.length) return [];
  return [...extraChunks, ...knowledgeChunks()]
    .map((chunk) => {
      const title = lower(chunk.title || '');
      const url = lower(chunk.url || '');
      const body = lower(chunk.text || '');
      const score = qTerms.reduce((sum, term) => {
        let value = 0;
        if (body.includes(term)) value += 1;
        if (title.includes(term)) value += 6;
        if (url.includes(term)) value += 8;
        return sum + value;
      }, 0);
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || (a.chunkIndex || 0) - (b.chunkIndex || 0) || b.text.length - a.text.length)
    .slice(0, limit)
    .map(({ score, ...chunk }) => chunk);
}

// Abteilungs-Routing: spätestens ab der 3. Nachricht einer Sitzung bekommt jede
// Antwort verbindlich Telefon/Mail der passenden Abteilung mit — auch wenn Regel
// oder RAG-Fallback selbst keine Kontakte vorsehen (Elvis-Anfrage: Kunde soll
// nicht endlos mit dem Bot kreisen, sondern spätestens dann an einen Menschen).
const DEPARTMENT_RULES = [
  { label: 'Technik', match: /technik|konfigurator|montage|einbau|uw[-\s]?wert|ug[-\s]?wert|profil|schallschutz|einbruch|rc\d/, contacts: () => [{ type: 'phone', label: 'Technik', value: CONTACTS.technicalPhone }, { type: 'email', label: 'Technik', value: CONTACTS.technicalEmail }] },
  { label: 'Logistik', match: /liefer|versand|spedition|transport|schaden|abholung|abholen|fahrer|lkw|avis/, contacts: () => [{ type: 'phone', label: 'Logistik', value: CONTACTS.logisticsPhone }, { type: 'email', label: 'Logistik', value: CONTACTS.logisticsEmail }] },
  { label: 'Bestellstatus', match: /bestellstatus|bestellung|produktionsstand|auftragsbestatigung/, contacts: () => [{ type: 'email', label: 'Bestellstatus', value: CONTACTS.orderStatusEmail }] },
  { label: 'Zahlung', match: /zahlung|rechnung|paypal|uberweisung|bezahlt/, contacts: () => [{ type: 'email', label: 'Zahlung', value: CONTACTS.paymentEmail }] },
];
const DEFAULT_DEPARTMENT_CONTACTS = () => [{ type: 'phone', label: 'Zentrale', value: CONTACTS.centralPhone }, { type: 'email', label: 'Anfrage', value: CONTACTS.inquiryEmail }];

function departmentContactsFor(normalized) {
  const hit = DEPARTMENT_RULES.find((rule) => rule.match.test(normalized));
  return (hit ? hit.contacts() : DEFAULT_DEPARTMENT_CONTACTS()).filter((contact) => contact.value);
}

function mergeContacts(existing = [], extra = []) {
  const merged = [...existing];
  for (const contact of extra) {
    if (!merged.some((c) => c.value === contact.value)) merged.push(contact);
  }
  return merged;
}

function withDepartmentRouting(draft, normalized) {
  const contacts = mergeContacts(draft.contacts, departmentContactsFor(normalized));
  const contactLine = contacts.map((c) => `${c.label}: ${c.value}`).join(' · ');
  const alreadyMentions = contacts.every((c) => draft.answer.includes(c.value));
  const answer = alreadyMentions
    ? draft.answer
    : `${draft.answer}\n\nFür eine schnelle, persönliche Klärung wenden Sie sich gerne direkt an: ${contactLine}`;
  return { ...draft, contacts, answer };
}

function sourceLinksForQuery(normalized) {
  const links = [];
  if (/liefer|versand|spedition|avis/.test(normalized)) links.push({ label: 'Versand und Lieferzeiten', url: LINKS.delivery });
  if (/reklamation|schaden|beschadigt|transportschaden/.test(normalized)) links.push({ label: 'Reklamationsformular', url: LINKS.complaint });
  if (/konfigurator|konfigurieren|fenster konfigurieren/.test(normalized)) links.push({ label: 'Fenster-Konfigurator', url: LINKS.configurator });
  if (/schallschutz/.test(normalized)) links.push({ label: 'Schallschutzfenster', url: 'https://deutscher-fenstershop.de/schallschutzfenster' });
  if (/begriff|uw|ug|u-wert|schallschutz|rc2|profil|technik|glas/.test(normalized)) links.push({ label: 'Fensterbegriffe', url: LINKS.glossary });
  if (/profil|schnitt|zeichnung|pvc|detail/.test(normalized)) links.push({ label: 'PVC-Profilschnitte', url: LINKS.profiles });
  if (/video|erklar/.test(normalized)) links.push({ label: 'Erklärvideos', url: LINKS.videos });
  if (!links.length) links.push({ label: 'Wissenswertes', url: LINKS.knowledge });
  return [...new Map(links.map((link) => [link.url, link])).values()].slice(0, 3);
}

function result({ intent, answer, links = [], contacts = [], confidence = 0.95, sources = [], action = 'answer', sensitive = false, llm = null }) {
  return {
    ok: true,
    intent,
    action,
    answer: sensitive
      ? `${answer}\n\nDatenschutz-Hinweis: Bitte senden Sie Bestellnummern, Adressen, Zahlungsdaten oder Fotos nicht hier im Chat, sondern nur über die genannten E-Mail-Adressen oder Formulare.`
      : answer,
    contacts,
    links,
    sources,
    confidence,
    guardrails: {
      noBackendAccess: true,
      noOrderStatusClaims: true,
      noPaymentStatusClaims: true,
      noTicketStatusClaims: true,
      noSensitiveDataRequested: true,
      sourcePolicy: 'rules_first_then_published_knowledge',
    },
    llm,
  };
}


// Gibt null zurück statt irgendeiner Notlösung, wenn KEIN Satz einen Suchbegriff
// enthält -- sonst rutscht rohes Seiten-Menü/Navigations-Boilerplate durch, das
// jede DFS-Seite im Kopf trägt ("Fensterkonfigurator ... Warenkorb ist leer ...").
// Aufgetreten bei "Fenster klemmt beim Öffnen" (kein echter Wissenstreffer,
// alle 3 LLMs fehlgeschlagen -> Nutzer sah Navigationsmüll statt Fallback).
// Jede dfs_website-Seite beginnt mit demselben Kopfzeilen-Block (Telefon, Anfrage
// senden/stellen, Whatsapp/Live-Chat, Öffnungszeiten, Konfigurator-Links,
// Warenkorb). "Mo – Fr." erzeugt dabei per Satzzeichen-Split eine kurze,
// scheinbare "Antwort" ohne echten Inhalt (Bug: "Fenster klemmt" bekam nur
// diesen Kopfzeilen-Fetzen zurück). Deshalb den ganzen Block vor dem Satz-Split
// entfernen, nicht nur Einzelphrasen.
const DFS_BOILERPLATE = /(Deutscher-FensterShop|\+?49\s?7221[\s/-]*3022[\s-]*333|Anfrage senden|Anfrage stellen|Whatsapp|Live Chat|Mo\s*[–-]\s*Fr\.?\s*\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}|Ihr Warenkorb ist leer|Gesamtpreis\s*[\d.,]+\s*EUR|Newsletter abonnieren|Fensterkonfigurator|Türenkonfigurator)/gi;

function cleanSnippet(text = '', query = '') {
  const qTerms = terms(query);
  const cleaned = String(text)
    .replace(DFS_BOILERPLATE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 35 && s.length < 260);
  const ranked = sentences
    .map((sentence) => ({ sentence, score: qTerms.reduce((sum, term) => sum + (lower(sentence).includes(term) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const hit = ranked.find((row) => row.score > 0);
  if (!hit) return null;
  const best = hit.sentence.trim();
  return `${best}${best.length > 260 ? '…' : ''}`.slice(0, 320);
}

function conciseKnowledgeAnswer(query, chunks, links) {
  const nq = lower(query);
  if (/\bug\b|ug[-\s]?wert/.test(nq)) return `Der Ug-Wert beschreibt die Wärmedämmung der Verglasung. Für das gesamte Fenster ist der Uw-Wert entscheidend, weil er Glas, Rahmen und Randverbund berücksichtigt.\n\nMehr dazu: ${LINKS.glossary}`;
  if (/schallschutz/.test(nq)) return `Schallschutzfenster reduzieren Außenlärm und sorgen für mehr Ruhe im Wohnraum. Wichtig sind passende Schallschutzverglasung, Rahmen und fachgerechter Einbau.\n\nMehr dazu: https://deutscher-fenstershop.de/schallschutzfenster`;
  const snippet = cleanSnippet(chunks[0]?.text || '', query);
  if (!snippet) return null;
  const link = links?.[0];
  return `${snippet}\n\nMehr dazu: ${link?.url || chunks[0]?.url || LINKS.knowledge}`;
}

export function answerFenstershopChatbot({ message = '', extraChunks = [], turn = 0 } = {}) {
  const text = String(message || '').trim();
  const n = lower(text);
  const sensitive = hasSensitiveData(text);
  // Ab der 3. Nachricht (turn>=3) bekommt JEDE Antwort verbindlich die passende
  // Abteilung mit — unabhängig davon, ob Regel/RAG/Fallback selbst Kontakte vorsehen.
  const finalize = (draft) => (Number(turn) >= 3 ? withDepartmentRouting(draft, n) : draft);

  if (!text) {
    return result({
      intent: 'empty',
      confidence: 1,
      answer: 'Wie kann ich helfen? Ich kann allgemeine Fragen zu Lieferung, Reklamation, Konfigurator, Montage, Aufmaß und technischen Begriffen beantworten.',
      links: [{ label: 'Fenster-Konfigurator', url: LINKS.configurator }, { label: 'Wissenswertes', url: LINKS.knowledge }],
    });
  }

  for (const rule of loadHardRules()) {
    if (rule.notPatterns.some((pattern) => pattern.test(n))) continue;
    if (!hasAny(n, rule.patterns)) continue;
    return finalize(result({
      intent: rule.intent, action: rule.action, sensitive,
      answer: rule.answer,
      contacts: rule.contacts,
      links: rule.links,
      sources: rule.sources,
    }));
  }

  const chunks = retrieveFenstershopKnowledge(text, { limit: 2, extraChunks });
  const links = sourceLinksForQuery(n);
  const knowledgeAnswer = chunks.length ? conciseKnowledgeAnswer(text, chunks, links) : null;
  // conciseKnowledgeAnswer liefert null, wenn kein Satz im besten Treffer die
  // Suchbegriffe enthält -- dann lieber ehrlich in den Fallback statt Seiten-
  // Navigationsmüll als "Antwort" auszugeben.
  if (knowledgeAnswer) {
    return finalize(result({
      intent: 'knowledge_rag', action: 'answer_from_knowledge', sensitive,
      confidence: 0.82,
      answer: knowledgeAnswer,
      links,
      sources: chunks.map((chunk) => ({ title: chunk.title, url: chunk.url || 'programmierlogik_chatbot_final_mit_anfrage_status.md', type: chunk.sourceType || 'knowledge' })),
    }));
  }

  return finalize(result({
    intent: 'fallback', action: 'escalate_or_link', sensitive,
    confidence: 0.45,
    answer: `Dazu habe ich keine sichere freigegebene Antwort gefunden. Für technische Fragen erreichen Sie unsere technische Abteilung unter ${CONTACTS.technicalPhone}. Für allgemeine Anfragen können Sie auch den Callback nutzen.`,
    contacts: [{ type: 'phone', label: 'Technik', value: CONTACTS.technicalPhone }],
    links: [{ label: 'Callback / Anfrage senden', url: LINKS.callback }, { label: 'Wissenswertes', url: LINKS.knowledge }],
  }));
}


const LLM_SAFE_INTENTS = new Set(['knowledge_rag', 'fallback']);

function mustKeepGuardrailDraft(draft) {
  return !LLM_SAFE_INTENTS.has(draft.intent);
}


function withRequiredRefs(answer, draft) {
  let out = String(answer || '').trim();
  const primaryLink = draft.links?.[0]?.url;
  if (primaryLink && !out.includes(primaryLink)) out += `\n\nMehr dazu: ${primaryLink}`;
  for (const contact of draft.contacts || []) {
    if (contact.value && !out.includes(contact.value)) out += `\n${contact.label}: ${contact.value}`;
  }
  return out;
}

const KNOWN_PHONE_DIGITS = new Set(
  Object.values(CONTACTS)
    .filter((value) => /^\+?[\d\s/-]+$/.test(value))
    .map((value) => value.replace(/\D/g, ''))
);

function hasUnknownPhoneNumber(answer) {
  const candidates = String(answer).match(/(\+\d{2}[\d\s/-]{8,})|(\b0\d{3,4}[\s/-]?\d{3,}[\s/-]?\d*)/g) || [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 8 && !KNOWN_PHONE_DIGITS.has(digits) && !KNOWN_PHONE_DIGITS.has(`49${digits.replace(/^0/, '')}`);
  });
}

function answerStillSafe(polished, draft) {
  const answer = String(polished?.answer || '');
  if (!answer) return false;
  if (/[一-鿿]/.test(answer)) return false;
  if (hasUnknownPhoneNumber(answer)) return false;
  for (const contact of draft.contacts || []) if (contact.value && !answer.includes(contact.value)) return false;
  if (/in produktion|morgen versendet|zahlung ist eingegangen|lieferung erfolgt am|ticket ist|\bincludes\b|#seite|lärmgesetzliche/i.test(answer)) return false;
  return true;
}

// Nemotron/Moonshot abgeschaltet (Elvis-Wunsch) -- nur noch Claude Haiku 4.5.
// Schlägt Claude fehl (Auth/Timeout/Guardrail), bleibt der geprüfte Regel-/RAG-
// Entwurf ohne KI-Politur stehen (llm.used:false) statt eines Fremd-LLM-Fallbacks.
const LLM_PROVIDERS = [
  { name: 'claude', polish: polishFenstershopAnswerClaude },
];

export async function answerFenstershopChatbotWithLlm({ message = '', extraChunks = [], env = process.env, turn = 0 } = {}) {
  const draft = answerFenstershopChatbot({ message, extraChunks, turn });
  if (mustKeepGuardrailDraft(draft)) return draft;
  const knowledge = retrieveFenstershopKnowledge(message, { limit: 3, extraChunks });
  for (const provider of LLM_PROVIDERS) {
    let polished;
    try {
      polished = await provider.polish({ message, draft, knowledge, env });
    } catch {
      continue;
    }
    if (!polished || !answerStillSafe(polished, draft)) continue;
    return { ...draft, answer: withRequiredRefs(polished.answer, draft), llm: { used: true, provider: provider.name, model: polished.model } };
  }
  return { ...draft, llm: { used: false, reason: 'all_providers_failed_or_unconfigured' } };
}
