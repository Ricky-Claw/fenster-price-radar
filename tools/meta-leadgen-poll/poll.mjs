#!/usr/bin/env node
// Meta-Lead-Poller: Holt neue Instant-Form-Leads direkt über die Graph API und leitet sie weiter.
// Für VPS-Cron ohne Vercel; Secrets ausschließlich per Env bereitstellen, nie im Repo oder Log.
// Pflicht: META_ACCESS_TOKEN und DFS_META_LEAD_TOKEN. Optional: META_POLL_LOOKBACK_HOURS (Standard 6).
import {
  DFS_PAGE_ID,
  graph,
  pageAccessToken,
  pollOnce,
  processLeadgenChange,
} from '../../src/leads/metaLeadgen.js';

function hoursFromArgs() {
  const argument = process.argv.slice(2).find((value) => value.startsWith('--hours='));
  const configured = Number(argument?.slice('--hours='.length) ?? process.env.META_POLL_LOOKBACK_HOURS);
  const hours = Number.isFinite(configured) && configured > 0 ? configured : 6;
  return Math.min(720, Math.max(1, hours));
}

function missingEnv(name) {
  console.error(`Meta-Lead-Poller abgebrochen: ${name} fehlt.`);
  process.exitCode = 2;
}

async function main() {
  if (!process.env.META_ACCESS_TOKEN) return missingEnv('META_ACCESS_TOKEN');
  if (!process.env.DFS_META_LEAD_TOKEN) return missingEnv('DFS_META_LEAD_TOKEN');

  const result = await pollOnce({
    dry: process.argv.slice(2).includes('--dry'),
    lookbackHours: hoursFromArgs(),
    graphFn: graph,
    pageAccessTokenFn: pageAccessToken,
    processLeadgenChangeFn: processLeadgenChange,
  });
  console.log(JSON.stringify(result));
  if (result.error || (result.attempted > 0 && result.forwarded === 0)) process.exitCode = 1;
}

main().catch(() => {
  console.log(JSON.stringify({ ok: false, error: 'UNEXPECTED_FAILURE' }));
  process.exitCode = 1;
});
