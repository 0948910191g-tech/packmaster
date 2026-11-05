import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleWorkspaceRequest } from '../cloudflare/workspace/workspace-worker.mjs';

const accessToken = 'cloud-workspace-test-token-abcdefghijklmnopqrstuvwxyz';
const origin = 'https://packmaster-ppg.example';
const base = 'https://packmaster-ppg.example/api/workspace';

function environment() {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../cloudflare/workspace/schema.sql', import.meta.url), 'utf8'));
  database.exec(readFileSync(new URL('../cloudflare/workspace/d1-objects.sql', import.meta.url), 'utf8'));
  database.exec(readFileSync(new URL('../cloudflare/workspace/batch-parts.sql', import.meta.url), 'utf8'));
  database.exec(readFileSync(new URL('../cloudflare/workspace/registry-assignments.sql', import.meta.url), 'utf8'));
  const objects = new Map();
  const db = {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...params) {
          return {
            async first() { return statement.get(...params) || null; },
            async all() { return { results: statement.all(...params) }; },
            async run() { const result = statement.run(...params); return { meta: { changes: Number(result.changes) } }; }
          };
        },
        async all() { return { results: statement.all() }; },
        async first() { return statement.get() || null; }
      };
    }
  };
  const r2 = {
    async put(key, value) { objects.set(key, String(value)); },
    async get(key) {
      return objects.has(key) ? { async text() { return objects.get(key); } } : null;
    },
    async delete(key) { objects.delete(key); }
  };
  return {
    WORKSPACE_DB: db,
    WORKSPACE_OBJECTS: r2,
    WORKSPACE_ACCESS_TOKEN: accessToken,
    ALLOWED_ORIGINS: origin,
    database,
    objects
  };
}
async function request(env, path, method = 'GET', body = null, overrides = {}) {
  const headers = { Origin: origin, Authorization: 'Bearer ' + accessToken, ...overrides };
  if (body !== null) headers['Content-Type'] = 'application/json';
  const req = new Request(base + path, {
    method, headers, ...(body !== null ? { body: JSON.stringify(body) } : {})
  });
  const response = await handleWorkspaceRequest(req, env);
  return { response, payload: await response.json() };
}
function batch(id = 'batch-01') {
  return {
    meta: { id, name: 'Sample Batch', totalOrders: 1, status: 'WAITING' },
    orders: [{
      id: 'order-01', platform: 'TIKTOK', orderId: 'fake-order',
      parsedItems: [{ text: 'Test Product', qty: 2 }],
      pdfImage: 'data:image/jpeg;base64,' + Buffer.from('test-image').toString('base64')
    }]
  };
}

test('D1 binding and authentication are mandatory while R2 is optional', async () => {
  const env = environment();
  assert.equal((await request(env, '/health')).response.status, 200);
  assert.equal((await request(env, '/health', 'GET', null, { Authorization: 'Bearer invalid' })).response.status, 401);
  assert.equal((await request(env, '/health', 'GET', null, { Origin: 'https://untrusted.invalid' })).response.status, 403);
  assert.equal((await request({ ...env, WORKSPACE_OBJECTS: null }, '/health')).response.status, 200);
  assert.equal((await request({ ...env, WORKSPACE_DB: null }, '/health')).response.status, 503);
  assert.equal((await request({ ...env, WORKSPACE_ACCESS_TOKEN: '' }, '/health')).response.status, 503);
  assert.equal((await request(env, '/batches')).payload.batches.length, 0);
});

