import { jsonResponse } from './shared.mjs';

export function onRequestGet({ data }) {
  const identity = data && data.packMasterIdentity;
  if (!identity || !identity.email) {
    return jsonResponse({ error: 'Cloudflare Access identity is missing', code: 'ACCESS_REQUIRED' }, 401);
  }
  return jsonResponse({ email: identity.email, sub: identity.sub || '' });
}