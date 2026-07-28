import crypto from 'node:crypto';

function secret() {
  return process.env.FENSTER_RADAR_AUTH_SECRET || process.env.FENSTER_RADAR_PASSWORD || '';
}

export function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function safeEqualSecret(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left), 'utf8').digest();
  const rightDigest = crypto.createHash('sha256').update(String(right), 'utf8').digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

export function validSession(cookie) {
  if (!cookie || !secret()) return false;
  const parts = cookie.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(parts[2], sign(payload));
}

export function cookieValue(header = '', name) {
  return String(header).split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
