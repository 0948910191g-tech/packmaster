import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  clearCloudflareAccessKeyCache,
  verifyCloudflareAccessIdentity
} from '../functions/lib/cloudflare-access.mjs';

const encoder = new TextEncoder();
const b64url = (value) => Buffer.from(value).toString('base64url');
const teamDomain = 'https://packmaster.cloudflareaccess.com';
const audience = 'packmaster-audience-tag';
const env = {
  ACCESS_TEAM_DOMAIN: teamDomain,
  ACCESS_AUD: audience,
  REGISTRY_ALLOWED_EMAILS: 'owner@example.com, staff@example.com'
};

const createSigner = async () => {
  const pair = await webcrypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256'
  }, true, ['sign', 'verify']);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  publicJwk.kid = 'test-kid';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const fetchImpl = async () => ({
    ok: true,
    async json() { return { keys: [publicJwk] }; }
  });
  return { privateKey: pair.privateKey, publicJwk, fetchImpl };
};

const tokenFor = async (privateKey, payload, header = { alg: 'RS256', kid: 'test-kid', typ: 'JWT' }) => {
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const message = head + '.' + body;
  const signature = await webcrypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    encoder.encode(message)
  );
  return message + '.' + Buffer.from(signature).toString('base64url');
};

const requestWithToken = (token) => new Request('https://packmaster.pages.dev/api/registry', {
  headers: { 'Cf-Access-Jwt-Assertion': token }
});

const validPayload = () => ({
  iss: teamDomain,
  aud: [audience],
  sub: 'identity-1',
  email: 'owner@example.com',
  exp: Math.floor(Date.now() / 1000) + 600
});

test('Cloudflare Access identity is accepted only after JWT signature and claims validate', async () => {
  clearCloudflareAccessKeyCache();
  const signer = await createSigner();
  const token = await tokenFor(signer.privateKey, validPayload());
  const identity = await verifyCloudflareAccessIdentity(requestWithToken(token), env, {
    fetchImpl: signer.fetchImpl,
    cryptoImpl: webcrypto
  });
  assert.deepEqual(identity, { email: 'owner@example.com', sub: 'identity-1' });
});

test('invalid signature, audience, expiry, and email allowlist are rejected', async () => {
  clearCloudflareAccessKeyCache();
  const signer = await createSigner();
  const goodToken = await tokenFor(signer.privateKey, validPayload());
  const signatureChanged = goodToken.slice(0, goodToken.lastIndexOf('.') + 1) +
    (goodToken.slice(-1) === 'A' ? 'B' : 'A');
  await assert.rejects(
    () => verifyCloudflareAccessIdentity(requestWithToken(signatureChanged), env, {
      fetchImpl: signer.fetchImpl,
      cryptoImpl: webcrypto
    }),
    (error) => /signature/i.test(error.message)
  );

  clearCloudflareAccessKeyCache();
  const wrongAudience = await tokenFor(signer.privateKey, { ...validPayload(), aud: ['other-app'] });
  await assert.rejects(
    () => verifyCloudflareAccessIdentity(requestWithToken(wrongAudience), env, {
      fetchImpl: signer.fetchImpl,
      cryptoImpl: webcrypto
    }),
    /issuer or audience is invalid/
  );

  clearCloudflareAccessKeyCache();
  const expired = await tokenFor(signer.privateKey, { ...validPayload(), exp: 1 });
  await assert.rejects(
    () => verifyCloudflareAccessIdentity(requestWithToken(expired), env, {
      fetchImpl: signer.fetchImpl,
      cryptoImpl: webcrypto,
      now: 2000
    }),
    /expired or is not yet valid/
  );

  clearCloudflareAccessKeyCache();
  const unapproved = await tokenFor(signer.privateKey, { ...validPayload(), email: 'outsider@example.com' });
  await assert.rejects(
    () => verifyCloudflareAccessIdentity(requestWithToken(unapproved), env, {
      fetchImpl: signer.fetchImpl,
      cryptoImpl: webcrypto
    }),
    (error) => error.status === 403 && error.code === 'NOT_AUTHORIZED'
  );
});

test('missing Access JWT or configuration fails closed', async () => {
  clearCloudflareAccessKeyCache();
  await assert.rejects(
    () => verifyCloudflareAccessIdentity(new Request('https://packmaster.pages.dev/api/registry'), env),
    (error) => error.status === 401 && error.code === 'ACCESS_REQUIRED'
  );
  await assert.rejects(
    () => verifyCloudflareAccessIdentity(
      requestWithToken('a.b.c'),
      { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: '', REGISTRY_ALLOWED_EMAILS: '' }
    ),
    (error) => error.status === 503 && error.code === 'ACCESS_CONFIG'
  );
});