test('Batch and order images persist in R2 with independent revisions', async () => {
  const env = environment();
  const created = await request(env, '/batches/batch-01', 'PUT', { ...batch(), expectedRevision: 0 });
  assert.equal(created.response.status, 200);
  assert.equal(created.payload.revision, 1);
  const current = await request(env, '/batches/batch-01');
  assert.equal(current.response.status, 200);
  assert.equal(current.payload.revision, 1);
  assert.deepEqual(current.payload.orders, batch().orders);
  assert.equal(env.objects.size, 1);
  assert.equal((await request(env, '/batches')).payload.batches.length, 1);
  assert.equal(
    (await request(env, '/batches/batch-01', 'PUT', { ...batch(), expectedRevision: 0 })).response.status, 409
  );
  const updated = await request(env, '/batches/batch-01', 'PUT', {
    ...batch(), expectedRevision: 1,
    orders: [{ ...batch().orders[0], manualSkuOverrides: [{ sourceText: 'Test', shortName: 'SKU-001' }] }]
  });
  assert.equal(updated.payload.revision, 2);
  assert.equal((await request(env, '/batches/batch-01')).payload.orders[0].manualSkuOverrides[0].shortName, 'SKU-001');
  assert.equal(env.objects.size, 2);
  const second = await request(env, '/batches/batch-02', 'PUT', { ...batch('batch-02'), expectedRevision: 0 });
  assert.equal(second.response.status, 200);
  assert.equal((await request(env, '/batches')).payload.batches.length, 2);
  assert.equal((await request(env, '/batches/batch-02')).payload.revision, 1);
});

test('Stale writes and deletes cannot overwrite a newer batch', async () => {
  const env = environment();
  await request(env, '/batches/batch-01', 'PUT', { ...batch(), expectedRevision: 0 });
  assert.equal((await request(env, '/batches/batch-01', 'DELETE', { expectedRevision: 0 })).response.status, 409);
  const deleted = await request(env, '/batches/batch-01', 'DELETE', { expectedRevision: 1 });
  assert.equal(deleted.payload.deleted, true);
  assert.equal((await request(env, '/batches')).payload.batches.length, 0);
  assert.equal((await request(env, '/batches/batch-01')).response.status, 404);
  assert.equal((await request(env, '/batches/batch-01', 'PUT', { ...batch(), expectedRevision: 2 })).response.status, 409);
  assert.equal(env.objects.size, 1, 'Soft deletion retains R2 object for recovery');
});

test('Shared SKU Mapping is versioned and rejects stale changes', async () => {
  const env = environment();
  const rules = [{ id: 'rule-1', keyword: 'SKU-1', shortName: 'Product One' }];
  assert.deepEqual((await request(env, '/documents/skuMappingRules')).payload, {
    key: 'skuMappingRules', revision: 0, value: null, updatedAt: null
  });
  const created = await request(env, '/documents/skuMappingRules', 'PUT', { expectedRevision: 0, value: rules });
  assert.equal(created.payload.revision, 1);
  assert.deepEqual((await request(env, '/documents/skuMappingRules')).payload.value, rules);
  assert.equal((await request(env, '/documents/skuMappingRules', 'PUT', { expectedRevision: 0, value: [] })).response.status, 409);
  assert.equal((await request(env, '/documents/skuMappingRules', 'PUT', { expectedRevision: 1, value: [{ keyword: '' }] })).response.status, 400);
  assert.equal((await request(env, '/documents/settings', 'PUT', { expectedRevision: 0, value: { thermalMode: true } })).response.status, 200);
  assert.equal((await request(env, '/documents/other', 'PUT', { expectedRevision: 0, value: {} })).response.status, 404);
});

