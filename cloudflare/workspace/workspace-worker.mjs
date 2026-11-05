import { createD1ObjectStore, MAX_OBJECT_BYTES } from './d1-object-store.mjs';
import { MAX_PART_BYTES, PART_FORMAT, PART_HASH, partKey, partHash,
  validatePartOrders, checkManifestParts } from './batch-parts.mjs';
import { handleRequest as handleRegistryRequest } from '../registry-worker.mjs';
import { createSession, verifySession, cookieHeader, clearCookieHeader,
  readSessionCookie, checkLoginSecret, checkCsrf, isSameOrigin } from './workspace-session.mjs';

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 900000;
const BATCH_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const DOCUMENT_KEYS = new Set([
  'skuMappingRules', 'archiveState', 'duplicateFingerprints',
  'sourceFiles', 'reprintSnapshots', 'settings'
]);
const SELECT_BATCH = 'SELECT id, revision, meta_json, orders_key, updated_at, deleted_at FROM workspace_batches WHERE id = ?';
const SELECT_DOCUMENT = 'SELECT doc_key, revision, payload, updated_at FROM workspace_documents WHERE doc_key = ?';

function reply(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...headers
    }
  });
}
function cors(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allow = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  if (!allow.includes(origin) && origin !== new URL(request.url).origin) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-PM-CSRF',
    'Vary': 'Origin'
  };
}
function tokenMatches(actual, token) {
  const got = new TextEncoder().encode(actual || '');
  const want = new TextEncoder().encode('Bearer ' + token);
  let mismatch = got.length ^ want.length;
  for (let i = 0; i < Math.max(got.length, want.length); i++) {
    mismatch |= (got[i] || 0) ^ (want[i] || 0);
  }
  return mismatch === 0;
}
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return { error: 'json_content_type_required', status: 415 };
  }
  const headerSize = Number(request.headers.get('Content-Length') || 0);
  if (headerSize > MAX_BODY_BYTES) return { error: 'body_too_large', status: 413 };
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return { error: 'body_too_large', status: 413 };
  }
  try { return { value: JSON.parse(body) }; }
  catch { return { error: 'invalid_json', status: 400 }; }
}
function expectedRevision(body) {
  return isRecord(body) && Number.isSafeInteger(body.expectedRevision) &&
    body.expectedRevision >= 0 ? body.expectedRevision : null;
}

