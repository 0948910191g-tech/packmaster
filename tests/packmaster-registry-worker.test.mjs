import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleRequest } from '../cloudflare/registry-worker.mjs';

const token = 'test-only-token-abcdefghijklmnopqrstuvwxyz';
const origin = 'https://0948910191g-tech.github.io';

function catalog(platform, day = '2026-11-01') {
  const tiktok = platform === 'TIKTOK';
  const id = tiktok ? 'productId' : 'itemId';
  const product = { platform, [id]: 'p1', sellerSku: 'S1', variants: [] };
  product[tiktok ? 'productName' : 'title'] = 'Safe Test Product';
  const row = { platform, [id]: 'p1', sellerSku: 'S1', sellerSkuStatus: 'present',
    sourceRowType: tiktok ? 'product_sku' : 'variant', modelId: tiktok ? null : 'model1' };
  return {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry',
    platform, source: { shop: 'test-shop', captureDate: day },
    products: [product], skuRows: [row], productsWithoutAnySellerSku: [],
    pages: [{ products: 1 }],
    summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 1,
      sellerSkuPresentRowCount: 1, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
  };
}

function fakeDb() {
  // Exercise the real SQL against an isolated in-memory SQLite database.
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../cloudflare/schema.sql', import.meta.url), 'utf8'));
  return {
    db,
    prepare(sql) {
      return {
        async first() { return db.prepare(sql).get() || null; },
        bind(...args) {
          return {
            async first() { return db.prepare(sql).get(...args) || null; },
            async run() {
              const result = db.prepare(sql).run(...args);
              return { meta: { changes: Number(result.changes) } };
            }
          };
        }
      };
    }
  };
}
function call(env, platform, method = 'GET', payload = null, headers = {}) {
  return handleRequest(new Request('https://example.workers.dev/api/registry/' + platform, {
    method, headers: { Authorization: 'Bearer ' + token, Origin: origin,
      ...(payload ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  }), env);
}

test('D1 registry requires explicit origin and authentication', async () => {
  const env = { REGISTRY_DB: fakeDb(), REGISTRY_SYNC_TOKEN: token, ALLOWED_ORIGINS: origin };
  assert.equal((await call(env, 'TIKTOK')).status, 200);
  assert.equal((await call({ ...env, REGISTRY_SYNC_TOKEN: '' }, 'TIKTOK')).status, 503);
  assert.equal((await call(env, 'TIKTOK', 'GET', null, { Authorization: 'Bearer invalid' })).status, 401);
  assert.equal((await call(env, 'TIKTOK', 'GET', null, { Origin: 'https://unsafe.example' })).status, 403);
  assert.equal((await call(env, 'UNKNOWN')).status, 404);
});
test('platform isolation, revisions, and stale snapshots', async () => {
  const env = { REGISTRY_DB: fakeDb(), REGISTRY_SYNC_TOKEN: token, ALLOWED_ORIGINS: origin };
  let response = await call(env, 'TIKTOK', 'PUT', { expectedRevision: 0, registry: catalog('TIKTOK') });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 1);
  assert.equal((await call(env, 'TIKTOK', 'PUT', { expectedRevision: 0, registry: catalog('TIKTOK') })).status, 409);
  // Both platforms share one D1 row, so the revision also guards cross-platform writes.
  assert.equal((await call(env, 'SHOPEE', 'PUT', { expectedRevision: 0, registry: catalog('SHOPEE') })).status, 409);
  response = await call(env, 'SHOPEE', 'PUT', { expectedRevision: 1, registry: catalog('SHOPEE') });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 2);
  assert.equal((await call(env, 'TIKTOK', 'PUT', { expectedRevision: 2, registry: catalog('TIKTOK', '2026-10-01') })).status, 409);
  response = await call(env, 'TIKTOK', 'PUT', { expectedRevision: 2, registry: catalog('TIKTOK', '2026-11-02') });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 3);
  const shopee = await (await call(env, 'SHOPEE')).json();
  assert.equal(shopee.revision, 3);
  assert.equal(shopee.registry.platform, 'SHOPEE');
  assert.equal(shopee.registry.source.captureDate, '2026-11-01');
  assert.equal((await (await call(env, 'TIKTOK')).json()).registry.source.captureDate, '2026-11-02');
  const stored = JSON.parse(env.REGISTRY_DB.db.prepare('SELECT registry_json FROM packmaster_marketplace_registry WHERE id = 1').get().registry_json);
  assert.deepEqual(Object.keys(stored.platforms).sort(), ['SHOPEE', 'TIKTOK']);
});
test('reject invalid registry and incorrect platform', async () => {
  const env = { REGISTRY_DB: fakeDb(), REGISTRY_SYNC_TOKEN: token, ALLOWED_ORIGINS: origin };
  assert.equal((await call(env, 'TIKTOK', 'PUT', { expectedRevision: 0, registry: catalog('SHOPEE') })).status, 400);
  assert.equal((await call(env, 'TIKTOK', 'PUT', { expectedRevision: -1, registry: catalog('TIKTOK') })).status, 400);
  assert.equal((await call(env, 'TIKTOK', 'PUT', { expectedRevision: 0, registry: { products: [] } })).status, 400);
});

test('one oversized platform cannot replace the existing catalog', async () => {
  const env = { REGISTRY_DB: fakeDb(), REGISTRY_SYNC_TOKEN: token, ALLOWED_ORIGINS: origin };
  const first = catalog('TIKTOK');
  first.products[0].productName = 'ก'.repeat(550000);
  assert.equal((await call(env, 'TIKTOK', 'PUT', { expectedRevision: 0, registry: first })).status, 200);
  const second = catalog('SHOPEE');
  second.products[0].title = 'ก'.repeat(550000);
  const rejected = await call(env, 'SHOPEE', 'PUT', { expectedRevision: 1, registry: second });
  assert.equal(rejected.status, 413);
  assert.equal((await rejected.json()).error, 'combined_registry_too_large');
  assert.equal((await (await call(env, 'SHOPEE')).json()).registry, null);
  assert.equal((await (await call(env, 'TIKTOK')).json()).revision, 1);
});

test('failed read of corrupt D1 JSON does not overwrite the row', async () => {
  const env = { REGISTRY_DB: fakeDb(), REGISTRY_SYNC_TOKEN: token, ALLOWED_ORIGINS: origin };
  env.REGISTRY_DB.db.prepare('INSERT INTO packmaster_marketplace_registry (id, registry_json, revision, updated_at, updated_by) VALUES (1, ?, 1, ?, ?)').run('{"malformed":true}', '2026-11-04', 'fixture');
  assert.equal((await call(env, 'TIKTOK')).status, 500);
  assert.equal((await call(env, 'SHOPEE', 'PUT', { expectedRevision: 1, registry: catalog('SHOPEE') })).status, 500);
  assert.equal(env.REGISTRY_DB.db.prepare('SELECT registry_json FROM packmaster_marketplace_registry WHERE id = 1').get().registry_json, '{"malformed":true}');
});