test('Invalid payloads cannot create partial cloud records', async () => {
  const env = environment();
  const invalid = { ...batch(), orders: [{ id: 'oops', parsedItems: [{ text: 'X', qty: 0 }] }] };
  assert.equal((await request(env, '/batches/batch-01', 'PUT', { ...invalid, expectedRevision: 0 })).response.status, 400);
  assert.equal((await request(env, '/batches/batch-01', 'PUT', { ...batch(), expectedRevision: -1 })).response.status, 400);
  assert.equal((await request(env, '/batches/not%2Fvalid')).response.status, 400);
  assert.equal(env.objects.size, 0);
  assert.equal((await request(env, '/batches')).payload.batches.length, 0);
});
test('D1 compare-and-swap conflict cleans up the uncommitted R2 object', async () => {
  const env = environment();
  await request(env, '/batches/batch-01', 'PUT', { ...batch(), expectedRevision: 0 });
  const actual = env.WORKSPACE_DB;
  const db = {
    prepare(sql) {
      if (sql.startsWith('UPDATE workspace_batches SET revision')) {
        return { bind() { return { async run() { return { meta: { changes: 0 } }; } }; } };
      }
      return actual.prepare(sql);
    }
  };
  const conflicted = await request({ ...env, WORKSPACE_DB: db }, '/batches/batch-01', 'PUT', {
    ...batch(), expectedRevision: 1
  });
  assert.equal(conflicted.response.status, 409);
  assert.equal(env.objects.size, 1, 'Uncommitted R2 copy must be cleaned up');
  assert.equal((await request(env, '/batches/batch-01')).payload.revision, 1);
});

test('A lost D1 acknowledgement must never delete the R2 object that D1 committed', async () => {
  const env = environment();
  await request(env, '/batches/batch-01', 'PUT', { ...batch(), expectedRevision: 0 });
  const originalDb = env.WORKSPACE_DB;
  const uncertainDb = {
    prepare(sql) {
      if (!sql.startsWith('UPDATE workspace_batches SET revision')) {
        return originalDb.prepare(sql);
      }
      return {
        bind(...params) {
          const actual = originalDb.prepare(sql).bind(...params);
          return { async run() {
            await actual.run();
            throw new Error('Simulated lost D1 write acknowledgement');
          } };
        }
      };
    }
  };
  const result = await request({ ...env, WORKSPACE_DB: uncertainDb }, '/batches/batch-01', 'PUT', {
    ...batch(), expectedRevision: 1,
    orders: [{ ...batch().orders[0], reviewed: true }]
  });
  assert.equal(result.response.status, 500);
  assert.equal(env.objects.size, 2, 'The D1-committed R2 object must not be deleted');
  const latest = await request(env, '/batches/batch-01');
  assert.equal(latest.payload.revision, 2);
  assert.equal(latest.payload.orders[0].reviewed, true);
});

test('D1-only Free mode stores and verifies multi-chunk UTF-8 orders without R2', async () => {
  const env = environment();
  delete env.WORKSPACE_OBJECTS;
  const data = batch();
  data.orders[0].pdfImage = 'data:image/jpeg;base64,' + 'ภาพภาษาไทย'.repeat(42000);
  const created = await request(env, '/batches/batch-01', 'PUT', { ...data, expectedRevision: 0 });
  assert.equal(created.response.status, 200);
  const stats = env.database.prepare('SELECT COUNT(*) AS count FROM workspace_object_chunks').get();
  assert.ok(stats.count > 1);
  const roundtrip = await request(env, '/batches/batch-01');
  assert.equal(roundtrip.response.status, 200);
  assert.deepEqual(roundtrip.payload.orders, data.orders);
  assert.equal((await request(env, '/batches')).payload.batches.length, 1);
  const attempt = await request(env, '/batches/batch-01', 'PUT', { ...data, expectedRevision: 0 });
  assert.equal(attempt.response.status, 409);
  assert.equal(env.database.prepare('SELECT COUNT(*) AS n FROM workspace_objects').get().n, 1);
});
test('Corrupt D1 stored object fails closed instead of returning damaged orders', async () => {
  const env = environment();
  delete env.WORKSPACE_OBJECTS;
  assert.equal((await request(env, '/batches/batch-01', 'PUT', { ...batch(), expectedRevision: 0 })).response.status, 200);
  env.database.prepare('UPDATE workspace_object_chunks SET body = ? WHERE chunk_index = 0').run(Buffer.from('broken'));
  const fetched = await request(env, '/batches/batch-01');
  assert.equal(fetched.response.status, 500);
  assert.equal(fetched.payload.error, 'workspace_backend_failure');
});
test('D1 Free object size cap refuses large batches without any partial rows', async () => {
  const env = environment();
  delete env.WORKSPACE_OBJECTS;
  const tooLarge = batch();
  tooLarge.orders[0].pdfImage = 'data:image/jpeg;base64,' + 'z'.repeat(4 * 1024 * 1024 + 1);
  const response = await request(env, '/batches/batch-01', 'PUT', { ...tooLarge, expectedRevision: 0 });
  assert.equal(response.response.status, 413);
  assert.equal(response.payload.error, 'free_tier_batch_limit_4mb');
  assert.equal(env.database.prepare('SELECT COUNT(*) AS n FROM workspace_objects').get().n, 0);
  assert.equal(env.database.prepare('SELECT COUNT(*) AS n FROM workspace_batches').get().n, 0);
});

