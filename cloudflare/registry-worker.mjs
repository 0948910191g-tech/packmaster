import '../packmaster-marketplace-registry.js';
const registryApi = globalThis.PackMasterMarketplaceRegistry;
const MAX_BODY_SIZE = 1800000; // Bytes, not UTF-16 characters.
const MAX_STORE_SIZE = 1900000; // D1 maximum TEXT/row size is 2,000,000 bytes.

function reply(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim());
  if (!allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type'
  };
}

function validToken(request, configured) {
  const supplied = new TextEncoder().encode(request.headers.get('Authorization') || '');
  const expected = new TextEncoder().encode('Bearer ' + configured);
  let mismatch = supplied.length ^ expected.length;
  for (let i = 0; i < Math.max(supplied.length, expected.length); i++) {
    mismatch |= (supplied[i] || 0) ^ (expected[i] || 0);
  }
  return mismatch === 0;
}

// Keep the deployed D1 schema: one versioned store row with platform-scoped catalogs.
const SELECT = 'SELECT registry_json, revision, updated_at FROM packmaster_marketplace_registry WHERE id = 1';
const INSERT = 'INSERT OR IGNORE INTO packmaster_marketplace_registry (id, registry_json, revision, updated_at, updated_by) VALUES (1, ?, 1, ?, ?)';
const UPDATE = 'UPDATE packmaster_marketplace_registry SET registry_json = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = 1 AND revision = ?';

export async function handleRequest(request, env) {
  const cors = corsHeaders(request, env);
  if (!cors) return reply({ error: 'origin_forbidden' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!env.REGISTRY_DB || typeof env.REGISTRY_DB.prepare !== 'function' ||
      typeof env.REGISTRY_SYNC_TOKEN !== 'string' || env.REGISTRY_SYNC_TOKEN.length < 32) {
    return reply({ error: 'not_configured' }, 503, cors);
  }
  if (!validToken(request, env.REGISTRY_SYNC_TOKEN)) return reply({ error: 'unauthorized' }, 401, cors);
  const match = /^\/api\/registry\/(TIKTOK|SHOPEE)$/.exec(new URL(request.url).pathname);
  if (!match) return reply({ error: 'not_found' }, 404, cors);
  if (request.method !== 'GET' && request.method !== 'PUT') return reply({ error: 'method_not_allowed' }, 405, cors);
  const platform = match[1];
  try {
    if (request.method === 'GET') {
      const row = await env.REGISTRY_DB.prepare(SELECT).first();
      const store = row ? registryApi.validateStore(JSON.parse(row.registry_json)) : null;
      const registry = store?.platforms?.[platform] || null;
      return reply({ platform, revision: row?.revision || 0, registry, updatedAt: row?.updated_at || null }, 200, cors);
    }
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
      return reply({ error: 'json_required' }, 415, cors);
    }
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_SIZE) {
      return reply({ error: 'payload_too_large' }, 413, cors);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_SIZE) {
      return reply({ error: 'payload_too_large' }, 413, cors);
    }
    let input;
    try { input = JSON.parse(raw); }
    catch { return reply({ error: 'invalid_json' }, 400, cors); }
    if (!input || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      return reply({ error: 'invalid_revision' }, 400, cors);
    }
    let registry;
    try { registry = registryApi.validatePlatformRegistry(input.registry, platform); }
    catch { return reply({ error: 'invalid_registry' }, 400, cors); }
    const current = await env.REGISTRY_DB.prepare(SELECT).first();
    if ((current?.revision || 0) !== input.expectedRevision) {
      return reply({ error: 'revision_conflict', revision: current?.revision || 0 }, 409, cors);
    }
    // Preserve the other marketplace during single-platform sync.
    const store = current
      ? registryApi.validateStore(JSON.parse(current.registry_json))
      : registryApi.createEmptyStore();
    const previous = store.platforms[platform];
    if (previous && Date.parse(previous.source.captureDate) > Date.parse(registry.source.captureDate)) {
      return reply({ error: 'stale_capture', revision: current.revision }, 409, cors);
    }
    const updated = registryApi.replacePlatformRegistry(store, registry);
    const payload = JSON.stringify(updated);
    if (new TextEncoder().encode(payload).byteLength > MAX_STORE_SIZE) {
      return reply({ error: 'combined_registry_too_large' }, 413, cors);
    }

    const now = new Date().toISOString();
    const statement = current
      ? env.REGISTRY_DB.prepare(UPDATE).bind(payload, now, 'registry-api', input.expectedRevision)
      : env.REGISTRY_DB.prepare(INSERT).bind(payload, now, 'registry-api');
    const written = await statement.run();
    if (written?.meta?.changes !== 1) {
      return reply({ error: 'revision_conflict' }, 409, cors);
    }
    return reply({ platform, revision: input.expectedRevision + 1, updatedAt: now }, 200, cors);
  } catch (error) {
    console.error('Marketplace registry request failed:', error?.name || 'error');
    return reply({ error: 'database_error' }, 500, cors);
  }
}
export default { fetch: handleRequest };
