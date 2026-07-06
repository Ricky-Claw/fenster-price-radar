import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { polishFenstershopAnswer } from './kimiClient.js';
import { polishFenstershopAnswerNemotron } from './nemotronClient.js';

const KNOWLEDGE_FILE = new URL('../../programmierlogik_chatbot_final_mit_anfrage_status.md', import.meta.url);
const DFS_KNOWLEDGE_FILE = new URL('../../public/data/dfs-knowledge.json', import.meta.url);
const COMPANY_KNOWLEDGE_DIR = fileURLToPath(new URL('../../knowledge/', import.meta.url));

export const CONTACTS = {
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

function companyKnowledgeChunks() {
  const chunks = [];
  let files = [];
  try {
    files = readdirSync(COMPANY_KNOWLEDGE_DIR).filter((name) => /\.(md|txt)$/i.test(name) && !/^anleitung/i.test(name));
  } catch { return chunks; }
  for (const file of files.sort()) {
    let raw = '';
    try { raw = readFileSync(`${COMPANY_KNOWLEDGE_DIR}${file}`, 'utf8'); } catch { continue; }
    let heading = file.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ');
    for (const block of raw.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
      const headingMatch = block.match(/^#{1,3}\s+(.{3,120})$/m);
      if (headingMatch) heading = headingMatch[1].trim();
      const text = block.replace(/^#{1,6}\s+.*$/gm, '').replace(/\s+/g, ' ').trim();
      if (text.length >= 60) chunks.push({ title: heading, text, url: `knowledge/${file}`, sourceType: 'firmenwissen' });
    }
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

export function retrieveFenstershopKnowledge(query, { limit = 3 } = {}) {
  const qTerms = terms(query);
  if (!qTerms.length) return [];
  return knowledgeChunks()
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


function cleanSnippet(text = '', query = '') {
  const qTerms = terms(query);
  const cleaned = String(text)
    .replace(/(Deutscher-FensterShop|Anfrage senden|Whatsapp|Live Chat|Warenkorb|Newsletter abonnieren|Fensterkonfigurator|Türenkonfigurator)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 35 && s.length < 260);
  const ranked = sentences
    .map((sentence) => ({ sentence, score: qTerms.reduce((sum, term) => sum + (lower(sentence).includes(term) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const best = (ranked.find((row) => row.score > 0)?.sentence || sentences[0] || cleaned.slice(0, 220)).trim();
  return `${best}${best.length > 260 ? '…' : ''}`.slice(0, 320);
}

function conciseKnowledgeAnswer(query, chunks, links) {
  const nq = lower(query);
  if (/\bug\b|ug[-\s]?wert/.test(nq)) return `Der Ug-Wert beschreibt die Wärmedämmung der Verglasung. Für das gesamte Fenster ist der Uw-Wert entscheidend, weil er Glas, Rahmen und Randverbund berücksichtigt.\n\nMehr dazu: ${LINKS.glossary}`;
  if (/schallschutz/.test(nq)) return `Schallschutzfenster reduzieren Außenlärm und sorgen für mehr Ruhe im Wohnraum. Wichtig sind passende Schallschutzverglasung, Rahmen und fachgerechter Einbau.\n\nMehr dazu: https://deutscher-fenstershop.de/schallschutzfenster`;
  const snippet = cleanSnippet(chunks[0]?.text || '', query);
  const link = links?.[0];
  return `${snippet}\n\nMehr dazu: ${link?.url || chunks[0]?.url || LINKS.knowledge}`;
}

export function answerFenstershopChatbot({ message = '' } = {}) {
  const text = String(message || '').trim();
  const n = lower(text);
  const sensitive = hasSensitiveData(text);

  if (!text) {
    return result({
      intent: 'empty',
      confidence: 1,
      answer: 'Wie kann ich helfen? Ich kann allgemeine Fragen zu Lieferung, Reklamation, Konfigurator, Montage, Aufmaß und technischen Begriffen beantworten.',
      links: [{ label: 'Fenster-Konfigurator', url: LINKS.configurator }, { label: 'Wissenswertes', url: LINKS.knowledge }],
    });
  }

  if (hasAny(n, [/fahrer.*(da|vor ort|kommt|wartet|steht)/, /lkw.*(da|steht|vor)/, /liefer.*(heute|notfall|akut|jetzt)/, /avisier.*(heute|48|morgen)/, /spedition.*(heute|fahrer|da|steht)/])) {
    return result({
      intent: 'delivery_emergency', action: 'contact_logistics_phone', sensitive,
      answer: `Wenn die Lieferung heute kommt, der Fahrer vor Ort ist oder es ein akuter Liefernotfall ist, wenden Sie sich bitte direkt telefonisch an unsere Logistikabteilung:\n\n${CONTACTS.logisticsPhone}\n\nBitte beachten Sie: Sichtbare Schäden müssen sofort dem Fahrer gemeldet, auf dem Lieferschein vermerkt und mit Fotos dokumentiert werden.`,
      contacts: [{ type: 'phone', label: 'Logistik', value: CONTACTS.logisticsPhone }],
      links: [{ label: 'Versand und Lieferzeiten', url: LINKS.delivery }],
      sources: [{ title: 'Regelwerk: Liefernotfall', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/transportschaden/, /beschadigt/, /schaden.*liefer/, /liverschein|lieferschein/, /(ware|fenster|scheibe|element|tur|palette).*kaputt/, /kaputt.*(geliefert|liefer)/])) {
    return result({
      intent: 'delivery_damage', action: 'open_complaint_form', sensitive,
      answer: `Bei sichtbarem Transportschaden: Bitte den Fahrer direkt informieren, den Schaden auf dem Lieferschein vermerken lassen, Fotos machen und anschließend das Reklamationsformular nutzen.`,
      links: [{ label: 'Reklamationsformular', url: LINKS.complaint }],
      contacts: [{ type: 'email', label: 'Logistik', value: CONTACTS.logisticsEmail }],
      sources: [{ title: 'Regelwerk: Transportschaden', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/bestellstatus/, /bestellung.*(status|produktion|bearbeitung|andern|aendern|storno|auftragsbestatigung)/, /status.*bestellung/, /wo.*bestellung/, /wann.*(bestellung|ware|liefertermin)/, /produktionsstand/])) {
    return result({
      intent: 'order_status', action: 'contact_order_status', sensitive,
      answer: `Ich habe keinen Zugriff auf konkrete Bestellungen, Produktionsstände oder Liefertermine. Bitte senden Sie Ihre Anfrage mit den notwendigen Angaben per E-Mail an:\n\n${CONTACTS.orderStatusEmail}`,
      contacts: [{ type: 'email', label: 'Bestellstatus', value: CONTACTS.orderStatusEmail }],
      sources: [{ title: 'Regelwerk: Bestellstatus', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/zahlung/, /zahlungseingang/, /rechnung/, /paypal/, /uberweisung|ueberweisung/, /bezahlt/])) {
    return result({
      intent: 'payment_status', action: 'contact_payment', sensitive,
      answer: `Ich kann keine Zahlungseingänge oder Rechnungsdetails prüfen. Bitte wenden Sie sich für Zahlungsfragen an:\n\n${CONTACTS.paymentEmail}`,
      contacts: [{ type: 'email', label: 'Zahlung', value: CONTACTS.paymentEmail }],
      sources: [{ title: 'Regelwerk: Zahlungsfragen', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/anfrage[-\s]?id/, /ticket/, /bearbeitungsstand.*anfrage/, /stand.*anfrage/])) {
    return result({
      intent: 'inquiry_status', action: 'contact_inquiry', sensitive,
      answer: `Ich habe keinen Zugriff auf das Ticketsystem und kann den Bearbeitungsstand einer Anfrage nicht prüfen. Bitte senden Sie Ihre Frage zur Anfrage-ID per E-Mail an:\n\n${CONTACTS.inquiryEmail}`,
      contacts: [{ type: 'email', label: 'Anfrage', value: CONTACTS.inquiryEmail }],
      sources: [{ title: 'Regelwerk: Anfrage-ID', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/produkt[-\s]?id/, /konkrete.*konfiguration/, /uw[-\s]?wert.*(genau|produkt|konfiguration)/, /ug[-\s]?wert.*(genau|produkt|konfiguration)/, /schallschutz.*(genau|produkt|konfiguration)/, /rc2|sicherheitsklasse|statik|durchbiegung/])) {
    return result({
      intent: 'technical_specific', action: 'contact_technical_phone', sensitive,
      answer: `Konkrete technische Rückfragen zu einer bestimmten Produkt-ID, einem Profil oder einer konkreten Konfiguration lassen sich telefonisch am besten klären. Bitte wenden Sie sich direkt an unsere technische Abteilung:\n\n${CONTACTS.technicalPhone}`,
      contacts: [{ type: 'phone', label: 'Technik', value: CONTACTS.technicalPhone }, { type: 'email', label: 'Technik', value: CONTACTS.technicalEmail }],
      links: [{ label: 'Fensterbegriffe', url: LINKS.glossary }, { label: 'PVC-Profilschnitte', url: LINKS.profiles }],
      sources: [{ title: 'Regelwerk: konkrete technische Werte', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/lieferzeit/, /versandzeit/, /wie lange.*liefer/, /wann.*geliefert/, /spedition/, /tracking|sendungsverfolgung/])) {
    return result({
      intent: 'delivery_general_time', action: 'answer_with_link', sensitive,
      answer: `Die Lieferzeit hängt von Produkt, Profil, Hersteller und Ausstattung ab. Die voraussichtliche Lieferzeit sehen Sie am Produkt oder im Warenkorb. Mehr dazu: ${LINKS.delivery}`,
      links: [{ label: 'Versand und Lieferzeiten', url: LINKS.delivery }],
      sources: [{ title: 'Regelwerk: allgemeine Lieferzeit', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/konfigurator/, /konfigurieren/, /fenster.*auswahlen|auswaehlen/, /profil.*wahl/, /ma[ßs]e.*eingeben/])) {
    return result({
      intent: 'configurator_help', action: 'answer_with_configurator_link', sensitive,
      answer: `Für Hilfe beim Konfigurieren können Sie den Fenster-Konfigurator nutzen. Bei technischen Problemen oder unklaren Optionen hilft unsere technische Abteilung weiter:\n\n${CONTACTS.technicalPhone}`,
      links: [{ label: 'Fenster-Konfigurator', url: LINKS.configurator }, { label: 'Erklärvideos', url: LINKS.videos }],
      contacts: [{ type: 'phone', label: 'Technik', value: CONTACTS.technicalPhone }],
      sources: [{ title: 'Regelwerk: Konfiguratorhilfe', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/reklamation/, /reklamieren/, /mangel/, /ersatz/, /defekt/])) {
    return result({
      intent: 'complaint', action: 'open_complaint_form', sensitive,
      answer: 'Für Reklamationen nutzen Sie bitte das Reklamationsformular. Bitte übermitteln Sie Fotos und personenbezogene Angaben nur dort, nicht hier im Chat.',
      links: [{ label: 'Reklamationsformular', url: LINKS.complaint }],
      sources: [{ title: 'Regelwerk: Reklamation', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/montage/, /montier/, /konnen sie.*einbau/, /einbau.*(anbieten|moglich|service|buchen)/, /machen sie.*aufmass/])) {
    return result({
      intent: 'montage', action: 'answer_no_montage', sensitive,
      answer: `Wir führen selbst keine Montage aus. Wenn Sie eine Montage wünschen, geben Sie dies bitte direkt in Ihrer Anfrage über das „Anfrage senden"-Formular mit an — wir prüfen dann, ob wir Ihnen in Ihrem Postleitzahlengebiet einen Montagepartner empfehlen können. Eine Empfehlung ist je nach Region nicht immer möglich.`,
      links: [{ label: 'Anfrage senden / Callback', url: LINKS.callback }],
      sources: [{ title: 'Regelwerk: Montage', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (!/versand|liefer/.test(n) && hasAny(n, [/was kostet/, /preis.*(wissen|berechnen|erfahren)/, /schnell.*preis/, /preis.*(fenster|tur|haustur|rollladen)/])) {
    return result({
      intent: 'price_quick', action: 'answer_with_configurator_link', sensitive,
      answer: `Für eine schnelle Preisermittlung nutzen Sie am besten direkt unseren Konfigurator: Dort wählen Sie Größe, Profil, Farbe, Verglasung und Zubehör aus und erhalten sofort eine Preisberechnung.\n\n${LINKS.configurator}\n\nFür größere Anfragen mit mehreren Elementen nutzen Sie gerne das „Anfrage senden"-Formular im Hauptmenü.`,
      links: [{ label: 'Fenster-Konfigurator', url: LINKS.configurator }],
      sources: [{ title: 'Regelwerk: schnelle Preisermittlung', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/abholung/, /abholen/, /selbst.*holen/, /mitnahmegestell/])) {
    return result({
      intent: 'self_pickup', action: 'answer_self_pickup', sensitive,
      answer: `Eine Abholung ist grundsätzlich möglich. Bitte bringen Sie ausreichend Personen für die manuelle Beladung mit. Beladung durch unsere Mitarbeiter: pauschal 50 € pro 5 Fenster. Mitnahmegestell (Einweg-Holzgestell): zusätzlich 60 € pro Gestell. Bitte geeignetes Fahrzeug und Material zur Ladungssicherung einplanen — Fenster und Bauelemente sind schwer, sperrig und empfindlich.`,
      sources: [{ title: 'Regelwerk: Selbstabholung', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  const chunks = retrieveFenstershopKnowledge(text, { limit: 2 });
  const links = sourceLinksForQuery(n);
  if (chunks.length) {
    return result({
      intent: 'knowledge_rag', action: 'answer_from_knowledge', sensitive,
      confidence: 0.82,
      answer: conciseKnowledgeAnswer(text, chunks, links),
      links,
      sources: chunks.map((chunk) => ({ title: chunk.title, url: chunk.url || 'programmierlogik_chatbot_final_mit_anfrage_status.md', type: chunk.sourceType || 'knowledge' })),
    });
  }

  return result({
    intent: 'fallback', action: 'escalate_or_link', sensitive,
    confidence: 0.45,
    answer: `Dazu habe ich keine sichere freigegebene Antwort gefunden. Für technische Fragen erreichen Sie unsere technische Abteilung unter ${CONTACTS.technicalPhone}. Für allgemeine Anfragen können Sie auch den Callback nutzen.`,
    contacts: [{ type: 'phone', label: 'Technik', value: CONTACTS.technicalPhone }],
    links: [{ label: 'Callback / Anfrage senden', url: LINKS.callback }, { label: 'Wissenswertes', url: LINKS.knowledge }],
  });
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

const LLM_PROVIDERS = [
  { name: 'nemotron', polish: polishFenstershopAnswerNemotron },
  { name: 'moonshot', polish: polishFenstershopAnswer },
];

export async function answerFenstershopChatbotWithLlm({ message = '', env = process.env } = {}) {
  const draft = answerFenstershopChatbot({ message });
  if (mustKeepGuardrailDraft(draft)) return draft;
  const knowledge = retrieveFenstershopKnowledge(message, { limit: 3 });
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
