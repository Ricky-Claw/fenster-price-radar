#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FPR_PUSH_ENABLED="${FPR_PUSH_ENABLED:-0}"

if [ -n "$(git status --short)" ]; then
  echo "BLOCKER: repo dirty before weekly update. Refusing to overwrite local work."
  git status --short
  exit 2
fi

git fetch origin main
git pull --ff-only origin main

npm ci
npm run prices:update
npm run build

STAMP="$(date +%F)"
git add public/data/price-radar.json "public/data/history/price-radar-${STAMP}.json"

if git diff --cached --quiet; then
  echo "No price data changes to commit."
else
  git -c user.name='Ricky-Claw' -c user.email='ricky@lanistasoundcraft.de' commit -m "chore(data): update weekly price radar"
  if [ "$FPR_PUSH_ENABLED" = "1" ]; then
    git push origin main
  else
    echo "push skipped (FPR_PUSH_ENABLED=0 gate)"
  fi
fi

node - <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync('public/data/price-radar.json', 'utf8'));
const changes = payload.configs
  .flatMap(c => Object.entries(c.weeklyChange || {}).map(([provider, change]) => ({ provider, change })))
  .filter(x => (x.change.delta || 0) !== 0 || (x.change.listDelta || 0) !== 0);
const byProvider = changes.reduce((acc, x) => {
  acc[x.provider] = (acc[x.provider] || 0) + 1;
  return acc;
}, {});
const deltas = changes
  .map(x => x.change.delta)
  .filter(x => typeof x === 'number')
  .sort((a, b) => a - b);
console.log(JSON.stringify({
  ok: true,
  generatedAt: payload.generatedAt,
  baseline: payload.comparisonBaseline,
  sources: payload.sources,
  summary: payload.summary,
  changes: changes.length,
  byProvider,
  customerDeltaRange: deltas.length ? [deltas[0], deltas[deltas.length - 1]] : null,
}, null, 2));
NODE

node - <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync('public/data/price-radar.json', 'utf8'));
const generated = payload.generatedAt ? new Date(payload.generatedAt) : null;
if (generated && !Number.isNaN(generated.getTime())) {
  const ageDays = Math.floor((Date.now() - generated.getTime()) / 86400000);
  if (ageDays > 7) {
    console.log(`WARN: price data is ${ageDays} days old`);
  }
}
NODE
