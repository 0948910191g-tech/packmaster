import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPut } from '../functions/api/registry.js';
import { onRequestPost } from '../functions/api/registry/seed.js';

const validStore = (updatedAt = '2026-01-01T00:00:00.000Z') => ({
  schema: 'packmaster-marketplace-registry',
  version: 1,
  updatedAt,
  platforms: {
    TIKTOK: {
      registryType: 'marketplace_product_sku_source_registry',
      schemaVersion: 1,
      platform: 'TIKTOK',
      source: { shop: 'test-shop', captureDate: '2026-01-01' },
      summary: {},
      pages: [],
      products: [],
      skuRows: [],
      productsWithoutAnySellerSku: []
    }
  }
});

const createDatabase = () => {
  let row = null;
  return {
    binding: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) {
            args = values;
            return this;
          },
          async first() {
            if (!sql.startsWith('SELECT')) throw new Error('Unexpected first query');
            if (!row || row.id !== args[0]) return null;
            return { ...row };
          },
          async run() {
            if (sql.startsWith('INSERT')) {
              if (row) return { meta: { changes: 0 } };
              row = {
                id: args[0],
                registry_json: args[1],
                revision: args[2],
                updated_at: args[3],
                updated_by: args[4]
              };
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('UPDATE')) {
              const expectedRevision = args[4];
              if (!row || row.id !== args[3] || row.revision !== expectedRevision) {
                return { meta: { changes: 0 } };
              }
              row = {
                ...row,
                registry_json: args[0],
                revision: row.revision + 1,
                updated_at: args[1],
                updated_by: args[2]
              };
              return { meta: { changes: 1 } };
            }
            throw new Error('Unexpected run query');
          }
        };
      }
    },
    getRow() { return row; }
  };
};

const identity = { packMasterIdentity: { email: 'owner@example.com', sub: 'user-1' } };
const postRequest = (registry) => new Request('https://packmaster.pages.dev/api/registry/seed', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ registry })
});
const putRequest = (registry, expectedRevision) => new Request('https://packmaster.pages.dev/api/registry', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ registry, expectedRevision })
});

test('D1 API seeds exactly once and uses conditional revisions for updates', async () => {
  const database = createDatabase();
  const env = { REGISTRY_DB: database.binding };
  const empty = await onRequestGet({ env });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { row: null });

  const seeded = await onRequestPost({
    request: postRequest(validStore()),
    env,
    data: identity
  });
  assert.equal(seeded.status, 201);
  assert.equal((await seeded.json()).row.revision, 1);

  const duplicateSeed = await onRequestPost({
    request: postRequest(validStore('2026-01-02T00:00:00.000Z')),
    env,
    data: identity
  });
  assert.equal(duplicateSeed.status, 409);
  assert.equal(database.getRow().revision, 1);

  const updated = await onRequestPut({
    request: putRequest(validStore('2026-01-03T00:00:00.000Z'), 1),
    env,
    data: identity
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).row.revision, 2);

  const staleUpdate = await onRequestPut({
    request: putRequest(validStore('2026-01-04T00:00:00.000Z'), 1),
    env,
    data: identity
  });
  assert.equal(staleUpdate.status, 409);
  assert.equal(database.getRow().revision, 2);
});

test('D1 API rejects invalid stores and requests without a verified identity', async () => {
  const database = createDatabase();
  const env = { REGISTRY_DB: database.binding };
  const invalid = await onRequestPost({
    request: postRequest({ schema: 'wrong' }),
    env,
    data: identity
  });
  assert.equal(invalid.status, 400);
  assert.equal(database.getRow(), null);

  const missingIdentity = await onRequestPut({
    request: putRequest(validStore(), 1),
    env,
    data: {}
  });
  assert.equal(missingIdentity.status, 401);
});