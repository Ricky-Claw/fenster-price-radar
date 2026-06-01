const DFS_PROFILE_IDS = {
  'drutex|iglo 5 classic': 32,
  'drutex|iglo energy classic': 35,
  'drutex|iglo ext': 122,
  'aluplast|ideal neo md': 130,
  'aluplast|ideal 4000': 12,
  'aluplast|ideal 5000': 82,
  'aluplast|ideal 7000': 135,
  'aluplast|ideal 8000': 14,
  'gealan|gealan s8000': 87,
  'gealan|gealan s 8000': 87,
  'gealan|gealan s9000': 66,
  'gealan|gealan s 9000': 66,
  'salamander|salamander 76md': 7,
  'salamander|salamander 76 md': 7,
  'salamander|salamander 82': 74,
  'veka|veka 70': 56,
  'veka|veka 76': 57,
  'veka|veka 82 md': 70,
  'kommerling|kömmerling 70': 152,
  'kömmerling|kömmerling 70': 152,
  'kommerling|kömmerling 88': 153,
  'kömmerling|kömmerling 88': 153,
};

const FENSTERBLICK_PROFILES = [
  [/drutex.*iglo\s*5\s*classic/i, ['Drutex Iglo 5 Classic', 36]],
  [/drutex.*iglo\s*energy\s*classic/i, ['Drutex Iglo Energy Classic', 38]],
  [/drutex.*iglo\s*ext/i, ['Drutex Iglo EXT', 211]],
  [/aluplast.*ideal\s*neo\s*md/i, ['Aluplast Ideal Neo MD', 406]],
  [/aluplast.*ideal\s*4000/i, ['Aluplast Ideal 4000 Classic-Line', 129]],
  [/aluplast.*ideal\s*5000/i, ['Aluplast Ideal 5000 Soft-Line', 131]],
  [/aluplast.*ideal\s*7000/i, ['Aluplast Ideal 7000 Classic-Line', 133]],
  [/aluplast.*ideal\s*8000/i, ['Aluplast Ideal 8000 Classic-Line', 134]],
  [/gealan.*s\s*8000/i, ['Gealan S 8000', 176]],
  [/gealan.*s\s*9000/i, ['Gealan S 9000', 163]],
  [/salamander.*76/i, ['Salamander greenEvolution 76 MD', 239]],
  [/salamander.*82/i, ['Salamander bluEvolution 82 MD Classic', 107]],
];

const FENSTERVERSAND_PROFILE_URLS = [
  [/aluplast.*ideal\s*4000/i, 'https://www.fensterversand.com/fenster/kunststoff/aluplast-ideal-4000.php'],
  [/aluplast.*ideal\s*5000/i, 'https://www.fensterversand.com/fenster/kunststoff/aluplast-ideal-5000.php'],
  [/aluplast.*ideal\s*7000/i, 'https://www.fensterversand.com/fenster/kunststoff/aluplast-ideal-7000.php'],
  [/aluplast.*ideal\s*8000/i, 'https://www.fensterversand.com/fenster/kunststoff/aluplast-ideal-8000.php'],
  [/aluplast/i, 'https://www.fensterversand.com/aluplast-kunststofffenster.php'],
  [/(kommerling|kömmerling)/i, 'https://www.fensterversand.com/fenster/kunststoff/koemmerling.php'],
  [/veka/i, 'https://www.fensterversand.com/fenster/kunststoff/veka.php'],
];

function norm(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/,?\s*[23]fach/g, '')
    .replace(/ö/g, 'ö')
    .replace(/\s+/g, ' ')
    .trim();
}

function profileKey(row) {
  return `${norm(row?.brand)}|${norm(row?.profile)}`;
}

function profileHaystack(row) {
  return `${row?.brand || ''} ${String(row?.profile || '').replace(/,?\s*[23]fach/g, '')}`.trim();
}

function dfsProfileId(row) {
  return row?.providers?.dfs?.profileId || DFS_PROFILE_IDS[profileKey(row)] || null;
}

function appendParams(url, params) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value));
  }
  return target.toString();
}

export function rowConfigLink(row) {
  const pid = dfsProfileId(row);
  if (!pid) return 'https://deutscher-fenstershop.de/konfigurator/fenster';
  return appendParams('https://deutscher-fenstershop.de/konfigurator/fenster', {
    pid,
    tp: 'fenster',
    material: 'pvc',
    width: row?.width,
    height: row?.height,
    glass: row?.glazing,
    opening: row?.opening,
    layout: row?.layout || '1flg',
  });
}

export function providerProfileLink(row, providerId) {
  if (providerId === 'dfs') return rowConfigLink(row);
  const haystack = profileHaystack(row);
  if (providerId === 'fensterblick') {
    const match = FENSTERBLICK_PROFILES.find(([rx]) => rx.test(haystack));
    if (!match) return 'https://www.fensterblick.de/fenster-konfigurator.html';
    const [, [profile, profileId]] = match;
    return appendParams('https://www.fensterblick.de/fenster-konfigurator.html', { profile, profileId });
  }
  if (providerId === 'fensterversand') {
    const match = FENSTERVERSAND_PROFILE_URLS.find(([rx]) => rx.test(haystack));
    return match?.[1] || 'https://www.fensterversand.com/?cid=25&t=fenster-kunststoff';
  }
  return '';
}
