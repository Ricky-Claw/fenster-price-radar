export const VERIFY_TOLERANCE_PCT = 1;
export const MIN_CONFIRMING_PROVIDERS = 2;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function entryTime(entry) {
  const time = Date.parse(entry?.verifiedAt);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function latestEntryForKey(entries, key) {
  return entries
    .filter(entry => entry?.key === key)
    .sort((a, b) => entryTime(b) - entryTime(a))[0] || null;
}

export function configVerification(entries, config) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const entry = latestEntryForKey(entries, config?.key);
  if (!entry) return null;

  const prices = entry.prices && typeof entry.prices === 'object' ? entry.prices : {};
  const providerNames = Object.keys(prices);

  if (entry.result === 'mismatch') {
    return { status: 'mismatch', verifiedAt: entry.verifiedAt, providers: providerNames };
  }

  if (entry.result !== 'verified') return null;

  const matchedProviders = providerNames.filter(provider => {
    const verifiedPrice = prices[provider];
    const currentTotal = config?.providers?.[provider]?.customerTotal;

    if (!isFiniteNumber(verifiedPrice) || !isFiniteNumber(currentTotal) || currentTotal === 0) {
      return false;
    }

    const deltaPct = Math.abs(verifiedPrice - currentTotal) / currentTotal * 100;
    return Number.isFinite(deltaPct) && deltaPct <= VERIFY_TOLERANCE_PCT;
  });

  if (matchedProviders.length < MIN_CONFIRMING_PROVIDERS) return null;

  return { status: 'verified', verifiedAt: entry.verifiedAt, providers: matchedProviders };
}
