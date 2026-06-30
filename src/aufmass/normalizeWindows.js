// portable module: no imports from radar internals. In the DFS repo, move to lib/aufmass/.

export const ENUM_OEFFNUNG = Object.freeze(['Dreh', 'Kipp', 'Dreh-Kipp', 'Fest']);
export const ENUM_VERGLASUNG = Object.freeze(['2fach', '3fach']);
export const BREITE_MM_RANGE = Object.freeze({ min: 300, max: 3000 });
export const HOEHE_MM_RANGE = Object.freeze({ min: 300, max: 2600 });
export const ANZAHL_RANGE = Object.freeze({ min: 1, max: 500 });
export const MAX_WINDOWS = 200;
export const TRANSCRIPT_MAX = 6000;

const DEFAULT_OEFFNUNG = 'Dreh-Kipp';
const DEFAULT_VERGLASUNG = '3fach';
const DEFAULT_FARBE = 'Weiß';

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

function snapOeffnungsart(value, reviewReasons) {
  const present = value !== undefined && value !== null && String(value).trim() !== '';
  if (!present) return DEFAULT_OEFFNUNG;
  const key = aliasKey(value);
  const aliases = {
    dk: 'Dreh-Kipp',
    drehkipp: 'Dreh-Kipp',
    festverglast: 'Fest',
    fix: 'Fest',
  };
  const snapped = aliases[key] || ENUM_OEFFNUNG.find((item) => aliasKey(item) === key);
  if (snapped) return snapped;
  reviewReasons.push('oeffnungsart_unklar');
  return DEFAULT_OEFFNUNG;
}

function snapVerglasung(value, reviewReasons) {
  const present = value !== undefined && value !== null && String(value).trim() !== '';
  if (!present) return DEFAULT_VERGLASUNG;
  const key = aliasKey(value);
  const aliases = {
    zweifach: '2fach',
    '2fach': '2fach',
    dreifach: '3fach',
    '3fach': '3fach',
  };
  const snapped = aliases[key] || ENUM_VERGLASUNG.find((item) => aliasKey(item) === key);
  if (snapped) return snapped;
  reviewReasons.push('verglasung_unklar');
  return DEFAULT_VERGLASUNG;
}

function normalizeDimension(rawValue, range, unclearReason, clampedReason, reviewReasons) {
  const value = parseDimensionMm(rawValue);
  if (!value) {
    reviewReasons.push(unclearReason);
    return 0;
  }
  const clamped = clamp(value, range);
  if (clamped !== value) reviewReasons.push(clampedReason);
  return clamped;
}

function normalizeAnzahl(rawValue, reviewReasons) {
  const present = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '';
  if (typeof rawValue === 'string' && present && !/^\d+$/.test(rawValue.trim())) {
    reviewReasons.push('anzahl_unklar');
    const match = rawValue.match(/\d+/);
    const value = match ? Number.parseInt(match[0], 10) || 0 : 1;
    if (!value) return 1;
    const clamped = clamp(value, ANZAHL_RANGE);
    if (clamped !== value) reviewReasons.push('anzahl_geklemmt');
    return clamped;
  }

  const value = coerceInt(rawValue);
  if (!value) {
    if (present) reviewReasons.push('anzahl_unklar');
    return 1;
  }
  const clamped = clamp(value, ANZAHL_RANGE);
  if (clamped !== value) reviewReasons.push('anzahl_geklemmt');
  return clamped;
}

export function normalizeWindow(rawObj) {
  const input = rawObj && typeof rawObj === 'object' ? rawObj : {};
  const reviewReasons = [];
  const breiteMm = normalizeDimension(input.breiteMm, BREITE_MM_RANGE, 'breite_unklar', 'breite_geklemmt', reviewReasons);
  const hoeheMm = normalizeDimension(input.hoeheMm, HOEHE_MM_RANGE, 'hoehe_unklar', 'hoehe_geklemmt', reviewReasons);
  const anzahl = normalizeAnzahl(input.anzahl, reviewReasons);
  const oeffnungsart = snapOeffnungsart(input.oeffnungsart, reviewReasons);
  const verglasung = snapVerglasung(input.verglasung, reviewReasons);

  return {
    raum: String(input.raum || '').slice(0, 200),
    breiteMm,
    hoeheMm,
    anzahl,
    oeffnungsart,
    material: String(input.material || '').slice(0, 200),
    verglasung,
    farbe: String(input.farbe || DEFAULT_FARBE).slice(0, 100),
    notiz: String(input.notiz || '').slice(0, 500),
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

export function normalizeWindowList(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.slice(0, MAX_WINDOWS).map((item) => normalizeWindow(item));
}
