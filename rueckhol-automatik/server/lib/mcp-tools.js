const { sanitizeCampaignInput, cleanText, nowIso } = require('./sanitize');
const { summarizeAnalytics } = require('./analytics');
const { loeseMarkenprofil } = require('./markenprofile');
const { getThemePresets } = require('./theme');

const POSITIONS = new Set(['center', 'corner', 'bar']);

function publicCampaign(c) { return c; }
function localList(db, { siteId } = {}) {
  const clean = typeof siteId === 'string' ? siteId.trim() : siteId;
  if (clean === '') throw new Error('popup_list siteId darf nicht leer sein');
  if (clean === '*') throw new Error('popup_list unterstützt keinen siteId-Platzhalter "*"');
  return { campaigns: db.listCampaigns(clean || '', false).map(publicCampaign), sites: db.listSites(), themePresets: getThemePresets() };
}
function popupList(db, args) { return localList(db, args); }
function popupAnalytics(db, { siteId } = {}) {
  const clean = typeof siteId === 'string' ? siteId.trim() : siteId;
  if (clean === '') throw new Error('popup_analytics siteId darf nicht leer sein');
  if (clean === '*') throw new Error('popup_analytics unterstützt keinen siteId-Platzhalter "*"');
  const campaigns = db.listCampaigns(clean || '', false);
  const events = db.listEvents(clean || '');
  const submissions = db.listSubmissions(clean || '');
  return summarizeAnalytics({ campaigns, events, submissions });
}
function popupCreate(db, campaign) {
  const sanitized = sanitizeCampaignInput(campaign);
  if (!cleanText(campaign?.id, 140)) {
    let id = sanitized.id; let n = 2; let clash = db.getCampaign(id);
    while (clash && clash.site_id !== sanitized.site_id) { id = `${sanitized.id}-${n++}`; clash = db.getCampaign(id); }
    sanitized.id = id;
  }
  return { campaign: db.saveCampaign(sanitized) };
}
function popupUpdate(db, campaign) {
  if (!campaign?.id) throw new Error('popup_update braucht eine campaign.id');
  const existing = db.getCampaign(campaign.id);
  if (!existing) throw new Error('Campaign not found');
  return { campaign: db.saveCampaign(sanitizeCampaignInput(campaign, existing)) };
}
async function popupDesign(db, { variante = 'blau', id, siteId, position = 'center', radius = 14, mitLogo = true, vorschau, marke = 'dfs', profil } = {}) {
  const profile = loeseMarkenprofil(marke, profil);
  const cleanId = typeof id === 'string' ? id.trim() : id;
  const cleanSiteId = typeof siteId === 'string' ? siteId.trim() : siteId;
  if (!Object.hasOwn(profile.varianten, variante)) throw new Error(`Unbekannte popup_design-Variante "${variante}". Erlaubt sind: ${Object.keys(profile.varianten).join(', ')}`);
  if (!POSITIONS.has(position)) throw new Error('Unbekannte popup_design-Position. Erlaubt sind: center, corner, bar');
  if (!Number.isInteger(radius) || radius < 0 || radius > 32) throw new Error('popup_design radius muss eine Ganzzahl zwischen 0 und 32 sein');
  if (cleanSiteId === '') throw new Error('popup_design siteId darf nicht leer sein');
  if (cleanSiteId === '*') throw new Error('popup_design unterstützt keinen siteId-Platzhalter "*"');
  const preset = profile.varianten[variante];
  const theme = { name: preset.name, position, colors: { ...preset.colors }, font_family: profile.schrift, radius, logo_url: mitLogo === false ? '' : profile.logo, logo_max_height: 44 };
  if (vorschau === true || (!cleanId && !cleanSiteId)) return { marke, variante, theme, angewendetAuf: [], vorschau: true };
  const listed = localList(db, { siteId: cleanSiteId }); const campaigns = listed.campaigns;
  const campaignSite = c => c?.site_id ?? c?.siteId;
  if (cleanSiteId && campaigns.some(c => campaignSite(c) !== cleanSiteId)) throw new Error(`popup_design: Auflistung enthält eine Kampagne außerhalb von siteId "${cleanSiteId}"`);
  let targets = cleanSiteId ? campaigns.filter(c => campaignSite(c) === cleanSiteId) : campaigns;
  if (cleanId) {
    const c = db.getCampaign(cleanId);
    if (!c) throw new Error(`popup_design: Kampagne mit id "${cleanId}" nicht gefunden`);
    if (cleanSiteId && campaignSite(c) !== cleanSiteId) throw new Error(`popup_design: Kampagne "${cleanId}" gehört nicht zu siteId "${cleanSiteId}"`);
    targets = [c];
  }
  if (!targets.length) throw new Error(cleanSiteId ? `popup_design: keine Kampagne für siteId ${cleanSiteId} gefunden` : 'popup_design: keine Kampagne gefunden');
  const updates = [];
  for (let i = 0; i < targets.length; i += 3) {
    const settled = await Promise.allSettled(targets.slice(i, i + 3).map(c => ({ ...c, theme, site_name: listed.sites.find(s => s.id === campaignSite(c))?.name })).map(c => { try { return Promise.resolve(popupUpdate(db, { id: c.id, theme: c.theme, site_id: c.site_id, site_name: c.site_name })); } catch (e) { return Promise.reject(e); } }));
    updates.push(...settled.map((r, j) => r.status === 'fulfilled' ? { campaign: targets[i+j], response: r.value } : { campaign: targets[i+j], error: r.reason }));
  }
  const good = updates.filter(x => !x.error); const bad = updates.filter(x => x.error);
  return { marke, variante, theme: good.map(x => x.response?.campaign?.theme).find(Boolean) || theme, angewendetAuf: good.map(x => x.campaign.id), ...(bad.length ? { fehlgeschlagen: bad.map(x => ({ id: x.campaign.id, grund: x.error.message })), unvollstaendig: true } : {}), vorschau: false };
}
function popupDelete(db, { id } = {}) { if (!id) throw new Error('popup_delete braucht eine id'); if (!db.deleteCampaign(id)) throw new Error('Campaign not found'); return { ok: true }; }
module.exports = { popupList, popupAnalytics, popupCreate, popupUpdate, popupDesign, popupDelete };
