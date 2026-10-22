import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const registryApi = require(path.resolve(__dirname, '../packmaster-marketplace-registry.js'));

const tiktok = {
  schemaVersion: 1,
  registryType: 'marketplace_product_sku_source_registry',
  platform: 'TIKTOK',
  source: { captureDate: '2026-10-21', captureScope: 'live', shop: 'safe-tt', sourceFile: 'tt.json' },
  summary: {
    listedProductCount: 3,
    uniqueProductIdCount: 3,
    skuModelRowCount: 2,
    sellerSkuPresentRowCount: 1,
    sellerSkuMissingInRowsCount: 1,
    productsWithoutAnySellerSkuCount: 2
  },
  pages: [{ page: 1, products: 2 }, { page: 2, products: 1 }],
  products: [
    { platform: 'TIKTOK', productId: 'tt-1', productName: 'SAFE PRODUCT A', sellerSku: 'TT-A', status: 'live', variants: [] },
    { platform: 'TIKTOK', productId: 'tt-2', productName: 'SAFE PRODUCT B', sellerSku: null, status: 'live', variants: [{ sellerSku: null, variantName: 'default' }] },
    { platform: 'TIKTOK', productId: 'tt-3', productName: 'SAFE PRODUCT C', sellerSku: null, status: 'live', variants: [] }
  ],
  skuRows: [
    { platform: 'TIKTOK', productId: 'tt-1', productName: 'SAFE PRODUCT A', modelId: null, sellerSku: 'TT-A', variantName: null, variantOrdinal: null, sourceRowType: 'product_sku', sellerSkuStatus: 'present', listingStatus: 'live' },
    { platform: 'TIKTOK', productId: 'tt-2', productName: 'SAFE PRODUCT B', modelId: null, sellerSku: null, variantName: 'default', variantOrdinal: 1, sourceRowType: 'variant', sellerSkuStatus: 'not_displayed', listingStatus: 'live' }
  ],
  productsWithoutAnySellerSku: [
    { productId: 'tt-2', productName: 'SAFE PRODUCT B', parentSku: null, variantCount: 1, variantSellerSkuValues: [null] },
    { productId: 'tt-3', productName: 'SAFE PRODUCT C', parentSku: null, variantCount: 0, variantSellerSkuValues: [] }
  ],
  internalShortNameStatus: 'not_assigned'
};

const shopee = {
  schemaVersion: 1,
  registryType: 'marketplace_product_sku_source_registry',
  platform: 'SHOPEE',
  source: { captureDate: '2026-10-21', captureScope: 'live', shop: 'safe-sh', sourceFile: 'sh.json' },
  summary: {
    listedProductCount: 1,
    uniqueProductIdCount: 1,
    skuModelRowCount: 2,
    sellerSkuPresentRowCount: 1,
    sellerSkuMissingInRowsCount: 1,
    productsWithoutAnySellerSkuCount: 0
  },
  pages: [{ page: 1, products: 1 }],
  products: [
    { platform: 'SHOPEE', itemId: 'sh-1', title: 'SAFE PRODUCT D', parentSku: 'PARENT-D', status: 'live', variants: [
      { modelId: 'model-1', sellerSku: 'SH-D1', variantName: 'single' },
      { modelId: 'model-2', sellerSku: null, variantName: 'bundle' }
    ] }
  ],
  skuRows: [
    { platform: 'SHOPEE', itemId: 'sh-1', title: 'SAFE PRODUCT D', modelId: 'model-1', parentSku: 'PARENT-D', sellerSku: 'SH-D1', variantName: 'single', variantOrdinal: 1, sourceRowType: 'variant', sellerSkuStatus: 'present', listingStatus: 'live' },
    { platform: 'SHOPEE', itemId: 'sh-1', title: 'SAFE PRODUCT D', modelId: 'model-2', parentSku: 'PARENT-D', sellerSku: null, variantName: 'bundle', variantOrdinal: 2, sourceRowType: 'variant', sellerSkuStatus: 'not_displayed', listingStatus: 'live' }
  ],
  productsWithoutAnySellerSku: [],
  internalShortNameStatus: 'not_assigned'
};

