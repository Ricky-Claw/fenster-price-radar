const DFS_COLORS = {
  blue: '#003A66',
  blueHover: '#002A4C',
  orange: '#F47C26',
  orangeHover: '#D86818',
  skyblue: '#3FA9F5',
  text: '#333333',
  muted: '#6B7280',
  border: '#E5E7EB',
  soft: '#F5F5F5',
  white: '#FFFFFF',
};

// Diese Muster entsprechen sinngemäß den Validierungsregeln aus rueckhol-automatik/server/lib/theme.js.
const COLOR_PATTERNS = [
  /^#([0-9a-f]{3}|[0-9a-f]{6})$/i,
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i,
  /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+\s*(\/\s*[\d.]+)?\)$/i,
];
const FONT_PATTERN = /^[a-z0-9\s"',.-]{1,120}$/i;
const LOGO_PATTERN = /\.(svg|png|webp|jpg|jpeg)$/i;

function hexLuminance(value) {
  const raw = value.slice(1);
  const hex = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
  const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return channels.reduce((sum, channel, index) => sum + (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index], 0);
}

export const MARKENPROFILE = {
  dfs: {
    name: 'Deutscher Fenstershop',
    schrift: 'Arial, Helvetica, sans-serif',
    logo: 'https://deutscher-fenstershop.de/grafik/logo/fenster-online-kaufen-logo.png',
    varianten: {
      // Weiß auf Blau: ca. 11,3:1 Kontrast.
      blau: { name: 'DFS Blau', colors: { accent: DFS_COLORS.blue, accent_text: DFS_COLORS.white, text: DFS_COLORS.text, muted: DFS_COLORS.muted, surface: DFS_COLORS.white, border: DFS_COLORS.border, backdrop: 'rgba(0,58,102,0.55)' } },
      // #333333 auf Orange: ca. 5,2:1 Kontrast; Weiß wäre nur ca. 2,7:1.
      orange: { name: 'DFS Orange', colors: { accent: DFS_COLORS.orange, accent_text: DFS_COLORS.text, text: DFS_COLORS.text, muted: DFS_COLORS.muted, surface: DFS_COLORS.white, border: DFS_COLORS.border, backdrop: 'rgba(0,58,102,0.55)' } },
      // #333333 auf Orange: ca. 5,2:1 Kontrast.
      hell: { name: 'DFS Hell', colors: { accent: DFS_COLORS.orange, accent_text: DFS_COLORS.text, text: DFS_COLORS.blue, muted: DFS_COLORS.muted, surface: DFS_COLORS.soft, border: DFS_COLORS.border, backdrop: 'rgba(0,58,102,0.5)' } },
    },
  },
};

export function pruefeMarkenprofil(profil) {
  if (!profil || typeof profil !== 'object' || Array.isArray(profil)) throw new Error('Markenprofil muss ein Objekt sein');
  for (const feld of ['name', 'schrift', 'logo']) {
    if (typeof profil[feld] !== 'string') throw new Error(`Markenprofil-Feld "${feld}" muss ein String sein`);
  }
  if (!FONT_PATTERN.test(profil.schrift)) throw new Error(`Markenprofil-Feld "schrift" enthält einen ungültigen Wert: ${profil.schrift}`);
  if (profil.logo) {
    let logoUrl;
    try { logoUrl = new URL(profil.logo); } catch (_) { logoUrl = null; }
    if (!logoUrl || logoUrl.protocol !== 'https:' || !LOGO_PATTERN.test(logoUrl.pathname)) {
      throw new Error(`Markenprofil-Feld "logo" enthält einen ungültigen Wert: ${profil.logo}`);
    }
  }
  if (!profil.varianten || typeof profil.varianten !== 'object' || Array.isArray(profil.varianten) || !Object.keys(profil.varianten).length) throw new Error('Markenprofil braucht mindestens eine Variante');
  const colorFields = ['accent', 'accent_text', 'text', 'muted', 'surface', 'border', 'backdrop'];
  for (const [key, variante] of Object.entries(profil.varianten)) {
    if (!variante || typeof variante.name !== 'string' || !variante.colors || typeof variante.colors !== 'object') throw new Error(`Markenprofil-Variante "${key}" ist ungültig (name und colors erforderlich)`);
    for (const feld of colorFields) {
      const wert = variante.colors[feld];
      if (typeof wert !== 'string' || !wert || !COLOR_PATTERNS.some((pattern) => pattern.test(wert))) {
        throw new Error(`Markenprofil-Variante "${key}" enthält in colors.${feld} einen ungültigen Wert: ${wert}`);
      }
    }
    const { accent, accent_text: accentText } = variante.colors;
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent) && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(accentText)) {
      const contrast = (Math.max(hexLuminance(accent), hexLuminance(accentText)) + 0.05) / (Math.min(hexLuminance(accent), hexLuminance(accentText)) + 0.05);
      if (contrast < 4.5) throw new Error(`Markenprofil-Variante "${key}" unterschreitet den Kontrast von colors.accent_text (${accentText}) zu colors.accent (${accent}): ${contrast.toFixed(2)}:1`);
    }
  }
  return profil;
}

export function loeseMarkenprofil(marke = 'dfs', eigenesProfil) {
  if (eigenesProfil !== undefined) return pruefeMarkenprofil(eigenesProfil);
  const key = String(marke).toLowerCase();
  if (!MARKENPROFILE[key]) throw new Error(`Unbekannte Marke "${marke}". Bekannte Kennungen: ${Object.keys(MARKENPROFILE).join(', ')}`);
  return MARKENPROFILE[key];
}
