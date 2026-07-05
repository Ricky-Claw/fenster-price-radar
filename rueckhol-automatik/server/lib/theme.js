const COLOR_PATTERNS = [
  /^#([0-9a-f]{3}|[0-9a-f]{6})$/i,
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i,
  /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+\s*(\/\s*[\d.]+)?\)$/i,
];
const POSITION_VALUES = new Set(['center', 'corner', 'bar']);
const LOGO_PATTERN = /\.(svg|png|webp|jpg|jpeg)$/i;
const FONT_PATTERN = /^[a-z0-9\s"',.-]{1,120}$/i;

const DEFAULT_THEME = {
  name: 'Harbor',
  position: 'center',
  colors: {
    accent: '#14532d',
    accent_text: '#f8fafc',
    text: '#0f172a',
    muted: '#475569',
    surface: '#fffcf7',
    border: '#d9e3d7',
    backdrop: 'rgba(15,23,42,0.55)',
  },
  font_family: '"Instrument Sans", "Segoe UI", sans-serif',
  radius: 18,
  logo_url: '',
  logo_max_height: 44,
};

const THEME_PRESETS = [
  DEFAULT_THEME,
  {
    name: 'Clay',
    position: 'corner',
    colors: {
      accent: '#9a3412',
      accent_text: '#fff7ed',
      text: '#1c1917',
      muted: '#57534e',
      surface: '#fffaf5',
      border: '#f3d8c1',
      backdrop: 'rgba(28,25,23,0.55)',
    },
    font_family: '"IBM Plex Sans", "Segoe UI", sans-serif',
    radius: 22,
    logo_url: '',
    logo_max_height: 44,
  },
  {
    name: 'Noon',
    position: 'bar',
    colors: {
      accent: '#1d4ed8',
      accent_text: '#eff6ff',
      text: '#0f172a',
      muted: '#334155',
      surface: '#f8fbff',
      border: '#bfdbfe',
      backdrop: 'rgba(15,23,42,0.4)',
    },
    font_family: '"Avenir Next", "Helvetica Neue", sans-serif',
    radius: 14,
    logo_url: '',
    logo_max_height: 40,
  },
];

const POSITION_LAYOUTS = {
  center: {
    overlay_align: 'center',
    overlay_justify: 'center',
    max_width: '460px',
  },
  corner: {
    overlay_align: 'end',
    overlay_justify: 'end',
    max_width: '360px',
  },
  bar: {
    overlay_align: 'start',
    overlay_justify: 'center',
    max_width: '100%',
  },
};

function cleanColor(value, fallback) {
  const input = String(value || '').trim();
  if (input && COLOR_PATTERNS.some((pattern) => pattern.test(input))) return input;
  return fallback;
}

function cleanFontFamily(value, fallback) {
  const input = String(value || '').trim();
  return input && FONT_PATTERN.test(input) ? input : fallback;
}

function cleanLogoUrl(value) {
  const raw = String(value || '').trim().slice(0, 600);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!LOGO_PATTERN.test(url.pathname)) return '';
    url.hash = '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function cloneTheme(theme) {
  return JSON.parse(JSON.stringify(theme));
}

function normalizeTheme(input) {
  const base = cloneTheme(DEFAULT_THEME);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base;

  const colors = input.colors && typeof input.colors === 'object' && !Array.isArray(input.colors)
    ? input.colors
    : {};
  const position = POSITION_VALUES.has(String(input.position || '').trim())
    ? String(input.position).trim()
    : base.position;

  return {
    name: String(input.name || base.name).trim().slice(0, 80) || base.name,
    position,
    colors: {
      accent: cleanColor(colors.accent, base.colors.accent),
      accent_text: cleanColor(colors.accent_text || colors.accentText, base.colors.accent_text),
      text: cleanColor(colors.text, base.colors.text),
      muted: cleanColor(colors.muted, base.colors.muted),
      surface: cleanColor(colors.surface, base.colors.surface),
      border: cleanColor(colors.border, base.colors.border),
      backdrop: cleanColor(colors.backdrop, base.colors.backdrop),
    },
    font_family: cleanFontFamily(input.font_family || input.fontFamily, base.font_family),
    radius: clampNumber(input.radius, 0, 32, base.radius),
    logo_url: cleanLogoUrl(input.logo_url || input.logoUrl),
    logo_max_height: clampNumber(input.logo_max_height || input.logoMaxHeight, 16, 80, base.logo_max_height),
  };
}

function themeToStyles(themeInput) {
  const theme = normalizeTheme(themeInput);
  return {
    ...theme,
    layout: POSITION_LAYOUTS[theme.position] || POSITION_LAYOUTS.center,
    radius_css: `${theme.radius}px`,
  };
}

function getThemePresets() {
  return THEME_PRESETS.map((theme) => normalizeTheme(theme));
}

module.exports = {
  DEFAULT_THEME,
  POSITION_LAYOUTS,
  THEME_PRESETS,
  getThemePresets,
  normalizeTheme,
  themeToStyles,
};
