// portable module: no imports from radar internals. In the DFS repo, move to lib/aufmass/.

import { AUFMASS_FIELDS } from './schema.js';

const FIELD_BY_KEY = Object.freeze(Object.fromEntries(AUFMASS_FIELDS.map((field) => [field.key, field])));

export const ENUM_OEFFNUNG = Object.freeze([...FIELD_BY_KEY.oeffnungsart.options]);
export const ENUM_ANSCHLAG = Object.freeze([...FIELD_BY_KEY.anschlag.options]);
export const ENUM_VERGLASUNG = Object.freeze([...FIELD_BY_KEY.verglasung.options]);
export const BREITE_MM_RANGE = Object.freeze({ min: FIELD_BY_KEY.breiteMm.min, max: FIELD_BY_KEY.breiteMm.max });
export const HOEHE_MM_RANGE = Object.freeze({ min: FIELD_BY_KEY.hoeheMm.min, max: FIELD_BY_KEY.hoeheMm.max });
export const ANZAHL_RANGE = Object.freeze({ min: FIELD_BY_KEY.anzahl.min, max: FIELD_BY_KEY.anzahl.max });
export const MAX_WINDOWS = 200;
export const TRANSCRIPT_MAX = 6000;

const REVIEW_REASON_ORDER = Object.freeze([
  'breite_unklar',
  'breite_geklemmt',
  'hoehe_unklar',
  'hoehe_geklemmt',
  'anzahl_unklar',
  'anzahl_geklemmt',
  'oeffnungsart_unklar',
  'anschlag_unklar',
  'verglasung_unklar',
]);

// Keep in sync with extractWindows NON_LATIN_RE.
const NON_LATIN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u1100-\u11FF\u0400-\u04FF\u0500-\u052F\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0E00-\u0E7F\u3000-\u303F\uFF00-\uFFEF]/g;

function stripNonLatin(value) {
  return String(value || '').replace(NON_LATIN_RE, '');
}

function aliasKey(value) {
  return String(value || '').toLowerCase().replace(/[\s-]+/g, '');
}

function coerceInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const digits = value.replace(/\D/g, '');
    if (!digits) return 0;
    return Number.parseInt(digits, 10) || 0;
  }
  return 0;
}

function parseDimensionMm(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const looksLikeMetres = !Number.isInteger(value) && value > 0 && value < 10;
    return Math.round(looksLikeMetres ? value * 1000 : value);
  }

  if (typeof value !== 'string') return 0;
  const match = value.trim().match(/^([+-]?\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\b/i);
  if (!match) return 0;

  const numeric = Number.parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(numeric)) return 0;

  const unit = (match[2] || '').toLowerCase();
  if (unit === 'm') return Math.round(numeric * 1000);
  if (unit === 'cm') return Math.round(numeric * 10);
  if (unit === 'mm') return Math.round(numeric);

  const looksLikeMetres = numeric > 0 && numeric < 10 && /[.,]/.test(match[1]);
  return Math.round(looksLikeMetres ? numeric * 1000 : numeric);
}

function clamp(value, range) {
  if (value < range.min) return range.min;
  if (value > range.max) return range.max;
  return value;
}

function sortReviewReasons(reviewReasons) {
  return [...reviewReasons].sort((left, right) => {
    const leftIndex = REVIEW_REASON_ORDER.indexOf(left);
    const rightIndex = REVIEW_REASON_ORDER.indexOf(right);
    const safeLeft = leftIndex === -1 ? REVIEW_REASON_ORDER.length : leftIndex;
    const safeRight = rightIndex === -1 ? REVIEW_REASON_ORDER.length : rightIndex;
    return safeLeft - safeRight;
  });
}

function normalizeText(rawValue, field) {
  const stripped = stripNonLatin(String(rawValue || field.default)).trim();
  return (stripped || field.default).slice(0, field.maxLen);
}

function snapEnum(value, field, reviewReasons) {
  const present = value !== undefined && value !== null && String(value).trim() !== '';
  if (!present) return field.default;
  const key = aliasKey(value);
  const aliases = field.aliases || {};
  const snapped = aliases[key] || field.options.find((item) => aliasKey(item) === key);
  if (snapped) return snapped;
  reviewReasons.push(`${field.reasonKey}_unklar`);
  return field.default;
}

function normalizeDimension(rawValue, field, reviewReasons) {
  const value = parseDimensionMm(rawValue);
  if (!value) {
    reviewReasons.push(`${field.reasonKey}_unklar`);
    return 0;
  }
  const clamped = clamp(value, field);
  if (clamped !== value) reviewReasons.push(`${field.reasonKey}_geklemmt`);
  return clamped;
}

function normalizeAnzahl(rawValue, field, reviewReasons) {
  const present = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '';
  if (typeof rawValue === 'string' && present && !/^\d+$/.test(rawValue.trim())) {
    reviewReasons.push('anzahl_unklar');
    const match = rawValue.match(/\d+/);
    const value = match ? Number.parseInt(match[0], 10) || 0 : 1;
    if (!value) return 1;
    const clamped = clamp(value, field);
    if (clamped !== value) reviewReasons.push('anzahl_geklemmt');
    return clamped;
  }

  const value = coerceInt(rawValue);
  if (!value) {
    if (present) reviewReasons.push('anzahl_unklar');
    return 1;
  }
  const clamped = clamp(value, field);
  if (clamped !== value) reviewReasons.push('anzahl_geklemmt');
  return clamped;
}

function normalizeField(input, field, reviewReasons) {
  if (field.type === 'text') return normalizeText(input[field.key], field);
  if (field.type === 'count') return normalizeAnzahl(input[field.key], field, reviewReasons);
  if (field.type === 'dimension') return normalizeDimension(input[field.key], field, reviewReasons);
  if (field.type === 'enum') return snapEnum(input[field.key], field, reviewReasons);
  return undefined;
}

export function normalizeWindow(rawObj) {
  const input = rawObj && typeof rawObj === 'object' ? rawObj : {};
  const reviewReasons = [];
  const normalized = {};

  for (const field of AUFMASS_FIELDS) {
    normalized[field.key] = normalizeField(input, field, reviewReasons);
  }

  const sortedReviewReasons = sortReviewReasons(reviewReasons);
  normalized.needsReview = sortedReviewReasons.length > 0;
  normalized.reviewReasons = sortedReviewReasons;
  return normalized;
}

// LLM-Duplikationsmuster: "3 Stück" kommt als 3 identische Zeilen mit anzahl=3 zurück (= 9 Fenster).
// Nur genau dieses Muster kollabieren: n komplett identische Zeilen mit anzahl === n -> eine Zeile.
// Bewusst identische Einzelzeilen (anzahl 1) bleiben unangetastet.
function collapseLlmDuplicates(windows) {
  const groups = new Map();
  for (const windowItem of windows) {
    const key = JSON.stringify(AUFMASS_FIELDS.map((field) => windowItem[field.key]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(windowItem);
  }
  const out = [];
  for (const group of groups.values()) {
    if (group.length > 1 && group[0].anzahl === group.length) out.push(group[0]);
    else out.push(...group);
  }
  return out;
}

export function normalizeWindowList(rawList) {
  if (!Array.isArray(rawList)) return [];
  return collapseLlmDuplicates(rawList.slice(0, MAX_WINDOWS).map((item) => normalizeWindow(item)));
}