test('Workers Free deployment config requires D1 only and never binds R2', () => {
  const example = readFileSync(new URL('../cloudflare/workspace/wrangler.toml.example', import.meta.url), 'utf8');
  assert.match(example, /binding = "WORKSPACE_DB"/);
  assert.doesNotMatch(example, /\[\[r2_buckets\]\]|WORKSPACE_OBJECTS/);
  const schema = readFileSync(new URL('../cloudflare/workspace/d1-objects.sql', import.meta.url), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS workspace_object_chunks/);
});

test('Browser session authenticates without exposing bearer token to the packing UI', async () => {
  const env = environment();
  const login = new Request(base + '/session', {
    method: 'POST', headers: {
      Origin: origin, 'Content-Type': 'application/json'
    }, body: JSON.stringify({ passphrase: accessToken })
  });
  const result = await handleWorkspaceRequest(login, env);
  assert.equal(result.status, 200);
  const json = await result.json();
  assert.equal(json.authenticated, true);
  assert.match(result.headers.get('Set-Cookie'), /HttpOnly/);
  const cookie = result.headers.get('Set-Cookie').split(';')[0];
  const get = (route, method = 'GET', body = null, extraHeaders = {}) =>
    new Request(base + route, {
      method, headers: {
        Origin: origin, Cookie: cookie,
        ...(body !== null ? { 'Content-Type': 'application/json' } : {}),
        ...extraHeaders
      },
      ...(body !== null ? { body: JSON.stringify(body) } : {})
    });
  const sessionStatus = await handleWorkspaceRequest(get('/session'), env);
  assert.equal(sessionStatus.status, 200);
  const sessionInfo = await sessionStatus.json();
  assert.equal(sessionInfo.csrf, json.csrf);
  const list = await handleWorkspaceRequest(get('/batches'), env);
  assert.equal(list.status, 200);
  const payload = { ...batch(), expectedRevision: 0 };
  assert.equal((await handleWorkspaceRequest(get('/batches/batch-01','PUT',payload),env)).status,403);
  const created = await handleWorkspaceRequest(get('/batches/batch-01','PUT',payload,{
    'X-PM-CSRF': json.csrf
  }), env);
  assert.equal(created.status,200);
  const crossSite = new Request(base + '/batches/batch-01',{
    method:'PUT',headers:{
      Origin:'https://malicious.example',Cookie:cookie,
      'Content-Type':'application/json','X-PM-CSRF':json.csrf
    },body:JSON.stringify({ ...batch(), expectedRevision:1 })
  });
  assert.equal((await handleWorkspaceRequest(crossSite,env)).status,403);
  assert.equal((await handleWorkspaceRequest(new Request(base+'/batches',{
    method:'GET',headers:{Origin:origin}
  }),env)).status,401);
});

test('Login only accepts same-origin browser requests with the correct passphrase', async () => {
  const env = environment();
  const make = (originHeader, passphrase) => new Request(base + '/session', {
    method: 'POST', headers: {Origin: originHeader, 'Content-Type':'application/json'},
    body: JSON.stringify({passphrase})
  });
  assert.equal((await handleWorkspaceRequest(make(origin,'incorrect'),env)).status,401);
  assert.equal((await handleWorkspaceRequest(make('https://untrusted.example',accessToken),env)).status,403);
  assert.equal((await handleWorkspaceRequest(make(origin,accessToken),env)).status,200);
});

