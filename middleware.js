const COOKIE = 'fenster_radar_session';
const PUBLIC_FILE = /\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|json|txt|map|woff2?)$/i;

function cookieValue(header = '', name) {
  return String(header).split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function bytes(value) { return new TextEncoder().encode(value); }
function b64url(buffer) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  const data = new Uint8Array(buffer);
  for (let i = 0; i < data.length; i += 3) {
    const n = (data[i] << 16) | ((data[i + 1] || 0) << 8) | (data[i + 2] || 0);
    out += chars[(n >>> 18) & 63] + chars[(n >>> 12) & 63] + (i + 1 < data.length ? chars[(n >>> 6) & 63] : '') + (i + 2 < data.length ? chars[n & 63] : '');
  }
  return out;
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
  const session = cookieValue(request.headers.get('cookie') || '', COOKIE);
  if (await validSession(session, secret)) return;
  url.pathname = '/login';
  url.searchParams.set('next', path);
  return Response.redirect(url, 302);
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
