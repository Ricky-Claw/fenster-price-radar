// ponytail: best-effort in-memory limiter — state is per warm serverless instance, resets on cold start, and the global cap is per-instance (effective cap ≈ cap × instance count). Upgrade path when abuse warrants: back it with Vercel KV / Upstash Redis (swap the Map/array for a shared store; keep the same check() shape). Keep the module dependency-free.
const SWEEP_KEY_THRESHOLD = 5000;

function pruneTimestamps(timestamps, cutoff) {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < timestamps.length; readIndex += 1) {
    if (timestamps[readIndex] > cutoff) {
      timestamps[writeIndex] = timestamps[readIndex];
      writeIndex += 1;
    }
  }
  timestamps.length = writeIndex;
}

function retryAfterSeconds(oldestTimestamp, windowMs, t) {
  return Math.max(1, Math.ceil((oldestTimestamp + windowMs - t) / 1000));
}

export function createRateLimiter({ windowMs, maxPerKey, maxGlobal, now = () => Date.now() }) {
  const perKeyHits = new Map();
  const globalHits = [];

  function sweepExpiredKeys(cutoff) {
    if (perKeyHits.size <= SWEEP_KEY_THRESHOLD) return;
    for (const [key, hits] of perKeyHits) {
      if (hits.length === 0 || hits[hits.length - 1] <= cutoff) perKeyHits.delete(key);
    }
  }

  return {
    check(key) {
      const keyString = String(key ?? 'unknown');
      const t = now();
      const cutoff = t - windowMs;

      pruneTimestamps(globalHits, cutoff);

      const keyHits = perKeyHits.get(keyString) || [];
      pruneTimestamps(keyHits, cutoff);
      if (keyHits.length === 0) perKeyHits.delete(keyString);

      sweepExpiredKeys(cutoff);

      if (globalHits.length >= maxGlobal) {
        return {
          allowed: false,
          scope: 'global',
          retryAfterSeconds: retryAfterSeconds(globalHits[0], windowMs, t),
        };
      }

      if (keyHits.length >= maxPerKey) {
        return {
          allowed: false,
          scope: 'key',
          retryAfterSeconds: retryAfterSeconds(keyHits[0], windowMs, t),
        };
      }

      keyHits.push(t);
      globalHits.push(t);
      perKeyHits.set(keyString, keyHits);
      return { allowed: true };
    },
  };
}