assert.equal(registryApi.STORAGE_KEY, 'packmasterMarketplaceRegistryV1');
assert.deepEqual(registryApi.validatePlatformRegistry(tiktok, 'TIKTOK'), tiktok);
assert.deepEqual(registryApi.validatePlatformRegistry(shopee, 'SHOPEE'), shopee);
assert.throws(() => registryApi.validatePlatformRegistry(shopee, 'TIKTOK'), /Expected TIKTOK/);
assert.throws(() => registryApi.validatePlatformRegistry({ ...tiktok, platform: 'UNKNOWN' }), /platform/i);
assert.throws(() => registryApi.validatePlatformRegistry({
  ...tiktok,
  products: [tiktok.products[0], { ...tiktok.products[0] }]
}), /Duplicate productId/);
assert.throws(() => registryApi.validatePlatformRegistry({
  ...tiktok,
  skuRows: [{ ...tiktok.skuRows[0], platform: 'SHOPEE' }, tiktok.skuRows[1]]
}), /platform does not match/);
assert.throws(() => registryApi.validatePlatformRegistry({
  ...tiktok,
  skuRows: [{ ...tiktok.skuRows[0], sellerSkuStatus: 'not_displayed' }, tiktok.skuRows[1]]
}), /conflicts with sellerSku/);
assert.throws(() => registryApi.validatePlatformRegistry({
  ...shopee,
  skuRows: [shopee.skuRows[0], { ...shopee.skuRows[1], modelId: 'model-1' }]
}), /Duplicate Shopee modelId/);
assert.throws(() => registryApi.validatePlatformRegistry({
  ...tiktok,
  summary: { ...tiktok.summary, sellerSkuPresentRowCount: 2 }
}), /summary does not match/);

const emptyStore = registryApi.createEmptyStore(new Date('2026-10-22T00:00:00.000Z'));
const withTikTok = registryApi.replacePlatformRegistry(emptyStore, tiktok, new Date('2026-10-22T01:00:00.000Z'));
assert.deepEqual(Object.keys(withTikTok.platforms), ['TIKTOK']);
const withBoth = registryApi.replacePlatformRegistry(withTikTok, shopee, new Date('2026-10-22T02:00:00.000Z'));
assert.deepEqual(Object.keys(withBoth.platforms).sort(), ['SHOPEE', 'TIKTOK']);
assert.equal(withBoth.platforms.TIKTOK.products[0].productId, 'tt-1');
assert.equal(withBoth.platforms.SHOPEE.products[0].itemId, 'sh-1');
const summary = registryApi.getSummary(withBoth);
assert.equal(summary.TIKTOK.productCount, 3);
assert.equal(summary.TIKTOK.skuRowCount, 2);
assert.equal(summary.SHOPEE.sellerSkuPresentCount, 1);

assert.throws(() => registryApi.replacePlatformRegistry(withBoth, {
  ...tiktok,
  source: { ...tiktok.source, captureDate: '2026-10-20' }
}), /newer TIKTOK registry/);

const memoryStorage = new Map();
const storage = {
  getItem(key) { return memoryStorage.has(key) ? memoryStorage.get(key) : null; },
  setItem(key, value) { memoryStorage.set(key, value); }
};
assert.equal(registryApi.loadStore(storage).error, null);
registryApi.saveStore(storage, withBoth);
assert.deepEqual(registryApi.loadStore(storage).store, withBoth);
memoryStorage.set(registryApi.STORAGE_KEY, '{invalid-json');
const corruptLoad = registryApi.loadStore(storage);
assert.match(corruptLoad.error, /JSON|property/i);
assert.equal(memoryStorage.get(registryApi.STORAGE_KEY), '{invalid-json', 'corrupt stored data must remain untouched');

console.log('PackMaster marketplace registry validation, isolation, freshness, and storage tests passed');
