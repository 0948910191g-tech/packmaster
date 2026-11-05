import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, verifySession, readSessionCookie, checkCsrf,
  cookieHeader, clearCookieHeader, checkLoginSecret, SESSION_TTL_MS, CSRF_HEADER
} from '../cloudflare/workspace/workspace-session.mjs';

const secret = 'test-session-passphrase-strong-32-plus-characters';
const origin = 'https://packmaster-workspace-api.example';

test('HttpOnly same-origin cookie never contains the admin passphrase', async () => {
  const now = Date.parse('2026-11-04T00:00:00Z');
  const session = await createSession(secret, now);
  const header = cookieHeader(session.cookie);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Path=\//);
  assert.equal(header.includes(secret), false);
  assert.match(clearCookieHeader(), /Max-Age=0/);
  const parsed = readSessionCookie(new Request(origin, {
    headers: { Cookie: 'other=x; ' + header.split(';')[0] + '; also=y' }
  }));
  assert.equal(parsed, session.cookie);
  assert.equal((await verifySession(secret, parsed, now + 5000)).csrf, session.csrf);
  assert.equal(await verifySession(secret, parsed, now + SESSION_TTL_MS + 1), null);
  assert.equal(await verifySession(secret + 'X', parsed, now + 1), null);
  const tampered = parsed.slice(0, -1) + (parsed.at(-1) === 'a' ? 'b' : 'a');
  assert.equal(await verifySession(secret, tampered, now + 1), null);
});

test('CSRF bound to the signed session and exact same-origin browser request', async () => {
  const now = Date.now();
  const created = await createSession(secret, now);
  const session = await verifySession(secret, created.cookie, now + 100);
  assert.equal(checkCsrf(new Request(origin + '/api/workspace/batches/b1', {
    method: 'PUT', headers: { Origin: origin, [CSRF_HEADER]: session.csrf }
  }), session), true);
  assert.equal(checkCsrf(new Request(origin + '/api/workspace/batches/b1', {
    method: 'PUT', headers: { Origin: 'https://attacker.invalid', [CSRF_HEADER]: session.csrf }
  }), session), false);
  assert.equal(checkCsrf(new Request(origin + '/api/workspace/batches/b1', {
    method: 'PUT', headers: { Origin: origin, [CSRF_HEADER]: 'wrong' }
  }), session), false);
});

test('Login rejects weak or incorrect passphrases', () => {
  assert.equal(checkLoginSecret(secret, secret), true);
  assert.equal(checkLoginSecret(secret.slice(0, -1) + '!', secret), false);
  assert.equal(checkLoginSecret('short', 'short'), false);
  assert.equal(checkLoginSecret('', secret), false);
});
