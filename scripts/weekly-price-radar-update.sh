#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

cleanup() {
  rm -f /tmp/fpr-gh-token /tmp/fpr-git-askpass.sh
}
trap cleanup EXIT

make_askpass() {
  python3 - <<'PY' > /tmp/fpr-gh-token
from pathlib import Path
import re
paths = [
    Path('/data/.openclaw/workspace/KEYS.md'),
    Path('/data/.openclaw/workspace/Closr/.env.local'),
    Path('/data/.config/openclaw/secrets/github-paperclip-token'),
]
for p in paths:
    if not p.exists():
        continue
    s = p.read_text(errors='ignore').strip()
    for pat in [r'github_pat_[A-Za-z0-9_]+', r'ghp_[A-Za-z0-9_]+', r'GH_TOKEN\s*=\s*([^\s]+)', r'GITHUB_TOKEN\s*=\s*([^\s]+)']:
        m = re.search(pat, s)
        if m:
            print(m.group(1) if m.lastindex else m.group(0))
            raise SystemExit
raise SystemExit('no GitHub token found')
PY
  chmod 600 /tmp/fpr-gh-token
  cat > /tmp/fpr-git-askpass.sh <<'SH'
#!/usr/bin/env sh
case "$1" in
  *Username*) echo x-access-token ;;
  *Password*) cat /tmp/fpr-gh-token ;;
  *) echo ;;
esac
SH
  chmod 700 /tmp/fpr-git-askpass.sh
  export GIT_ASKPASS=/tmp/fpr-git-askpass.sh
}

if [ -n "$(git status --short)" ]; then
  echo "BLOCKER: repo dirty before weekly update. Refusing to overwrite local work."
  git status --short
  exit 2
fi

make_askpass

git fetch origin main
git pull --ff-only origin main

npm run prices:update
npm run build

STAMP="$(date +%F)"
git add public/data/price-radar.json "public/data/history/price-radar-${STAMP}.json"

if git diff --cached --quiet; then
  echo "No price data changes to commit."
else
  git commit -m "chore(data): update weekly price radar"
  git push origin main
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
