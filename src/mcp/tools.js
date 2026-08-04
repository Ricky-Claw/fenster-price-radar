// Portable MCP-Tool-Logik für Fensterradar + Rückhol-Popups + DFS-Chatbot.
// Keine MCP-/Transport-Abhängigkeit hier — nur reine Funktionen, damit unit-testbar.
// I/O (fs read, fetch) wird als deps injiziert; api/mcp.js reicht die echten rein.

import fsSync from 'node:fs';
import path from 'node:path';
import { loeseMarkenprofil } from './markenprofile.js';

const RADAR_DATA = 'public/data/price-radar.json';
const TREND_DATA = 'public/data/price-trend-index.json';

function readJsonFile(file, { root = process.cwd(), fs = fsSync } = {}) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

// --- Radar (read-only) ---

export function radarGetSummary(deps = {}) {
  const payload = readJsonFile(RADAR_DATA, deps);
  return {
    generatedAt: payload.generatedAt,
    comparisonBaseline: payload.comparisonBaseline || null,
    summary: payload.summary,
    verification: payload.verification ? { verifiedAt: payload.verification.verifiedAt, samples: payload.verification.samples } : null,
    sources: payload.sources || null,
  };
}

export function radarListConfigs({ brand, profile, layout, glazing, onlyWithPurchase } = {}, deps = {}) {
  const payload = readJsonFile(RADAR_DATA, deps);
  const configs = (payload.configs || []).filter((config) => {
    if (brand && !String(config.brand || '').toLowerCase().includes(String(brand).toLowerCase())) return false;
    if (profile && !String(config.profile || '').toLowerCase().includes(String(profile).toLowerCase())) return false;
    if (layout && (config.layout || '1flg') !== layout) return false;
    if (glazing && !String(config.glazing || '').toLowerCase().includes(String(glazing).toLowerCase())) return false;
    if (onlyWithPurchase && typeof config.purchasePrice !== 'number') return false;
    return true;
  });
  return {
    count: configs.length,
    configs: configs.map(slimConfig),
  };
}

export function radarGetConfig({ key, brand, profile, size } = {}, deps = {}) {
  const payload = readJsonFile(RADAR_DATA, deps);
  const configs = payload.configs || [];
  let found = null;
  if (key) found = configs.find((config) => config.key === key);
  else if (brand && profile && size) {
    found = configs.find((config) =>
      String(config.brand || '').toLowerCase() === String(brand).toLowerCase()
      && String(config.profile || '').toLowerCase() === String(profile).toLowerCase()
      && config.size === size);
  }
  if (!found) return { found: false };
  return { found: true, config: found };
}

export function radarGetTrend(deps = {}) {
  try {
    return readJsonFile(TREND_DATA, deps);
  } catch {
    return { note: 'kein Trend-Index vorhanden' };
  }
}

function slimConfig(config) {
  return {
    key: config.key,
    brand: config.brand,
    profile: config.profile,
    size: config.size,
    glazing: config.glazing,
    layout: config.layout,
    layoutLabel: config.layoutLabel,
    material: config.material,
    dfsCustomerPrice: config.dfsCustomerPrice ?? null,
    bestCompetitor: config.bestCompetitor ?? null,
    delta: config.delta ?? null,
    deltaPct: config.deltaPct ?? null,
    purchasePrice: config.purchasePrice ?? null,
    purchaseMargin: config.purchaseMargin ?? null,
    purchaseMarginPct: config.purchaseMarginPct ?? null,
    verification: config.verification?.status || null,
  };
}

// --- Rückhol-Popups (CRUD über die bestehende VPS-API) ---

function rueckholConfig(env = process.env) {
  const base = env.RUECKHOL_BASE_URL || 'https://rueckhol.schwarzwald-agent.de';
  const token = env.RUECKHOL_ADMIN_TOKEN || '';
  return { base: base.replace(/\/$/, ''), token };
}

async function rueckholFetch(method, pathname, { env = process.env, fetchImpl = globalThis.fetch, body } = {}) {
  const { base, token } = rueckholConfig(env);
  if (!token) throw new Error('RUECKHOL_ADMIN_TOKEN nicht gesetzt — Popup-Zugang nicht konfiguriert');
  const res = await fetchImpl(`${base}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Popup-API ${method} ${pathname} -> HTTP ${res.status}: ${data?.error || text.slice(0, 200)}`);
  return data;
}

