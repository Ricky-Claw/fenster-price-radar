// Portable MCP-Tool-Logik für Fensterradar + Rückhol-Popups + DFS-Chatbot.
// Keine MCP-/Transport-Abhängigkeit hier — nur reine Funktionen, damit unit-testbar.
// I/O (fs read, fetch) wird als deps injiziert; api/mcp.js reicht die echten rein.

import fsSync from 'node:fs';
import path from 'node:path';

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
export function popupDelete({ id } = {}, deps = {}) {
  if (!id) throw new Error('popup_delete braucht eine id');
  return rueckholFetch('DELETE', `/api/campaigns?id=${encodeURIComponent(id)}`, deps);
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
