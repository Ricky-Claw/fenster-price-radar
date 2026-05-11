import { readFileSync } from 'node:fs';

const KNOWLEDGE_FILE = new URL('../../programmierlogik_chatbot_final_mit_anfrage_status.md', import.meta.url);

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

const STOPWORDS = new Set('ich du sie er es wir ihr der die das ein eine einer eines einem einen und oder aber wenn dann ist sind war waren mit ohne für auf an im in zu zur zum von vom den dem des bei bitte kann können könnte gerne mal wie was wann wo wohin welche welcher welches meine meiner mein dein ihre ihrer ihre ihre'.split(/\s+/));

function lower(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
}

function terms(value = '') {
  return lower(value).split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !STOPWORDS.has(term));
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasSensitiveData(text) {
  return /\b(bestell(?:nummer|nr)|auftrags(?:nummer|nr)|ticket|anfrage[-\s]?id|rechnung|iban|adresse|lieferadresse|telefonnummer)\b/i.test(text)
    || /\b\d{5,}\b/.test(text);
}

let cachedChunks;
function knowledgeChunks() {
  if (cachedChunks) return cachedChunks;
  let raw = '';
  try { raw = readFileSync(KNOWLEDGE_FILE, 'utf8'); } catch { raw = ''; }
  const chunks = [];
  let heading = 'Chatbot-Regelwerk';
  for (const block of raw.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
    if (/^(\d+\.|[A-ZÄÖÜ][A-ZÄÖÜ\s/-]{8,})/.test(block) && block.length < 120) heading = block.replace(/\n/g, ' ');
    if (block.length >= 90) chunks.push({ title: heading, text: block.replace(/\s+/g, ' ') });
  }
  cachedChunks = chunks;
  return chunks;
}

export function retrieveFenstershopKnowledge(query, { limit = 3 } = {}) {
  const qTerms = terms(query);
  if (!qTerms.length) return [];
  return knowledgeChunks()
    .map((chunk) => {
      const hay = lower(`${chunk.title} ${chunk.text}`);
      const score = qTerms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
    .slice(0, limit)
    .map(({ score, ...chunk }) => chunk);
}

function sourceLinksForQuery(normalized) {
  const links = [];
  if (/liefer|versand|spedition|avis/.test(normalized)) links.push({ label: 'Versand und Lieferzeiten', url: LINKS.delivery });
  if (/reklamation|schaden|beschadigt|transportschaden/.test(normalized)) links.push({ label: 'Reklamationsformular', url: LINKS.complaint });
  if (/konfigurator|konfigurieren|fenster konfigurieren/.test(normalized)) links.push({ label: 'Fenster-Konfigurator', url: LINKS.configurator });
  if (/begriff|uw|ug|u-wert|schallschutz|rc2|profil|technik|glas/.test(normalized)) links.push({ label: 'Fensterbegriffe', url: LINKS.glossary });
  if (/profil|schnitt|zeichnung|pvc|detail/.test(normalized)) links.push({ label: 'PVC-Profilschnitte', url: LINKS.profiles });
  if (/video|erklar/.test(normalized)) links.push({ label: 'Erklärvideos', url: LINKS.videos });
  if (!links.length) links.push({ label: 'Wissenswertes', url: LINKS.knowledge });
  return [...new Map(links.map((link) => [link.url, link])).values()].slice(0, 3);
}

function result({ intent, answer, links = [], contacts = [], confidence = 0.95, sources = [], action = 'answer', sensitive = false }) {
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
  };
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

  if (hasAny(n, [/fahrer.*(da|vor ort|kommt|wartet)/, /liefer.*(heute|notfall|akut|jetzt)/, /avisier.*(heute|48|morgen)/, /spedition.*(heute|fahrer)/])) {
    return result({
      intent: 'delivery_emergency', action: 'contact_logistics_phone', sensitive,
      answer: `Wenn die Lieferung heute kommt, der Fahrer vor Ort ist oder es ein akuter Liefernotfall ist, wenden Sie sich bitte direkt telefonisch an unsere Logistikabteilung:\n\n${CONTACTS.logisticsPhone}`,
      contacts: [{ type: 'phone', label: 'Logistik', value: CONTACTS.logisticsPhone }],
      links: [{ label: 'Versand und Lieferzeiten', url: LINKS.delivery }],
      sources: [{ title: 'Regelwerk: Liefernotfall', url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' }],
    });
  }

  if (hasAny(n, [/transportschaden/, /beschadigt/, /schaden.*liefer/, /liverschein|lieferschein/, /ware.*kaputt/])) {
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
      answer: 'Die Lieferzeit hängt vom Produkt, Profil, Hersteller und der Ausstattung ab. Bei vielen Produkten wird die voraussichtliche Lieferzeit direkt am Produkt oder im Warenkorb angezeigt. Allgemeine Angaben sind unverbindliche Orientierungswerte.',
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

  const chunks = retrieveFenstershopKnowledge(text, { limit: 2 });
  const links = sourceLinksForQuery(n);
  if (chunks.length) {
    const excerpt = chunks[0].text.slice(0, 520).replace(/\s+$/g, '');
    return result({
      intent: 'knowledge_rag', action: 'answer_from_knowledge', sensitive,
      confidence: 0.72,
      answer: `Dazu habe ich folgende interne Wissensquelle gefunden:\n\n${excerpt}${chunks[0].text.length > 520 ? '…' : ''}\n\nBitte beachten Sie: Bei konkreten Bestellungen, Zahlungen oder verbindlichen technischen Einzelwerten verweise ich an den passenden Kontaktweg.`,
      links,
      sources: chunks.map((chunk) => ({ title: chunk.title, url: 'programmierlogik_chatbot_final_mit_anfrage_status.md' })),
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