test('authenticated Workspace Registry API reuses the two isolated platform catalogs', async () => {
  const env = environment();
  env.database.exec(readFileSync(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8'));
  env.REGISTRY_DB = env.WORKSPACE_DB;
  const catalog = platform => {
    const tiktok = platform === 'TIKTOK';
    const id = tiktok ? 'productId' : 'itemId';
    const product = { platform, [id]: 'p1', sellerSku: 'S1', variants: [] };
    product[tiktok ? 'productName' : 'title'] = 'Test Product';
    return {
      schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry',
      platform, source: { shop: 'test-shop', captureDate: '2026-11-04' },
      products: [product],
      skuRows: [{ platform, [id]: 'p1', sellerSku: 'S1', sellerSkuStatus: 'present',
        sourceRowType: tiktok ? 'product_sku' : 'variant', modelId: tiktok ? null : 'model1' }],
      productsWithoutAnySellerSku: [], pages: [{ products: 1 }],
      summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 1,
        sellerSkuPresentRowCount: 1, sellerSkuMissingInRowsCount: 0,
        productsWithoutAnySellerSkuCount: 0 }
    };
  };
  const initial = await request(env, '/registry/TIKTOK');
  assert.equal(initial.response.status, 200);
  assert.equal(initial.payload.registry, null);
  const saved = await request(env, '/registry/TIKTOK', 'PUT', {
    expectedRevision: 0, registry: catalog('TIKTOK')
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.revision, 1);
  const readBack = await request(env, '/registry/TIKTOK');
  assert.equal(readBack.payload.registry.summary.listedProductCount, 1);
  assert.equal((await request(env, '/registry/SHOPEE', 'PUT', {
    expectedRevision: 0, registry: catalog('SHOPEE')
  })).response.status, 409);
  assert.equal((await request(env, '/registry/SHOPEE', 'PUT', {
    expectedRevision: 1, registry: catalog('SHOPEE')
  })).response.status, 200);
  assert.equal((await request(env, '/registry/TIKTOK')).payload.registry.platform, 'TIKTOK');
  assert.equal((await request(env, '/registry/SHOPEE')).payload.registry.platform, 'SHOPEE');
});

test('Registry SKU assignments are central, revision-checked and never use keywords', async () => {
  const env = environment();
  const empty = await request(env, '/registry-assignments');
  assert.equal(empty.response.status, 200);
  assert.equal(empty.payload.revision, 0);
  assert.equal(empty.payload.value, null);

  const assignments = {
    schema: 'packmaster-registry-sku-assignments', version: 1, entries: [
      { platform: 'TIKTOK', sellerSku: 'TT-001', productId: 'p1', modelId: null, shortName: 'คลัง A' },
      { platform: 'SHOPEE', sellerSku: 'TT-001', productId: 'p99', modelId: 'm1', shortName: 'คลัง B' }
    ]
  };
  const saved = await request(env, '/registry-assignments', 'PUT', {
    expectedRevision: 0, value: assignments
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.revision, 1);
  assert.deepEqual((await request(env, '/registry-assignments')).payload.value, assignments);
  assert.equal((await request(env, '/registry-assignments','PUT', {
    expectedRevision: 0, value: assignments
  })).response.status, 409);
  assert.equal((await request(env, '/registry-assignments','PUT', {
    expectedRevision: 1,
    value: {...assignments,entries: [...assignments.entries, assignments.entries[0]] }
  })).response.status, 400);
  assert.equal((await request(env, '/registry-assignments','PUT', {
    expectedRevision: 1,
    value: {...assignments,entries: [{...assignments.entries[0],shortName:''}] }
  })).response.status, 400);
  assert.equal((await request(env, '/registry-assignments','PUT', {
    expectedRevision: 1,
    value: {...assignments,entries: []}
  })).response.status, 200);
  assert.equal((await request(env, '/registry-assignments')).payload.revision, 2);
  assert.equal(env.database.prepare('SELECT COUNT(*) AS n FROM workspace_documents').get().n, 0,
    'The retired keyword mapping document must not be modified');
});

test('150 high-resolution PDF labels persist through D1 multipart protocol and reload without data loss', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const cloudClient = require('../packmaster-cloud-client.js');
  const env = environment();
  delete env.WORKSPACE_OBJECTS;
  const fetchImpl = (url, options) => {
    if (options.body) assert.ok(Buffer.byteLength(options.body) < 2 * 1024 * 1024,
      'Each multipart request must stay under 2 MiB on Cloudflare Free');
    return handleWorkspaceRequest(new Request(url, {
    method: options.method,
    headers: { ...options.headers, Origin: origin },
    ...(options.body ? { body: options.body } : {})
  }), env);
  };
  const client = cloudClient.createClient({
    baseUrl: origin + '/', token: accessToken, fetchImpl
  });
  const orders = Array.from({ length: 150 }, (_, i) => ({
    id: 'label-' + i, platform: 'TIKTOK', sourcePage: i,
    parsedItems: [{ text: 'ผ้าเช็ด Synthetic Seller SKU-' + i, qty: 1, sellerSku: 'SKU-' + i }],
    pdfImage: 'data:image/jpeg;base64,' + String(i % 10).repeat(130000)
  }));
  const meta = { id: 'batch-multipart', name: '150 synthetic labels' };
  const created = await client.saveBatch(meta, orders);
  assert.equal(created.cloudRevision, 1);
  const registered = env.database.prepare(
    'SELECT COUNT(*) AS count FROM workspace_order_parts WHERE batch_id = ?'
  ).get(meta.id).count;
  assert.ok(registered > 10 && registered <= 64);
  const current = env.database.prepare('SELECT orders_key FROM workspace_batches WHERE id = ?').get(meta.id);
  assert.match(current.orders_key, /^orders\/batch-multipart\//);

  const secondClient = cloudClient.createClient({
    baseUrl: origin + '/', token: accessToken, fetchImpl
  });
  const loaded = await secondClient.loadBatch(meta.id);
  assert.deepEqual(loaded.orders, orders, 'all pages and print images must survive download');
  assert.equal(loaded.meta.cloudRevision, 1);

  const edited = [...orders];
  edited[0] = { ...orders[0], manuallyReviewed: true };
  const result = await client.saveBatch(meta, edited);
  assert.equal(result.cloudRevision, 2);
  const objectsAfterUpdate = env.database.prepare(
    'SELECT COUNT(*) AS n FROM workspace_order_parts WHERE batch_id = ?'
  ).get(meta.id).n;
  assert.ok(objectsAfterUpdate < registered * 2, 'unchanged label parts must not consume duplicate D1 space');
  await assert.rejects(
    secondClient.saveBatch(meta, [{ ...orders[0], manuallyReviewed: false }, ...orders.slice(1)]),
    error => error.status === 409 || /modified on another device/.test(error.message)
  );
  assert.equal((await client.loadBatch(meta.id)).orders[0].manuallyReviewed, true);
});

test('unfinished large Batch upload never becomes an incomplete active Batch', async () => {
  const env = environment();
  delete env.WORKSPACE_OBJECTS;
  const { partHash } = await import('../cloudflare/workspace/batch-parts.mjs');
  const orders = [{ id: 'one', parsedItems: [{text: 'SKU', qty: 1}],
    pdfImage: 'data:image/jpeg;base64,' + 'a'.repeat(950000) }];
  const hash = await partHash(JSON.stringify(orders));
  const staged = await request(env, '/batches/uncommitted/parts/' + hash, 'PUT', {
    expectedRevision: 0, orders
  });
  assert.equal(staged.response.status, 200);
  assert.equal((await request(env, '/batches')).payload.batches.length, 0);
  const missing = await request(env, '/batches/uncommitted', 'PUT', {
    expectedRevision: 0, meta: { id: 'uncommitted' }, partHashes: [hash, 'c'.repeat(64)], orderCount: 2
  });
  assert.equal(missing.response.status, 409);
  assert.equal((await request(env, '/batches')).payload.batches.length, 0);
  const repeated = await request(env, '/batches/uncommitted/parts/' + hash, 'PUT', {
    expectedRevision: 0, orders
  });
  assert.equal(repeated.payload.reused, true);
});

test('Multipart commit rejects duplicate order IDs across different immutable parts', async () => {
  const env = environment();
  delete env.WORKSPACE_OBJECTS;
  const { partHash } = await import('../cloudflare/workspace/batch-parts.mjs');
  const first = [{ id: 'same-order', parsedItems: [{ text: 'SKU', qty: 1 }] }];
  const second = [{ id: 'same-order', parsedItems: [{ text: 'SKU', qty: 2 }] }];
  const hashes = [];
  for (const orders of [first, second]) {
    const hash = await partHash(JSON.stringify(orders));
    hashes.push(hash);
    assert.equal((await request(env, '/batches/duplicate-test/parts/' + hash, 'PUT', {
      expectedRevision: 0, orders
    })).response.status, 200);
  }
  const committed = await request(env, '/batches/duplicate-test', 'PUT', {
    expectedRevision: 0,
    meta: { id: 'duplicate-test' },
    partHashes: hashes, orderCount: 2
  });
  assert.equal(committed.response.status, 400);
  assert.equal(committed.payload.error, 'duplicate_batch_order_ids');
  assert.equal((await request(env, '/batches')).payload.batches.length, 0);
});

test('Corrupted immutable PDF part is never returned as a valid printable order', async () => {
  const env = environment();
  delete env.WORKSPACE_OBJECTS;
  const { partHash, partKey } = await import('../cloudflare/workspace/batch-parts.mjs');
  const orders = [{ id: 'one', parsedItems: [{ text: 'SKU', qty: 1 }],
    pdfImage: 'data:image/jpeg;base64,' + 'a'.repeat(100000) }];
  const hash = await partHash(JSON.stringify(orders));
  assert.equal((await request(env, '/batches/corrupt-test/parts/' + hash, 'PUT', {
    expectedRevision: 0, orders
  })).response.status, 200);
  assert.equal((await request(env, '/batches/corrupt-test', 'PUT', {
    expectedRevision: 0, meta: { id: 'corrupt-test' },
    partHashes: [hash], orderCount: 1
  })).response.status, 200);
  env.database.prepare(
    'UPDATE workspace_object_chunks SET body = ? WHERE object_key = ? AND chunk_index = 0'
  ).run(Buffer.from('corrupted'), partKey('corrupt-test', hash));
  const response = await request(env, '/batches/corrupt-test/parts/' + hash);
  assert.equal(response.response.status, 500);
  assert.equal(response.payload.error, 'workspace_backend_failure');
});

test('Multipart staging rejects unknown credentials and a stale Batch revision', async () => {
  const env = environment();
  delete env.WORKSPACE_OBJECTS;
  assert.equal((await request(env, '/batches/locked', 'PUT', {
    ...batch('locked'), expectedRevision: 0
  })).response.status, 200);
  const { partHash } = await import('../cloudflare/workspace/batch-parts.mjs');
  const orders = [{ id: 'later', parsedItems: [{ text: 'SKU', qty: 1 }] }];
  const hash = await partHash(JSON.stringify(orders));
  const route = '/batches/locked/parts/' + hash;
  assert.equal((await request(env, route, 'PUT', {
    expectedRevision: 1, orders
  }, { Authorization: 'Bearer invalid' })).response.status, 401);
  const stale = await request(env, route, 'PUT', {
    expectedRevision: 0, orders
  });
  assert.equal(stale.response.status, 409);
  assert.equal(env.database.prepare('SELECT COUNT(*) AS n FROM workspace_order_parts').get().n, 0);
});
