const COOKIE = 'fenster_radar_session';
const PUBLIC_FILE = /\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|json|txt|map|woff2?)$/i;

function bytes(value) { return new TextEncoder().encode(value); }
function b64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, bytes(value)));
}
async function validSession(cookie, secret) {
  if (!cookie || !secret) return false;
  const parts = cookie.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  return parts[2] === await sign(payload, secret);
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/login' || path.startsWith('/api/login') || path.startsWith('/api/logout') || PUBLIC_FILE.test(path)) return;
  if (path.startsWith('/api/')) return;
  const secret = process.env.FENSTER_RADAR_AUTH_SECRET || process.env.FENSTER_RADAR_PASSWORD || '';
  const ok = await validSession(request.cookies.get(COOKIE)?.value, secret);
  if (ok) return;
  url.pathname = '/login';
  url.searchParams.set('next', path);
  return Response.redirect(url, 302);
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
