import fs from 'node:fs';
import path from 'node:path';

export function resolvePriceLimit(env = process.env, catalogPath = path.resolve('data', 'comparison-catalog.json')) {
  if (env.PRICE_LIMIT) return env.PRICE_LIMIT;

  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const configs = Array.isArray(raw) ? raw : raw.configs || [];
  return String(configs.length);
}