function validateBatch(body, batchId) {
  if (!isRecord(body) || !isRecord(body.meta) || body.meta.id !== batchId ||
      !Array.isArray(body.orders) || body.orders.length > 5000) return false;
  const ids = new Set();
  for (const order of body.orders) {
    if (!isRecord(order) || typeof order.id !== 'string' || !order.id.trim() ||
        !Array.isArray(order.parsedItems) || ids.has(order.id)) return false;
    for (const item of order.parsedItems) {
      if (!isRecord(item) || typeof item.text !== 'string' || !item.text.trim() ||
          !Number.isSafeInteger(item.qty) || item.qty < 1) return false;
    }
    ids.add(order.id);
  }
  return body.meta.id === batchId;
}
function batchInfo(row) {
  return {
    meta: JSON.parse(row.meta_json),
    revision: row.revision,
    updatedAt: row.updated_at
  };
}
async function recordAudit(db, type, key, operation, revision, actor, now) {
  try {
    await db.prepare(
      'INSERT INTO workspace_audit (entity_type, entity_key, operation, actor, revision, changed_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(type, key, operation, actor, revision, now).run();
  } catch (error) {
    console.error('Audit insert failed:', error?.name || 'unknown');
  }
}
async function handleBatch(request, env, match, headers) {
  const id = match[1];
  if (!BATCH_ID.test(id)) return reply({ error: 'invalid_batch_id' }, 400, headers);
  const current = await env.WORKSPACE_DB.prepare(SELECT_BATCH).bind(id).first();
  if (request.method === 'GET') {
    if (!current || current.deleted_at) return reply({ error: 'batch_not_found' }, 404, headers);
    const object = await env.WORKSPACE_OBJECTS.get(current.orders_key);
    if (!object) return reply({ error: 'orders_object_missing' }, 503, headers);
    const orders = JSON.parse(await object.text());
    if (Array.isArray(orders)) return reply({ ...batchInfo(current), orders }, 200, headers);
    if (isRecord(orders) && orders.format === PART_FORMAT &&
        orders.batchId === id && checkManifestParts(orders.partHashes, orders.orderCount)) {
      return reply({
        ...batchInfo(current), ordersParts: orders.partHashes,
        totalOrders: orders.orderCount, ordersFormat: PART_FORMAT
      }, 200, headers);
    }
    throw new Error('orders_object_invalid');
  }
  if (!['PUT','DELETE'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405, headers);
  const parsed = await readJson(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status, headers);
  const body = parsed.value;
  const revision = expectedRevision(body);
  if (revision === null) return reply({ error: 'expected_revision_required' }, 400, headers);
  if ((current?.revision || 0) !== revision || current?.deleted_at) {
    return reply({ error: 'revision_conflict', currentRevision: current?.revision || 0 }, 409, headers);
  }
  const now = new Date().toISOString();
  const actor = 'internal-worker-token';
  if (request.method === 'DELETE') {
    if (!current) return reply({ error: 'batch_not_found' }, 404, headers);
    const update = await env.WORKSPACE_DB.prepare(
      'UPDATE workspace_batches SET revision = revision + 1, deleted_at = ?, updated_at = ? WHERE id = ? AND revision = ? AND deleted_at IS NULL'
    ).bind(now, now, id, revision).run();
    if (update?.meta?.changes !== 1) return reply({ error: 'revision_conflict' }, 409, headers);
    await recordAudit(env.WORKSPACE_DB, 'batch', id, 'archive_delete', revision + 1, actor, now);
    return reply({ id, revision: revision + 1, deleted: true }, 200, headers);
  }
  const usesParts = isRecord(body) && Object.prototype.hasOwnProperty.call(body, 'partHashes');
  if (usesParts) {
    if (!isRecord(body.meta) || body.meta.id !== id ||
        body.orders !== undefined || !checkManifestParts(body.partHashes, body.orderCount)) {
      return reply({ error: 'invalid_batch_parts' }, 400, headers);
    }
  } else if (!validateBatch(body, id)) {
    return reply({ error: 'invalid_batch_or_orders' }, 400, headers);
  }
  const metaJson = JSON.stringify({ ...body.meta, updatedAt: now });
  if (new TextEncoder().encode(metaJson).byteLength > 100000) {
    return reply({ error: 'batch_metadata_too_large' }, 413, headers);
  }
  if (usesParts) {
    const keys = body.partHashes.map(hash => partKey(id, hash));
    const placeholders = keys.map(() => '?').join(',');
    const result = await env.WORKSPACE_DB.prepare(
      'SELECT part_hash, order_ids_json, order_count FROM workspace_order_parts WHERE batch_id = ? AND object_key IN (' +
      placeholders + ')'
    ).bind(id, ...keys).all();
    const rows = result?.results || [];
    if (rows.length !== keys.length) return reply({ error: 'batch_parts_incomplete' }, 409, headers);
    if (env.D1_FREE_STORAGE) {
      const objectRows = await env.WORKSPACE_DB.prepare(
        'SELECT object_key FROM workspace_objects WHERE object_key IN (' + placeholders + ')'
      ).bind(...keys).all();
      if ((objectRows?.results || []).length !== keys.length) {
        return reply({ error: 'batch_parts_incomplete' }, 409, headers);
      }
    } else {
      for (const key of keys) {
        let partOk = false;
        try {
          const obj = await env.WORKSPACE_OBJECTS.get(key);
          if (obj) partOk = true;
        } catch (e) {
          partOk = false;
        }
        if (!partOk) return reply({ error: 'batch_parts_incomplete' }, 409, headers);
      }
    }
    const orderIds = new Set();
    let count = 0;
    for (const row of rows) {
      const ids = JSON.parse(row.order_ids_json);
      if (!Array.isArray(ids) || ids.length !== row.order_count) {
        throw new Error('Invalid order part index');
      }
      count += row.order_count;
      for (const orderId of ids) {
        if (orderIds.has(orderId)) return reply({ error: 'duplicate_batch_order_ids' }, 400, headers);
        orderIds.add(orderId);
      }
    }
    if (count !== body.orderCount) return reply({ error: 'batch_parts_count_mismatch' }, 409, headers);
  }
  const ordersJson = usesParts
    ? JSON.stringify({ format: PART_FORMAT, batchId: id,
        partHashes: body.partHashes, orderCount: body.orderCount })
    : JSON.stringify(body.orders);
  if (new TextEncoder().encode(ordersJson).byteLength > MAX_BODY_BYTES) {
    return reply({ error: 'batch_orders_too_large' }, 413, headers);
  }
  if (env.D1_FREE_STORAGE && new TextEncoder().encode(ordersJson).byteLength > MAX_OBJECT_BYTES) {
    return reply({ error: 'free_tier_batch_limit_4mb' }, 413, headers);
  }
  const objectKey = 'orders/' + id + '/' + crypto.randomUUID() + '.json';
  await env.WORKSPACE_OBJECTS.put(objectKey, ordersJson, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { batchId: id, savedAt: now }
  });
  let committed = false;
  try {
    const statement = current
      ? env.WORKSPACE_DB.prepare(
          'UPDATE workspace_batches SET revision = revision + 1, meta_json = ?, orders_key = ?, updated_at = ? WHERE id = ? AND revision = ? AND deleted_at IS NULL'
        ).bind(metaJson, objectKey, now, id, revision)
      : env.WORKSPACE_DB.prepare(
          'INSERT OR IGNORE INTO workspace_batches (id, revision, meta_json, orders_key, updated_at, deleted_at) VALUES (?, 1, ?, ?, ?, NULL)'
        ).bind(id, metaJson, objectKey, now);
    const result = await statement.run();
    if (result?.meta?.changes !== 1) return reply({ error: 'revision_conflict' }, 409, headers);
    committed = true;
  } finally {
    if (!committed) {
      // If the database write succeeded but its acknowledgement was lost, deleting
      // this object would destroy the newly committed batch. Prefer an orphan.
      let safeToDelete = false;
      try {
        const persisted = await env.WORKSPACE_DB.prepare(SELECT_BATCH).bind(id).first();
        safeToDelete = persisted?.orders_key !== objectKey;
      } catch (error) {
        console.error('Cannot verify R2 orphan safety:', error?.name || 'unknown');
      }
      if (safeToDelete) {
        try { await env.WORKSPACE_OBJECTS.delete(objectKey); }
        catch (error) { console.error('Orphan R2 cleanup failed:', error?.name || 'unknown'); }
      }
    }
  }
  await recordAudit(env.WORKSPACE_DB, 'batch', id, current ? 'update' : 'create', revision + 1, actor, now);
  return reply({ id, revision: revision + 1, meta: JSON.parse(metaJson), updatedAt: now }, 200, headers);
}

async function handleBatchPart(request, env, match, headers) {
  const [, id, hash] = match;
  if (!BATCH_ID.test(id) || !PART_HASH.test(hash)) {
    return reply({ error: 'invalid_batch_part' }, 400, headers);
  }
  const objectKey = partKey(id, hash);
  if (request.method === 'GET') {
    const object = await env.WORKSPACE_OBJECTS.get(objectKey);
    if (!object) return reply({ error: 'batch_part_missing' }, 404, headers);
    const json = await object.text();
    if (await partHash(json) !== hash) throw new Error('Batch part checksum mismatch');
    const orders = JSON.parse(json);
    if (!validatePartOrders(orders)) throw new Error('Stored Batch part invalid');
    return reply({ hash, orders }, 200, headers);
  }
  if (request.method !== 'PUT') return reply({ error: 'method_not_allowed' }, 405, headers);
  const parsed = await readJson(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status, headers);
  const value = parsed.value;
  const revision = expectedRevision(value);
  if (revision === null) return reply({ error: 'expected_revision_required' }, 400, headers);
  const current = await env.WORKSPACE_DB.prepare(SELECT_BATCH).bind(id).first();
  if ((current?.revision || 0) !== revision || current?.deleted_at) {
    return reply({ error: 'revision_conflict', currentRevision: current?.revision || 0 }, 409, headers);
  }
  const ids = validatePartOrders(value?.orders);
  if (!ids) return reply({ error: 'invalid_batch_part_orders' }, 400, headers);
  const json = JSON.stringify(value.orders);
  if (new TextEncoder().encode(json).byteLength > MAX_PART_BYTES) {
    return reply({ error: 'batch_part_too_large' }, 413, headers);
  }
  if (await partHash(json) !== hash) return reply({ error: 'batch_part_checksum_mismatch' }, 400, headers);

  const existing = await env.WORKSPACE_DB.prepare(
    'SELECT p.part_hash, o.sha256 FROM workspace_order_parts p ' +
    'JOIN workspace_objects o ON o.object_key = p.object_key WHERE p.object_key = ? AND p.batch_id = ?'
  ).bind(objectKey, id).first();
  if (existing) {
    if (existing.part_hash !== hash || existing.sha256 !== hash) {
      throw new Error('Stored Batch part identity mismatch');
    }
    let objectValid = false;
    try {
      const obj = await env.WORKSPACE_OBJECTS.get(objectKey);
      if (obj) {
        const text = await obj.text();
        if (await partHash(text) === hash) {
          objectValid = true;
        }
      }
    } catch (e) {
      objectValid = false;
    }
    if (objectValid) {
      return reply({ hash, count: ids.length, reused: true }, 200, headers);
    }
    try { await env.WORKSPACE_OBJECTS.delete(objectKey); } catch (e) {}
    await env.WORKSPACE_DB.prepare('DELETE FROM workspace_order_parts WHERE object_key = ?').bind(objectKey).run();
  }
  let needPut = true;
  try {
    const obj = await env.WORKSPACE_OBJECTS.get(objectKey);
    if (obj) {
      const text = await obj.text();
      if (await partHash(text) === hash) {
        needPut = false;
      }
    }
  } catch (e) {
    needPut = true;
    try {
      await env.WORKSPACE_DB.prepare('DELETE FROM workspace_object_chunks WHERE object_key = ?').bind(objectKey).run();
      await env.WORKSPACE_DB.prepare('DELETE FROM workspace_objects WHERE object_key = ?').bind(objectKey).run();
    } catch (cleanErr) {}
  }
  if (needPut) {
    await env.WORKSPACE_OBJECTS.put(objectKey, json);
  }
  const now = new Date().toISOString();
  const written = await env.WORKSPACE_DB.prepare(
    'INSERT OR IGNORE INTO workspace_order_parts ' +
    '(object_key,batch_id,part_hash,order_ids_json,order_count,created_at) ' +
    'VALUES (?,?,?,?,?,?)'
  ).bind(objectKey, id, hash, JSON.stringify(ids), ids.length, now).run();
  if (written?.meta?.changes !== 1) {
    const after = await env.WORKSPACE_DB.prepare(
      'SELECT part_hash FROM workspace_order_parts WHERE object_key = ? AND batch_id = ?'
    ).bind(objectKey, id).first();
    if (after?.part_hash !== hash) throw new Error('Batch part index conflict');
  }
  return reply({ hash, count: ids.length, reused: false }, 200, headers);
}

async function handleDocument(request, env, key, headers) {
  if (!DOCUMENT_KEYS.has(key)) return reply({ error: 'unknown_document' }, 404, headers);
  const existing = await env.WORKSPACE_DB.prepare(SELECT_DOCUMENT).bind(key).first();
  if (request.method === 'GET') {
    return reply({
      key, revision: existing?.revision || 0,
      value: existing ? JSON.parse(existing.payload) : null,
      updatedAt: existing?.updated_at || null
    }, 200, headers);
  }
  if (request.method !== 'PUT') return reply({ error: 'method_not_allowed' }, 405, headers);
  const parsed = await readJson(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status, headers);
  const { value } = parsed;
  const revision = expectedRevision(value);
  if (revision === null) return reply({ error: 'expected_revision_required' }, 400, headers);
  if (!isRecord(value) || (key === 'skuMappingRules' ? !Array.isArray(value.value) : !isRecord(value.value))) {
    return reply({ error: 'invalid_document' }, 400, headers);
  }
  if (key === 'skuMappingRules' && value.value.some(rule =>
    !isRecord(rule) || typeof rule.keyword !== 'string' || !rule.keyword.trim() ||
    typeof rule.shortName !== 'string' || !rule.shortName.trim())) {
    return reply({ error: 'invalid_sku_mapping_rules' }, 400, headers);
  }
  const payload = JSON.stringify(value.value);
  if (new TextEncoder().encode(payload).byteLength > MAX_DOCUMENT_BYTES) {
    return reply({ error: 'document_too_large' }, 413, headers);
  }
  if ((existing?.revision || 0) !== revision) {
    return reply({ error: 'revision_conflict', currentRevision: existing?.revision || 0 }, 409, headers);
  }
  const now = new Date().toISOString();
  const statement = existing
    ? env.WORKSPACE_DB.prepare(
        'UPDATE workspace_documents SET revision = revision + 1, payload = ?, updated_at = ? WHERE doc_key = ? AND revision = ?'
      ).bind(payload, now, key, revision)
    : env.WORKSPACE_DB.prepare(
        'INSERT OR IGNORE INTO workspace_documents (doc_key, revision, payload, updated_at) VALUES (?, 1, ?, ?)'
      ).bind(key, payload, now);
  const result = await statement.run();
  if (result?.meta?.changes !== 1) return reply({ error: 'revision_conflict' }, 409, headers);
  await recordAudit(env.WORKSPACE_DB, 'document', key, 'save', revision + 1, 'internal-worker-token', now);
  return reply({ key, revision: revision + 1, updatedAt: now }, 200, headers);
}

async function handleRegistryAssignments(request, env, headers) {
  const db = env.WORKSPACE_DB;
  const key = 'registrySkuAssignments';
  const existing = await db.prepare(
    'SELECT revision, payload, updated_at FROM workspace_registry_assignments WHERE id = ?'
  ).bind(key).first();
  if (request.method === 'GET') {
    return reply({
      revision: existing?.revision || 0,
      value: existing ? JSON.parse(existing.payload) : null,
      updatedAt: existing?.updated_at || null
    }, 200, headers);
  }
  if (request.method !== 'PUT') return reply({ error: 'method_not_allowed' }, 405, headers);
  const parsed = await readJson(request);
  if (parsed.error) return reply({ error: parsed.error }, parsed.status, headers);
  const input = parsed.value;
  const revision = expectedRevision(input);
  if (revision === null) return reply({ error: 'expected_revision_required' }, 400, headers);
  const value = input?.value;
  if (!isRecord(value) || value.schema !== 'packmaster-registry-sku-assignments' ||
      value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 10000) {
    return reply({ error: 'invalid_registry_assignments' }, 400, headers);
  }
  const keys = new Set();
  for (const entry of value.entries) {
    if (!isRecord(entry) || !['TIKTOK', 'SHOPEE'].includes(entry.platform) ||
        typeof entry.sellerSku !== 'string' || !entry.sellerSku.trim() ||
        typeof entry.productId !== 'string' || !entry.productId.trim() ||
        typeof entry.shortName !== 'string' || !entry.shortName.trim() ||
        entry.shortName.length > 150 ||
        !(entry.modelId == null || typeof entry.modelId === 'string')) {
      return reply({ error: 'invalid_registry_assignment_entry' }, 400, headers);
    }
    const sku = entry.sellerSku.normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
    const assignmentKey = JSON.stringify([entry.platform, sku]);
    if (!sku || keys.has(assignmentKey)) {
      return reply({ error: 'duplicate_registry_assignment' }, 400, headers);
    }
    keys.add(assignmentKey);
  }
  const payload = JSON.stringify(value);
  if (new TextEncoder().encode(payload).byteLength > MAX_DOCUMENT_BYTES) {
    return reply({ error: 'document_too_large' }, 413, headers);
  }
  if ((existing?.revision || 0) !== revision) {
    return reply({ error: 'revision_conflict', currentRevision: existing?.revision || 0 }, 409, headers);
  }
  const now = new Date().toISOString();
  const statement = existing
    ? db.prepare(
        'UPDATE workspace_registry_assignments SET revision = revision + 1, payload = ?, updated_at = ? WHERE id = ? AND revision = ?'
      ).bind(payload, now, key, revision)
    : db.prepare(
        'INSERT OR IGNORE INTO workspace_registry_assignments (id, revision, payload, updated_at) VALUES (?, 1, ?, ?)'
      ).bind(key, payload, now);
  const result = await statement.run();
  if (result?.meta?.changes !== 1) {
    return reply({ error: 'revision_conflict' }, 409, headers);
  }
  await recordAudit(db, 'registry_assignment', key, 'save', revision + 1, 'internal-worker-token', now);
  return reply({ revision: revision + 1, updatedAt: now }, 200, headers);
}

async function handleSession(request, env, headers) {
  const secret = env.WORKSPACE_ACCESS_TOKEN;
  if (request.method === 'POST') {
    if (!isSameOrigin(request)) return reply({ error: 'origin_forbidden' }, 403, headers);
    const parsed = await readJson(request);
    if (parsed.error) return reply({ error: parsed.error }, parsed.status, headers);
    const password = parsed.value?.passphrase;
    if (typeof password !== 'string' || password.length > 1024 ||
        !checkLoginSecret(password, secret)) {
      return reply({ error: 'invalid_credentials' }, 401, headers);
    }
    const session = await createSession(secret);
    return reply({ authenticated: true, csrf: session.csrf }, 200, {
      ...headers, 'Set-Cookie': cookieHeader(session.cookie)
    });
  }

  const session = await verifySession(secret, readSessionCookie(request));
  if (!session) return reply({ error: 'unauthorized' }, 401, headers);
  if (request.method === 'GET') {
    return reply({ authenticated: true, csrf: session.csrf, expiresAt: session.expiresAt }, 200, headers);
  }
  if (request.method === 'DELETE') {
    if (!checkCsrf(request, session)) return reply({ error: 'csrf_forbidden' }, 403, headers);
    return reply({ authenticated: false }, 200, {
      ...headers, 'Set-Cookie': clearCookieHeader()
    });
  }
  return reply({ error: 'method_not_allowed' }, 405, headers);
}

export async function handleWorkspaceRequest(request, env) {
  const headers = cors(request, env);
  if (!headers) return reply({ error: 'origin_forbidden' }, 403);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Cache-Control': 'no-store', ...headers
    } });
  }
  if (!env.WORKSPACE_DB || typeof env.WORKSPACE_DB.prepare !== 'function' ||
      typeof env.WORKSPACE_ACCESS_TOKEN !== 'string' ||
      env.WORKSPACE_ACCESS_TOKEN.length < 32) {
    return reply({ error: 'workspace_not_configured' }, 503, headers);
  }
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith('/api/workspace/')) return reply({ error: 'not_found' }, 404, headers);

  try {
    if (pathname === '/api/workspace/session') {
      return await handleSession(request, env, headers);
    }
    const bearerAuthenticated = tokenMatches(request.headers.get('Authorization'), env.WORKSPACE_ACCESS_TOKEN);
    const browserSession = bearerAuthenticated
      ? null
      : await verifySession(env.WORKSPACE_ACCESS_TOKEN, readSessionCookie(request));
    if (!bearerAuthenticated && !browserSession) {
      return reply({ error: 'unauthorized' }, 401, headers);
    }
    if (browserSession && request.method !== 'GET' && !checkCsrf(request, browserSession)) {
      return reply({ error: 'csrf_forbidden' }, 403, headers);
    }
    const workspaceEnv = {
      ...env,
      WORKSPACE_OBJECTS: env.WORKSPACE_OBJECTS || createD1ObjectStore(env.WORKSPACE_DB),
      D1_FREE_STORAGE: !env.WORKSPACE_OBJECTS
    };
    if (pathname === '/api/workspace/registry-assignments') {
      return await handleRegistryAssignments(request, env, headers);
    }
    const registryRoute = /^\/api\/workspace\/registry\/(TIKTOK|SHOPEE)$/.exec(pathname);
    if (registryRoute) {
      if (!env.REGISTRY_DB) return reply({ error: 'registry_database_unavailable' }, 503, headers);
      const forwarded = new Request(new URL('/api/registry/' + registryRoute[1], request.url), {
        method: request.method,
        headers: {
          Authorization: 'Bearer ' + env.WORKSPACE_ACCESS_TOKEN,
          ...(request.method === 'PUT' ? { 'Content-Type': 'application/json' } : {})
        },
        ...(request.method === 'PUT' ? { body: await request.text() } : {})
      });
      return await handleRegistryRequest(forwarded, {
        REGISTRY_DB: env.REGISTRY_DB,
        REGISTRY_SYNC_TOKEN: env.WORKSPACE_ACCESS_TOKEN
      });
    }
    if (pathname === '/api/workspace/health' && request.method === 'GET') {
      return reply({ service: 'packmaster-cloud-workspace', status: 'ok' }, 200, headers);
    }
    if (pathname === '/api/workspace/batches' && request.method === 'GET') {
      const results = await env.WORKSPACE_DB.prepare(
        'SELECT id, revision, meta_json, updated_at FROM workspace_batches WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 5000'
      ).all();
      const batches = (results?.results || []).map(row => ({
        ...batchInfo(row), id: row.id
      }));
      return reply({ batches }, 200, headers);
    }
    const batchPart = /^\/api\/workspace\/batches\/([^/]+)\/parts\/([a-f0-9]{64})$/.exec(pathname);
    if (batchPart) return await handleBatchPart(request, workspaceEnv, batchPart, headers);
    const batch = /^\/api\/workspace\/batches\/([^/]+)$/.exec(pathname);
    if (batch) return await handleBatch(request, workspaceEnv, batch, headers);
    const document = /^\/api\/workspace\/documents\/([^/]+)$/.exec(pathname);
    if (document) return await handleDocument(request, workspaceEnv, document[1], headers);
    return reply({ error: 'not_found' }, 404, headers);
  } catch (error) {
    console.error('Workspace API failed:', error?.name || 'unknown');
    return reply({ error: 'workspace_backend_failure' }, 500, headers);
  }
}

export default { fetch: handleWorkspaceRequest };
