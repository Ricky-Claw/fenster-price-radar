const { normalizeTheme } = require('./theme');

const SUPPORTED_TRIGGERS = new Set(['exit_intent', 'idle', 'time_on_page', 'scroll_depth', 'manual']);
const SUPPORTED_ACTIONS = new Set(['url', 'pdf', 'coupon', 'newsletter', 'contact']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value, max = 1000) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanId(value, fallback = randomId()) {
  const cleaned = cleanText(value || fallback, 140).replace(/[^a-z0-9._-]/gi, '-');
  return cleaned || fallback;
}

function cleanUrl(value, max = 1000) {
  const raw = cleanText(value, max);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString().slice(0, max);
  } catch (_) {
    return '';
  }
}

function cleanDownloadUrl(value, max = 500) {
  const raw = cleanText(value, max + 1);
  if (!raw || raw.length > max || raw.includes('\\')) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    url.hash = '';
    const cleaned = url.toString();
    return cleaned.length <= max ? cleaned : '';
  } catch (_) {
    return '';
  }
}

function cleanCsvList(value, maxItemLength = 140, maxItems = 8) {
  return String(value ?? '')
    .split(/\r?\n|,/)
    .map((item) => cleanText(item, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asBool(value) {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function decodeCssEscapes(value) {
  return String(value ?? '').replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (m, hex, literal) => {
    if (hex) {
      const code = parseInt(hex, 16);
      if (Number.isFinite(code) && code >= 0 && code <= 0x10FFFF) {
        try { return String.fromCodePoint(code); } catch (_) { return ''; }
      }
      return '';
    }
    return literal;
  });
}

function cleanCustomCss(value) {
  // custom_css is injected into a live <style> inside the widget shadow root on
  // every visitor's browser, so it is an untrusted-blast-radius surface even
  // though only trusted admins author it. Strip the CSS vectors that do harm
  // without script: @import (beacons visitor IP to a third party), external
  // url() (exfiltrates form values via attribute-selector background requests),
  // and expression()/behavior (legacy script execution). data: and same-origin
  // relative url() are kept so legitimate inline assets still work.
  let decoded = String(value ?? '');
  for (let i = 0; i < 8; i++) {
    const next = decodeCssEscapes(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded
    .replace(/\u0000/g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/@charset[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/(behavior|-moz-binding)\s*:/gi, '')
    .replace(/url\(\s*['"]?\s*(?:https?:)?\/\/[^)]*\)/gi, 'url()')
    .slice(0, 8000);
}

function cleanMetadata(value) {
  const metadata = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return metadata;

  for (const [key, entry] of Object.entries(value).slice(0, 20)) {
    const cleanKey = cleanText(key, 80);
    const cleanValue = cleanText(entry, 300);
    if (cleanKey && cleanValue) metadata[cleanKey] = cleanValue;
  }

  return metadata;
}

function cleanExtraFields(value) {
  if (!Array.isArray(value)) return [];
  const fields = [];
  const labels = new Set();
  const allowedTypes = new Set(['text', 'tel', 'email', 'number']);

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const label = cleanText(entry.label, 60);
    if (!label || labels.has(label)) continue;
    fields.push({
      label,
      type: allowedTypes.has(entry.type) ? entry.type : 'text',
    });
    labels.add(label);
    if (fields.length === 5) break;
  }

  return fields;
}

function cleanExtras(value) {
  if (!Array.isArray(value)) return [];
  const extras = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const label = cleanText(entry.label, 60);
    const extraValue = cleanText(entry.value, 200);
    if (!label || !extraValue) continue;
    extras.push({ label, value: extraValue });
    if (extras.length === 5) break;
  }

  return extras;
}

function cleanEmail(value) {
  const email = cleanText(value, 240).toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : '';
}

function cleanPageUrl(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  } catch (_) {
    return '';
  }
  const cutAt = [raw.indexOf('?'), raw.indexOf('#')]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), raw.length);
  return raw.slice(0, cutAt).slice(0, 300);
}

function sanitizeTrigger(triggerInput, configInput = {}) {
  const trigger = SUPPORTED_TRIGGERS.has(String(triggerInput || '').trim())
    ? String(triggerInput).trim()
    : 'exit_intent';
  const config = configInput && typeof configInput === 'object' && !Array.isArray(configInput)
    ? configInput
    : {};
  const triggerConfig = {
    seconds: undefined,
    percent: undefined,
    frequencyHours: clampNumber(config.frequencyHours, 0, 720, 24),
    ignoreSitePause: asBool(config.ignoreSitePause),
  };

  if (trigger === 'idle' || trigger === 'time_on_page') {
    triggerConfig.seconds = clampNumber(config.seconds, 1, 3600, 30);
  }
  if (trigger === 'scroll_depth') {
    triggerConfig.percent = clampNumber(config.percent, 1, 100, 50);
  }

  if (triggerConfig.seconds === undefined) delete triggerConfig.seconds;
  if (triggerConfig.percent === undefined) delete triggerConfig.percent;
  if (!triggerConfig.ignoreSitePause) delete triggerConfig.ignoreSitePause;
  return { trigger, triggerConfig };
}

function baseActionConfig(configInput = {}) {
  return {
    label: cleanText(configInput.label || '', 120),
    successMessage: cleanText(configInput.successMessage || '', 200),
    reasonPrompt: cleanText(configInput.reasonPrompt || 'Was hält Sie gerade noch ab?', 180),
    reasonOptions: cleanCsvList(
      Array.isArray(configInput.reasonOptions) ? configInput.reasonOptions.join(',') : configInput.reasonOptions || '',
      120,
      6,
    ),
  };
}

function sanitizeAction(actionTypeInput, configInput = {}) {
  const actionType = SUPPORTED_ACTIONS.has(String(actionTypeInput || '').trim())
    ? String(actionTypeInput).trim()
    : 'url';
  const config = configInput && typeof configInput === 'object' && !Array.isArray(configInput)
    ? configInput
    : {};
  const common = baseActionConfig(config);
  let actionConfig;

  if (actionType === 'url') {
    actionConfig = {
      ...common,
      url: cleanUrl(config.url, 600),
      newTab: asBool(config.newTab),
    };
  } else if (actionType === 'pdf') {
    actionConfig = {
      ...common,
      pdfUrl: cleanUrl(config.pdfUrl || config.url, 600),
      label: cleanText(config.label || 'PDF öffnen', 120),
      newTab: config.newTab === undefined ? true : asBool(config.newTab),
    };
  } else if (actionType === 'coupon') {
    actionConfig = {
      ...common,
      code: cleanText(config.code, 80),
      label: cleanText(config.label || 'Code anzeigen', 120),
    };
  } else if (actionType === 'newsletter') {
    actionConfig = {
      ...common,
      label: cleanText(config.label || 'Anmelden', 120),
      placeholder: cleanText(config.placeholder || 'name@example.com', 120),
      downloadUrl: cleanDownloadUrl(config.downloadUrl),
      privacyUrl: cleanDownloadUrl(config.privacyUrl),
      consentLabel: cleanText(
        config.consentLabel || 'Ich möchte Neuigkeiten zu diesem Angebot per E-Mail erhalten.',
        220,
      ),
      successMessage: cleanText(config.successMessage || 'Danke! Sie sind eingetragen.', 200),
    };
  } else {
    actionConfig = {
      ...common,
      allowUpload: asBool(config.allowUpload),
      extraFields: cleanExtraFields(config.extraFields),
      label: cleanText(config.label || 'Anfrage senden', 120),
      privacyUrl: cleanDownloadUrl(config.privacyUrl),
      consentLabel: cleanText(
        config.consentLabel || 'Ich bin einverstanden, dass meine Angaben zur Beantwortung dieser Anfrage verwendet werden.',
        220,
      ),
      successMessage: cleanText(config.successMessage || 'Danke! Wir melden uns bei Ihnen.', 200),
    };
  }

  return { actionType, actionConfig };
}

function sanitizeSubmission(kindInput, payloadInput = {}, pageInput = '') {
  const kind = ['lead', 'newsletter', 'contact'].includes(String(kindInput || '').trim())
    ? String(kindInput).trim()
    : '';
  if (!kind) throw new Error('Unsupported submission kind');
  const payload = payloadInput && typeof payloadInput === 'object' && !Array.isArray(payloadInput)
    ? payloadInput
    : {};
  const consent = asBool(payload.consent);
  const email = cleanEmail(payload.email);
  const uploadId = /^[A-Za-z0-9_-]{20,64}$/.test(String(payload.uploadId || ''))
    ? String(payload.uploadId)
    : undefined;
  const extras = cleanExtras(payload.extras);

  if (!consent) throw new Error('Explicit consent is required');
  if (!email) throw new Error('A valid email address is required');

  if (kind === 'newsletter') {
    return {
      kind,
      ...(pageInput ? { page: cleanPageUrl(pageInput) } : {}),
      payload: {
        email,
        consent: true,
      },
    };
  }

  if (kind === 'lead') {
    return {
      kind,
      ...(pageInput ? { page: cleanPageUrl(pageInput) } : {}),
      payload: {
        name: cleanText(payload.name, 120),
        email,
        message: cleanText(payload.message, 600),
        consent: true,
        ...(uploadId ? { uploadId } : {}),
        ...(extras.length ? { extras } : {}),
      },
    };
  }

  return {
    kind,
    ...(pageInput ? { page: cleanPageUrl(pageInput) } : {}),
    payload: {
      name: cleanText(payload.name, 120),
      email,
      message: cleanText(payload.message, 1200),
      consent: true,
      ...(uploadId ? { uploadId } : {}),
      ...(extras.length ? { extras } : {}),
    },
  };
}

const CAMPAIGN_FIELD_ALIASES = [
  ['actionConfig', 'action_config'],
  ['actionType', 'action_type'],
  ['triggerConfig', 'trigger_config'],
  ['pagePattern', 'page_pattern'],
  ['pageExclude', 'page_exclude'],
  ['ctaLabel', 'cta_label'],
  ['customCss', 'custom_css'],
  ['siteId', 'site_id'],
  ['siteName', 'site_name'],
];

function sanitizeCampaignInput(input = {}, existing = {}) {
  // Normalize camelCase aliases onto the snake_case keys BEFORE merging with
  // `existing` — otherwise an update sent as camelCase (the documented API
  // shape) loses against the stored snake_case value and the edit is silently
  // dropped (merged.action_config from the DB beat input.actionConfig).
  const inputNorm = { ...input };
  for (const [camel, snake] of CAMPAIGN_FIELD_ALIASES) {
    if (inputNorm[snake] === undefined && inputNorm[camel] !== undefined) inputNorm[snake] = inputNorm[camel];
  }
  const merged = { ...existing, ...inputNorm };
  const { trigger, triggerConfig } = sanitizeTrigger(merged.trigger, merged.trigger_config || merged.triggerConfig);
  const { actionType, actionConfig } = sanitizeAction(merged.action_type || merged.actionType, merged.action_config || merged.actionConfig);
  const id = cleanId(merged.id || existing.id || cleanText(merged.name || 'conversion-rescue', 80).toLowerCase().replace(/\s+/g, '-') || randomId());
  const pagePattern = cleanText(merged.page_pattern || merged.pagePattern || '', 320);
  const pageExclude = cleanText(merged.page_exclude || merged.pageExclude || '', 320);

  return {
    id,
    site_id: existing.site_id
      ? cleanId(existing.site_id, 'default')
      : cleanId(merged.site_id || merged.siteId || 'default', 'default'),
    site_name: cleanText(merged.site_name || merged.siteName || merged.site_id || merged.siteId || 'Default site', 120) || 'Default site',
    name: cleanText(merged.name || 'Conversion Rescue campaign', 160),
    enabled: asBool(merged.enabled),
    trigger,
    trigger_config: triggerConfig,
    action_type: actionType,
    action_config: actionConfig,
    page_pattern: pagePattern || '*',
    page_exclude: pageExclude,
    headline: cleanText(merged.headline || 'Einen Moment noch', 180),
    body: cleanText(merged.body || 'Gern beraten wir Sie zu Ihrem Vorhaben.', 700),
    cta_label: cleanText(merged.cta_label || merged.ctaLabel || actionConfig.label || 'Weiter', 120),
    theme: normalizeTheme(merged.theme),
    custom_css: cleanCustomCss(merged.custom_css || merged.customCss || ''),
    created_at: cleanText(existing.created_at || merged.created_at || merged.createdAt || nowIso(), 80),
  };
}

function sanitizeEventInput(input = {}) {
  const allowedTypes = new Set(['popup_shown', 'cta_click', 'close', 'coupon_reveal', 'url_open', 'pdf_open', 'contact_submit', 'newsletter_opt_in', 'lead_submit']);
  const type = cleanText(input.type || '', 80);
  return {
    // Analytics quotas are keyed by site_id; make casing variations one site.
    site_id: cleanId(input.site_id || input.siteId || 'default', 'default').toLowerCase(),
    campaign_id: cleanId(input.campaign_id || input.campaignId || '', ''),
    type: allowedTypes.has(type) ? type : null,
    metadata: cleanMetadata(input.metadata),
    created_at: nowIso(),
  };
}

module.exports = {
  asBool,
  cleanCsvList,
  cleanCustomCss,
  cleanDownloadUrl,
  cleanEmail,
  cleanExtraFields,
  cleanExtras,
  cleanId,
  cleanMetadata,
  cleanPageUrl,
  cleanText,
  cleanUrl,
  nowIso,
  sanitizeAction,
  sanitizeCampaignInput,
  sanitizeEventInput,
  sanitizeSubmission,
  sanitizeTrigger,
};
