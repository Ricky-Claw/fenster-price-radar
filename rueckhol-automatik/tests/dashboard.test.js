const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardDir = path.join(__dirname, '..', 'dashboard');
const html = fs.readFileSync(path.join(dashboardDir, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(dashboardDir, 'app.js'), 'utf8');

test('dashboard includes the Leads tab and submissions routes', () => {
  assert.match(html, /data-view="leads"[^>]*>Leads</);
  assert.match(html, /id="view-leads"/);
  assert.match(app, /\/api\/submissions\?site=/);
  assert.match(app, /format=csv/);
});

test('campaign editor persists download and privacy URLs', () => {
  assert.match(html, /id="a-news-download"/);
  assert.match(html, /id="a-privacy"/);
  assert.match(app, /downloadUrl:\s*v\('a-news-download'\)/);
  assert.match(app, /privacyUrl:\s*v\('a-privacy'\)/);
});

test('Leads renderer uses textContent and never innerHTML', () => {
  const start = app.indexOf('function renderLeads');
  const end = app.indexOf('// ---- views ----', start);
  assert.notEqual(start, -1, 'renderLeads function is present');
  assert.notEqual(end, -1, 'Leads renderer block has an end marker');
  const leadsBlock = app.slice(start, end);
  assert.match(leadsBlock, /textContent/);
  assert.doesNotMatch(leadsBlock, /innerHTML/);
});

test('Leads renderer resolves a fallback site and has a German empty state', () => {
  assert.match(app, /var site = state\.site \|\| \(visibleCampaigns\(\)\[0\] && visibleCampaigns\(\)\[0\]\.site_id\)/);
  assert.match(app, /\|\| \(state\.sites\[0\] && \(state\.sites\[0\]\.id \|\| state\.sites\[0\]\.site_id \|\| state\.sites\[0\]\)\)/);
  assert.match(app, /if \(!site\) \{/);
  assert.match(app, /Noch keine Leads/);
  assert.match(app, /Leads konnten nicht geladen werden/);
});

test('Leads renderer ignores stale success and error responses after site changes', () => {
  assert.match(app, /var gen = \+\+state\.leadsGen/);
  assert.equal((app.match(/if \(gen !== state\.leadsGen\) return;/g) || []).length, 2);
});

test('dashboard rejects lossy download and privacy URLs before saving', () => {
  assert.match(app, /a\.downloadUrl\.indexOf\('\\\\'\) !== -1 \|\| a\.downloadUrl\.length > 500/);
  assert.match(app, /a\.privacyUrl\.indexOf\('\\\\'\) !== -1 \|\| a\.privacyUrl\.length > 500/);
});
