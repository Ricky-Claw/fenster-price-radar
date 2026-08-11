const DEFAULT_TIMEOUT_MS = 8000;

function withTimeout(fetchImpl, url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function logIfNotOk(label, responsePromise) {
  return responsePromise
    .then(async (response) => {
      if (response && response.ok === false) {
        let bodyText = '';
        try { bodyText = await response.text(); } catch (_) { /* egal, best effort */ }
        console.warn(`[Conversion Rescue] ${label} fehlgeschlagen: HTTP ${response.status} ${bodyText.slice(0, 300)}`);
      }
    })
    .catch((error) => {
      console.warn(`[Conversion Rescue] ${label} fehlgeschlagen:`, error.message);
    });
}

function forwardNewsletter({ email, name }, config, fetchImpl) {
  if (!config || !config.baseUrl || !config.listId) return;
  const url = `${config.baseUrl.replace(/\/$/, '')}/api/nl/subscribe`;
  logIfNotOk('Newsletter-Weiterleitung', withTimeout(fetchImpl, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ listId: config.listId, email, name: name || '' }),
  }, DEFAULT_TIMEOUT_MS));
}

function forwardContactLead({ name, email, message, siteId, submissionId, createdAt, attachments }, config, fetchImpl) {
  if (!config || !config.baseUrl || !config.token) return;
  const url = `${config.baseUrl.replace(/\/$/, '')}/api/leads/intake`;
  const body = {
    schema: 'archipel.lead/v1',
    id: `${config.island}_${siteId}_${submissionId}`,
    createdAt,
    status: 'neu',
    source: {
      island: config.island,
      domain: config.domain || siteId,
      category: config.category || 'sonstiges',
    },
    consent: { given: true, ts: createdAt, textVersion: 'v1' },
    contact: { name: name || undefined, email },
    message: message || undefined,
    attachments: attachments && attachments.length ? attachments : undefined,
  };
  logIfNotOk('Lead-Weiterleitung', withTimeout(fetchImpl, url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(body),
  }, DEFAULT_TIMEOUT_MS));
}

module.exports = { forwardNewsletter, forwardContactLead };