const DFS_POPUP_POSITIONS = new Set(['center', 'corner', 'bar']);

export function popupList({ siteId } = {}, deps = {}) {
  const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
  return rueckholFetch('GET', `/api/campaigns${query}`, deps);
}
export function popupAnalytics(_args = {}, deps = {}) {
  return rueckholFetch('GET', '/api/analytics', deps);
}
export function popupCreate(campaign, deps = {}) {
  return rueckholFetch('POST', '/api/campaigns', { ...deps, body: campaign });
}
export function popupUpdate(campaign, deps = {}) {
  if (!campaign?.id) throw new Error('popup_update braucht eine campaign.id');
  return rueckholFetch('PUT', '/api/campaigns', { ...deps, body: campaign });
}
export async function popupDesign({ variante = 'blau', id, siteId, position = 'center', radius = 14, mitLogo = true, vorschau, marke = 'dfs', profil } = {}, deps = {}) {
  const markenprofil = loeseMarkenprofil(marke, profil);
  const cleanId = typeof id === 'string' ? id.trim() : id;
  const cleanSiteId = typeof siteId === 'string' ? siteId.trim() : siteId;
  if (!Object.prototype.hasOwnProperty.call(markenprofil.varianten, variante)) {
    throw new Error(`Unbekannte popup_design-Variante "${variante}". Erlaubt sind: ${Object.keys(markenprofil.varianten).join(', ')}`);
  }
  if (!DFS_POPUP_POSITIONS.has(position)) {
    throw new Error(`Unbekannte popup_design-Position "${position}". Erlaubt sind: center, corner, bar`);
  }
  if (typeof radius !== 'number' || !Number.isInteger(radius) || radius < 0 || radius > 32) {
    throw new Error('popup_design radius muss eine Ganzzahl zwischen 0 und 32 sein');
  }
  if (cleanSiteId === '') throw new Error('popup_design siteId darf nicht leer sein');
  if (cleanSiteId === '*') throw new Error('popup_design unterstützt keinen siteId-Platzhalter "*"');

  const preset = markenprofil.varianten[variante];
  const theme = {
    name: preset.name,
    position,
    colors: { ...preset.colors },
    font_family: markenprofil.schrift,
    radius,
    logo_url: mitLogo === false ? '' : markenprofil.logo,
    logo_max_height: 44,
  };
  const isPreview = vorschau === true || (!cleanId && !cleanSiteId);
  if (isPreview) return { marke, variante, theme, angewendetAuf: [], vorschau: true };

  const listed = await popupList(cleanId || cleanSiteId ? { siteId: cleanSiteId } : {}, deps);
  const campaigns = Array.isArray(listed?.campaigns) ? listed.campaigns : [];
  const campaignSite = (campaign) => campaign?.site_id ?? campaign?.siteId;
  if (cleanSiteId && campaigns.some((campaign) => campaignSite(campaign) !== cleanSiteId)) {
    throw new Error(`popup_design: Auflistung enthält eine Kampagne außerhalb von siteId "${cleanSiteId}"`);
  }
  let targets = cleanSiteId ? campaigns.filter((campaign) => campaignSite(campaign) === cleanSiteId) : campaigns;
  if (cleanId) {
    const campaign = campaigns.find((item) => item?.id === cleanId);
    if (!campaign) throw new Error(`popup_design: Kampagne mit id "${cleanId}" nicht gefunden`);
    if (cleanSiteId && campaignSite(campaign) !== cleanSiteId) {
      throw new Error(`popup_design: Kampagne "${cleanId}" gehört nicht zu siteId "${cleanSiteId}"`);
    }
    targets = [campaign];
  }
  if (!targets.length) {
    if (cleanSiteId) throw new Error(`popup_design: keine Kampagne für siteId ${cleanSiteId} gefunden`);
    throw new Error('popup_design: keine Kampagne gefunden');
  }

  const sites = Array.isArray(listed?.sites) ? listed.sites : [];
  const updates = [];
  for (let index = 0; index < targets.length; index += 3) {
    const batch = targets.slice(index, index + 3).map(async (campaign) => {
      const site = sites.find((entry) => (entry?.id ?? entry?.site_id ?? entry?.siteId) === campaignSite(campaign));
      const body = { id: campaign.id, theme };
      if (site?.name) body.site_name = site.name;
      const response = await popupUpdate(body, deps);
      return { campaign, response };
    });
    const settled = await Promise.allSettled(batch);
    updates.push(...settled.map((result, offset) => result.status === 'fulfilled'
      ? result.value
      : { campaign: targets[index + offset], error: result.reason }));
  }
  const successful = updates.filter((item) => !item.error);
  const failed = updates.filter((item) => item.error);
  const returnedTheme = successful.map((item) => item.response?.campaign?.theme || item.response?.theme).find(Boolean) || theme;
  return {
    marke,
    variante,
    theme: returnedTheme,
    angewendetAuf: successful.map((item) => item.campaign.id),
    ...(failed.length ? { fehlgeschlagen: failed.map((item) => ({ id: item.campaign.id, grund: item.error?.message || String(item.error) })), unvollstaendig: true } : {}),
    vorschau: false,
  };
}
export function popupDelete({ id } = {}, deps = {}) {
  if (!id) throw new Error('popup_delete braucht eine id');
  return rueckholFetch('DELETE', `/api/campaigns?id=${encodeURIComponent(id)}`, deps);
}

