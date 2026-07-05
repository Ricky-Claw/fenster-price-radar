const crypto = require('node:crypto');

// Mirrors fenster-price-radar's api/login.js scheme (same password, own cookie —
// cookies don't cross domains, so this is a separate login, not a shared session).
const COOKIE = 'rueckhol_session';
const DAY = 24 * 60 * 60;

function secret() {
  return process.env.FENSTER_RADAR_AUTH_SECRET || process.env.FENSTER_RADAR_PASSWORD || '';
}
function expectedPassword() {
  return process.env.FENSTER_RADAR_PASSWORD || '';
}
function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}
function isConfigured() {
  return Boolean(expectedPassword() && secret());
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function hasValidSession(req) {
  if (!isConfigured()) return false;
  const cookie = parseCookies(req.headers.cookie)[COOKIE] || '';
  const lastDot = cookie.lastIndexOf('.');
  if (lastDot === -1) return false;
  const payload = cookie.slice(0, lastDot);
  const sig = cookie.slice(lastDot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const expires = Number(payload.split('.')[1]);
  return Number.isFinite(expires) && Date.now() / 1000 < expires;
}

function checkPassword(candidate) {
  return isConfigured() && String(candidate || '') === expectedPassword();
}

function sessionCookie() {
  const expires = Math.floor(Date.now() / 1000) + DAY;
  const payload = `v1.${expires}`;
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; Max-Age=${DAY}; HttpOnly; SameSite=Lax; Secure`;
}

// Dev default (nothing configured): open, same as before auth existed.
// adminToken is passed in (not read from env) so it honors the same
// options.adminToken override createApp() already supports for tests.
function createGuards(adminToken) {
  function hasCredential(req) {
    if (!adminToken && !isConfigured()) return true;
    const auth = req.get('authorization') || '';
    if (adminToken && auth === `Bearer ${adminToken}`) return true;
    return isConfigured() && hasValidSession(req);
  }

  // Gates the campaign/analytics JSON APIs. Widget-facing routes
  // (config/events/submit/cre.js) stay open — they have their own origin+rate-limit gate.
  // no-store on every response (even the pass-through): this app can sit behind
  // a CDN/proxy (e.g. a Vercel rewrite), and a cached authenticated response
  // served back to a different, unauthenticated visitor would leak the dashboard.
  function requireDashboardAuth(req, res, next) {
    res.set('cache-control', 'no-store');
    if (hasCredential(req)) { next(); return; }
    res.status(401).json({ error: 'login_required' });
  }

  // Gates the dashboard HTML page itself — redirects to the sibling /login page
  // instead of a bare 401 JSON. Relative so it works whether this app sits at a
  // domain root or is proxied under a path prefix (e.g. Vercel rewrite to /rueckhol/*).
  function requireDashboardPage(req, res, next) {
    res.set('cache-control', 'no-store');
    if (hasCredential(req)) { next(); return; }
    res.redirect('../login');
  }

  return { requireDashboardAuth, requireDashboardPage };
}

module.exports = { COOKIE, isConfigured, checkPassword, sessionCookie, createGuards };
