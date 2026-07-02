// portable module: no imports from radar internals. In the DFS repo, move to lib/aufmass/.

export const AUFMASS_FIELDS = Object.freeze([
  Object.freeze({ key: 'raum', label: 'Raum', type: 'text', default: '', maxLen: 200 }),
  Object.freeze({ key: 'anzahl', label: 'Anzahl', type: 'count', default: 1, min: 1, max: 500, reasonKey: 'anzahl' }),
  Object.freeze({ key: 'breiteMm', label: 'Breite (mm)', type: 'dimension', min: 300, max: 3000, required: true, reasonKey: 'breite' }),
  Object.freeze({ key: 'hoeheMm', label: 'Höhe (mm)', type: 'dimension', min: 300, max: 2600, required: true, reasonKey: 'hoehe' }),
  Object.freeze({
    key: 'oeffnungsart',
    label: 'Öffnungsart',
    type: 'enum',
    options: Object.freeze(['Dreh', 'Kipp', 'Dreh-Kipp', 'Fest']),
    default: 'Dreh-Kipp',
    reasonKey: 'oeffnungsart',
    aliases: Object.freeze({ dk: 'Dreh-Kipp', drehkipp: 'Dreh-Kipp', festverglast: 'Fest', fix: 'Fest' }),
  }),
  Object.freeze({
    key: 'anschlag',
    label: 'Anschlag',
    type: 'enum',
    options: Object.freeze(['DIN links', 'DIN rechts', '—']),
    default: '—',
    reasonKey: 'anschlag',
    aliases: Object.freeze({ dinlinks: 'DIN links', links: 'DIN links', l: 'DIN links', dinrechts: 'DIN rechts', rechts: 'DIN rechts', r: 'DIN rechts' }),
  }),
  Object.freeze({ key: 'material', label: 'Material', type: 'text', default: '', maxLen: 200 }),
  Object.freeze({
    key: 'verglasung',
    label: 'Verglasung',
    type: 'enum',
    options: Object.freeze(['2fach', '3fach']),
    default: '3fach',
    reasonKey: 'verglasung',
    aliases: Object.freeze({ zweifach: '2fach', '2fach': '2fach', dreifach: '3fach', '3fach': '3fach' }),
  }),
  Object.freeze({ key: 'farbe', label: 'Farbe', type: 'text', default: 'Weiß', maxLen: 100 }),
  Object.freeze({ key: 'notiz', label: 'Notiz', type: 'text', default: '', maxLen: 500 }),
]);

export const AUFMASS_FIELD_KEYS = Object.freeze(AUFMASS_FIELDS.map((field) => field.key));

export function displaySchema() {
  return AUFMASS_FIELDS.map((field) => {
    const control = field.type === 'count' || field.type === 'dimension'
      ? 'number'
      : field.type === 'enum'
        ? 'select'
        : 'text';
    const projection = { key: field.key, label: field.label, control };
    if (field.type === 'enum') projection.options = [...field.options];
    return projection;
  });
}
