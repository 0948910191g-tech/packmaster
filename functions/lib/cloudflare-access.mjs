const keyCache = new Map();

export class CloudflareAccessError extends Error {
  constructor(message, status = 401, code = 'ACCESS_DENIED') {
    super(message);
    this.name = 'CloudflareAccessError';
    this.status = status;
    this.code = code;
  }
}

const base64UrlToBytes = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const decodeJsonSegment = (value) => {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes));
};

const normalizedDomain = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new CloudflareAccessError('Cloudflare Access configuration is incomplete', 503, 'ACCESS_CONFIG');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new CloudflareAccessError('Cloudflare Access domain must use HTTPS', 503, 'ACCESS_CONFIG');
  }
  return url.origin;
};

const loadJwks = async (domain, fetchImpl, now) => {
  const cached = keyCache.get(domain);
  if (cached && cached.expiresAt > now) return cached.keys;
  const response = await fetchImpl(new URL('/cdn-cgi/access/certs', domain).toString(), {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    throw new CloudflareAccessError('Cloudflare Access signing keys are unavailable', 503, 'ACCESS_KEYS');
  }
  const body = await response.json();
  const keys = Array.isArray(body && body.keys) ? body.keys : [];
  if (!keys.length) throw new CloudflareAccessError('Cloudflare Access signing keys are invalid', 503, 'ACCESS_KEYS');
  keyCache.set(domain, { keys, expiresAt: now + 5 * 60 * 1000 });
  return keys;
};

export async function verifyCloudflareAccessIdentity(request, env, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const cryptoImpl = options.cryptoImpl || globalThis.crypto;
  const nowSeconds = Math.floor((options.now == null ? Date.now() : options.now) / 1000);
  const domain = normalizedDomain(env && env.ACCESS_TEAM_DOMAIN || '');
  const audience = String(env && env.ACCESS_AUD || '').trim();
  const allowedEmails = String(env && env.REGISTRY_ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!audience || !allowedEmails.length) {
    throw new CloudflareAccessError('Cloudflare Access audience and allowed email list must be configured', 503, 'ACCESS_CONFIG');
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new CloudflareAccessError('Sign in with Cloudflare Access to use the shared registry', 401, 'ACCESS_REQUIRED');

  const segments = token.split('.');
  if (segments.length !== 3) throw new CloudflareAccessError('Cloudflare Access token is malformed', 401, 'ACCESS_TOKEN');
  let header;
  let payload;
  try {
    header = decodeJsonSegment(segments[0]);
    payload = decodeJsonSegment(segments[1]);
  } catch (error) {
    throw new CloudflareAccessError('Cloudflare Access token is malformed', 401, 'ACCESS_TOKEN');
  }
  if (header.alg !== 'RS256' || !header.kid) {
    throw new CloudflareAccessError('Cloudflare Access token uses an unsupported signature', 401, 'ACCESS_TOKEN');
  }

  let keySet = await loadJwks(domain, fetchImpl, Date.now());
  let signingKey = keySet.find((candidate) => candidate.kid === header.kid);
  if (!signingKey) {
    keyCache.delete(domain);
    keySet = await loadJwks(domain, fetchImpl, Date.now());
    signingKey = keySet.find((candidate) => candidate.kid === header.kid);
  }
  if (!signingKey) throw new CloudflareAccessError('Cloudflare Access signing key was not found', 401, 'ACCESS_TOKEN');
  let signatureIsValid = false;
  try {
    const importedKey = await cryptoImpl.subtle.importKey(
      'jwk',
      signingKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    signatureIsValid = await cryptoImpl.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      importedKey,
      base64UrlToBytes(segments[2]),
      new TextEncoder().encode(segments[0] + '.' + segments[1])
    );
  } catch (error) {
    throw new CloudflareAccessError('Cloudflare Access token signature could not be verified', 401, 'ACCESS_TOKEN');
  }
  if (!signatureIsValid) throw new CloudflareAccessError('Cloudflare Access token signature is invalid', 401, 'ACCESS_TOKEN');

  const expectedIssuer = domain.replace(/\/+$/, '');
  const actualIssuer = String(payload.iss || '').replace(/\/+$/, '');
  const tokenAudience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (actualIssuer !== expectedIssuer || !tokenAudience.includes(audience)) {
    throw new CloudflareAccessError('Cloudflare Access token issuer or audience is invalid', 401, 'ACCESS_TOKEN');
  }
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= nowSeconds ||
      (payload.nbf != null && Number(payload.nbf) > nowSeconds + 60)) {
    throw new CloudflareAccessError('Cloudflare Access token has expired or is not yet valid', 401, 'ACCESS_TOKEN');
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    throw new CloudflareAccessError('This email is not allowed to access the shared registry', 403, 'NOT_AUTHORIZED');
  }
  return { email, sub: String(payload.sub || '') };
}

export function clearCloudflareAccessKeyCache() {
  keyCache.clear();
}