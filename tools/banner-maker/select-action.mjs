export function parseDateRange(str) {
  const match = typeof str === 'string'
    ? str.match(/^(\d{2})\.(\d{2})\.(\d{4}) - (\d{2})\.(\d{2})\.(\d{4})$/)
    : null;

  if (!match) throw new Error(`Ungültiger Datumsbereich: „${str}“. Erwartet: DD.MM.YYYY - DD.MM.YYYY.`);

  const toDate = (day, month, year, endOfDay) => {
    const date = new Date(Number(year), Number(month) - 1, Number(day), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
      throw new Error(`Ungültiges Datum im Datumsbereich: „${str}“.`);
    }
    return date;
  };

  const start = toDate(match[1], match[2], match[3], false);
  const end = toDate(match[4], match[5], match[6], true);
  if (start > end) throw new Error(`Ungültiger Datumsbereich: Start liegt nach dem Ende in „${str}“.`);
  return { start, end };
}

export function selectActiveAction(calendar, now = () => new Date()) {
  const current = now();
  return calendar.find((action) => {
    const { start, end } = parseDateRange(action.dateRange);
    return current >= start && current <= end;
  }) || null;
}

function actionIds(calendar) {
  return calendar.map((action) => action.id).join(', ');
}

function actionRanges(calendar) {
  return calendar.map((action) => `${action.id} (${action.dateRange})`).join(', ');
}

function calendarBrief(action, branding) {
  const badge = action.badge ?? (action.offer.match(/\d+\s*%[^.;,]{0,24}/)?.[0]?.trim().slice(0, 18).trim() || null);
  return {
    mode: 'kalender',
    id: action.id,
    title: action.title,
    claim: action.claim,
    offer: action.offer,
    badge,
    cta: branding.ctaDefault,
    partner: action.partner,
    wordingDont: [...(action.wording?.dont || [])],
  };
}

export function resolveBrief({ aktionId, adhoc, calendar, now = () => new Date(), branding = {} }) {
  if (aktionId) {
    const action = calendar.find((entry) => entry.id === aktionId);
    if (!action) throw new Error(`Unbekannte Aktion „${aktionId}“. Verfügbar: ${actionIds(calendar)}.`);
    return calendarBrief(action, branding);
  }

  if (adhoc) {
    if (!adhoc.title) throw new Error('Ad-hoc-Brief benötigt das Pflichtfeld „title“.');
    if (!adhoc.claim) throw new Error('Ad-hoc-Brief benötigt das Pflichtfeld „claim“.');
    if (adhoc.id && !/^[a-z0-9-]+$/.test(adhoc.id)) {
      throw new Error('Ad-hoc-id darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten');
    }
    const activeAction = selectActiveAction(calendar, now);
    return {
      mode: 'adhoc',
      id: adhoc.id || null,
      title: adhoc.title,
      claim: adhoc.claim,
      offer: adhoc.offer || null,
      badge: adhoc.badge ?? null,
      cta: adhoc.cta ?? branding.ctaDefault,
      partner: adhoc.partner || null,
      wordingDont: [...(activeAction?.wording?.dont || [])],
    };
  }

  const activeAction = selectActiveAction(calendar, now);
  if (!activeAction) throw new Error(`Keine datumsaktive Aktion gefunden. Verfügbar: ${actionRanges(calendar)}.`);
  return calendarBrief(activeAction, branding);
}

const HARD_PATTERNS = [
  /FIFA/i,
  /WM-?Aktion|offizielle[rn]? Turnier/i,
  /auf alle(s| Fenster)?/i,
  /garantiert(e[rn]?)? (Ruhe|Schallschutz|Erstattung|Förderung)/i,
  /Förderung (ist )?sicher/i,
  /Geld garantiert/i,
];

function quotedFragments(rules) {
  return rules.flatMap((rule) => [...String(rule).matchAll(/[„"]([^„”"]+)[”"]/g)].map((match) => match[1]));
}

export function checkAdhocWording(brief) {
  if (brief.mode === 'kalender') return [];

  const violations = [];
  const fields = ['title', 'claim', 'offer', 'badge', 'cta', 'partner'];
  const fragments = quotedFragments(brief.wordingDont || []);

  for (const field of fields) {
    const value = brief[field];
    if (!value) continue;
    for (const pattern of HARD_PATTERNS) {
      if (pattern.test(value)) violations.push(`${field}: unzulässiges Muster „${pattern.source}“.`);
    }
    for (const fragment of fragments) {
      if (value.toLocaleLowerCase('de-DE').includes(fragment.toLocaleLowerCase('de-DE'))) {
        violations.push(`${field}: unzulässiges Fragment „${fragment}“.`);
      }
    }
  }
  return violations;
}