// --- E-Books (Generator-Pipeline: Frank/Agents liefern Config, VPS-Worker generiert) ---

import { validateConfig, LIMITS } from '../../tools/ebook-maker/lib/validate.mjs';

export function ebookValidate({ config } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('ebook_validate braucht ein config-Objekt (siehe tools/ebook-maker/example-ebook.json)');
  }
  const errors = validateConfig(config);
  return {
    valid: errors.length === 0,
    errors,
    limits: LIMITS,
    hint: errors.length
      ? 'Inhalte kürzen oder Seiten aufteilen — Limits sind A4-Physik und nicht verhandelbar.'
      : 'Config gültig. Zur Generierung als <slug>.json in den ebook-inbox-Ordner legen; der Worker generiert und veröffentlicht automatisch.',
  };
}

export async function ebookStatus({ slug } = {}, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const clean = String(slug || '').trim();
  if (!/^[a-z0-9-]+$/.test(clean)) throw new Error('ebook_status braucht einen kebab-case slug');
  const base = (env.SELF_BASE_URL || 'https://fenster-price-radar.vercel.app').replace(/\/$/, '');
  const check = async (file) => {
    const url = `${base}/ebooks/${clean}/${file}`;
    try {
      const res = await fetchImpl(url, { method: 'HEAD', redirect: 'manual' });
      return { url, live: res.status === 200 };
    } catch {
      return { url, live: false };
    }
  };
  const [cover, mockup] = await Promise.all([check('assets/cover.png'), check('assets/mockup.png')]);
  return {
    slug: clean,
    generated: cover.live,
    mockupLive: mockup.live,
    cover,
    mockup,
    note: cover.live
      ? 'E-Book ist generiert und deployt. PDF liegt unter /ebooks/<slug>/<slug>.pdf (Login-geschützt).'
      : 'Noch nicht generiert/deployt — Worker-Lauf abwarten oder Config prüfen.',
  };
}

// --- DFS-Website-Chatbot (deutscher-fenstershop.de) ---

export async function dfsChatbotAsk({ message, sessionId } = {}, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const text = String(message || '').trim();
  if (!text) throw new Error('dfs_chatbot_ask braucht eine message');
  const base = (env.DFS_CHATBOT_URL || `${env.SELF_BASE_URL || 'https://fenster-price-radar.vercel.app'}/api/chatbot`).replace(/\/$/, '');
  const res = await fetchImpl(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: text, sessionId: sessionId || 'mcp-agent' }),
  });
  const data = await res.json().catch(() => ({ error: 'invalid_json' }));
  if (!res.ok) throw new Error(`Chatbot HTTP ${res.status}: ${data?.error || ''}`);
  return data;
}
