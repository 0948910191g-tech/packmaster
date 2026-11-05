// HttpOnly same-origin session for the self-hosted PackMaster Cloud UI.
// Shared access code is suitable only for controlled internal pilot use.
export const SESSION_COOKIE = '__Host-pm_workspace';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const CSRF_HEADER = 'X-PM-CSRF';

const bytes = value => new TextEncoder().encode(value);
const toHex = array => Array.from(new Uint8Array(array), n => n.toString(16).padStart(2, '0')).join('');
const constantTimeEquals = (a, b) => {
  const left = bytes(String(a || ''));
  const right = bytes(String(b || ''));
  let mismatch = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    mismatch |= (left[i] || 0) ^ (right[i] || 0);
  }
  return mismatch === 0;
};
async function signed(key, message) {
  const cryptoKey = await crypto.subtle.importKey('raw', bytes(key), {
    name: 'HMAC', hash: 'SHA-256'
  }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', cryptoKey, bytes(message)));
}
const encode = text => btoa(String.fromCharCode(...bytes(text)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
function decode(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - value.length % 4) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, x => x.charCodeAt(0)));
}
export function cookieHeader(session) {
  return SESSION_COOKIE + '=' + session +
    '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000);
}
export function clearCookieHeader() {
  return SESSION_COOKIE + '=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0';
}
export function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  return origin !== null && origin === new URL(request.url).origin;
}
export function checkLoginSecret(supplied, secret) {
  return typeof supplied === 'string' && typeof secret === 'string' &&
    secret.length >= 32 && constantTimeEquals(supplied, secret);
}
export async function createSession(secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Session secret not configured');
  const payload = encode(JSON.stringify({
    v: 1, iat: now, exp: now + SESSION_TTL_MS, nonce: crypto.randomUUID()
  }));
  const signature = await signed(secret, 'session:' + payload);
  const cookie = payload + '.' + signature;
  return { cookie, csrf: await signed(secret, 'csrf:' + cookie) };
}
export function readSessionCookie(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const pair of raw.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    if (pair.slice(0, index).trim() === SESSION_COOKIE) {
      const value = pair.slice(index + 1).trim();
      return value.length <= 1000 ? value : '';
    }
  }
  return '';
}
export async function verifySession(secret, cookie, now = Date.now()) {
  if (!secret || typeof cookie !== 'string' || cookie.length > 1000 ||
      !/^[A-Za-z0-9_-]{20,850}\.[a-f0-9]{64}$/.test(cookie)) return null;
  const [payload, givenSignature] = cookie.split('.');
  const signature = await signed(secret, 'session:' + payload);
  if (!constantTimeEquals(givenSignature, signature)) return null;
  let decoded;
  try { decoded = JSON.parse(decode(payload)); }
  catch { return null; }
  if (!decoded || decoded.v !== 1 ||
      !Number.isSafeInteger(decoded.iat) || !Number.isSafeInteger(decoded.exp) ||
      decoded.iat > now + 60000 || decoded.iat > decoded.exp ||
      decoded.exp > decoded.iat + SESSION_TTL_MS || decoded.exp <= now ||
      typeof decoded.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(decoded.nonce)) {
    return null;
  }
  return { csrf: await signed(secret, 'csrf:' + cookie), expiresAt: decoded.exp };
}
export function checkCsrf(request, session) {
  return Boolean(session) && isSameOrigin(request) &&
    constantTimeEquals(request.headers.get(CSRF_HEADER), session.csrf);
}
