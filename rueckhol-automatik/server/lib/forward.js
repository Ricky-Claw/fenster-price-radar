const DEFAULT_TIMEOUT_MS = 8000;

function withTimeout(fetchImpl, url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchImpl(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function forwardNewsletter({ email, name }, config, fetchImpl) {
  if (!config || !config.baseUrl || !config.listId) return;
  const url = `${config.baseUrl.replace(/\/$/, '')}/api/nl/subscribe`;
  withTimeout(fetchImpl, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ listId: config.listId, email, name: name || '' }),
  }, DEFAULT_TIMEOUT_MS).catch((error) => {
    console.warn('[Conversion Rescue] Newsletter-Weiterleitung fehlgeschlagen:', error.message);
  });
}

function forwardContactLead({ name, email, message, siteId, submissionId, createdAt }, config, fetchImpl) {
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
  };
  withTimeout(fetchImpl, url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(body),
  }, DEFAULT_TIMEOUT_MS).catch((error) => {
    console.warn('[Conversion Rescue] Lead-Weiterleitung fehlgeschlagen:', error.message);
  });
}

module.exports = { forwardNewsletter, forwardContactLead };
