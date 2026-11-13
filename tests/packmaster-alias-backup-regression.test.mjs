import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registry = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const workspace = require('../packmaster-workspace.js');

function fixture() {
  const product = { platform: 'TIKTOK', productId: 'p1', productName: 'ม้า', sellerSku: null, variants: [] };
  const source = {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry', platform: 'TIKTOK',
    source: { shop: 'test', captureDate: '2026-11-12' }, products: [product],
    skuRows: [{ ...product, sellerSkuStatus: 'not_displayed', modelId: null, sourceRowType: 'product_sku' }],
    productsWithoutAnySellerSku: [{ productId: 'p1' }], pages: [{ products: 1 }],
    summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 1,
      sellerSkuPresentRowCount: 0, sellerSkuMissingInRowsCount: 1, productsWithoutAnySellerSkuCount: 1 }
  };
  const index = identity.buildIndex(registry.replacePlatformRegistry(registry.createEmptyStore(), source), registry);
  const item = { text: 'ม้า | one | ALIAS' };
  const saved = matcher.upsertManualSkuAlias(matcher.newAssignments(), index, 'TIKTOK', item,
    { platform: 'TIKTOK', productId: 'p1', productName: 'ม้า', variantName: null }, 'Mapped', identity);
  return { index, item, saved };
}

test('Thai skeleton fallback cannot bypass a confirmed alias pair', () => {
  const { index, item, saved } = fixture();
  assert.equal(matcher.match(index, 'TIKTOK', item, saved, identity).status, 'matched');
  const changed = { text: 'มา | two | ALIAS' };
  assert.equal(identity.resolve(index, 'TIKTOK', changed).reason, 'seller_sku_not_found');
  assert.equal(matcher.match(index, 'TIKTOK', changed, saved, identity).reason, 'manual_alias_catalog_pair_mismatch');
});

test('workspace backup preserves version 2 aliases and rejects malformed aliases', async () => {
  const { saved } = fixture();
  const payload = await workspace.collectBackupPayload({
    batchApi: { listBatches: async () => [], loadBatch: async () => null, saveBatch: async () => {}, deleteBatch: async () => {} },
    settings: { registryAssignments: saved }, skuRules: [], appVersion: 'test'
  });
  const backup = workspace.createBackup(payload, new Date('2026-11-12T00:00:00Z'));
  assert.deepEqual(workspace.validateBackup(JSON.parse(JSON.stringify(backup))).settings.registryAssignments, saved);
  const invalid = structuredClone(backup);
  invalid.settings.registryAssignments.entries[0].manualSkuAliases = 'invalid';
  assert.throws(() => workspace.validateBackup(invalid), /alias/i);
});
