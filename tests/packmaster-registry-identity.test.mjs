import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');

function catalog(platform, skus) {
  const isTikTok = platform === 'TIKTOK';
  const idKey = isTikTok ? 'productId' : 'itemId';
  const titleKey = isTikTok ? 'productName' : 'title';
  const products = skus.map((sku, i) => ({
    platform, [idKey]: 'product-' + (i + 1), [titleKey]: 'PRODUCT ' + (i + 1),
    sellerSku: sku, variants: []
  }));
  const skuRows = skus.map((sku, i) => ({
    platform, [idKey]: 'product-' + (i + 1), [titleKey]: 'PRODUCT ' + (i + 1),
    sellerSku: sku, modelId: isTikTok ? null : 'model-' + (i + 1),
    sellerSkuStatus: sku ? 'present' : 'not_displayed',
    sourceRowType: isTikTok ? 'product_sku' : 'variant'
  }));
  return {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry',
    platform, source: { shop: 'test-shop', captureDate: '2026-10-21' },
    products, skuRows,
    productsWithoutAnySellerSku: products.filter(product => !product.sellerSku),
    summary: {
      listedProductCount: products.length, uniqueProductIdCount: products.length,
      skuModelRowCount: skuRows.length,
      sellerSkuPresentRowCount: skus.filter(Boolean).length,
      sellerSkuMissingInRowsCount: skus.filter(sku => !sku).length,
      productsWithoutAnySellerSkuCount: skus.filter(sku => !sku).length
    },
    pages: [{ page: 1, products: products.length }]
  };
}

test('exact Seller SKU is advisory, platform-scoped, and cannot invent an internal name', () => {
  let store = registryApi.createEmptyStore();
  store = registryApi.replacePlatformRegistry(store, catalog('TIKTOK', ['TT-001', 'SharedSKU', 'SharedSKU', null]));
  store = registryApi.replacePlatformRegistry(store, catalog('SHOPEE', ['SH-001', 'TT-001', null]));
  const index = identity.buildIndex(store, registryApi);

  assert.equal(identity.resolve(index, 'TIKTOK', { text: 'PRODUCT | Variant | TT-001', qty: 2 }).status, 'found');
  const match = identity.resolve(index, 'TIKTOK', { text: 'PRODUCT | Variant | TT-001' });
  assert.equal(match.candidate.productId, 'product-1');
  assert.equal(match.captureDate, '2026-10-21');
  assert.equal(match.candidate.shortName, undefined);
  assert.equal(identity.resolve(index, 'SHOPEE', { text: 'Seller SKU: TT-001' }).candidate.productId, 'product-2');
  assert.equal(identity.resolve(index, 'SHOPEE', { text: 'Seller SKU: SH-001' }).candidate.modelId, 'model-1');

  const duplicate = identity.resolve(index, 'TIKTOK', { text: 'PRODUCT | Variant | sharedsku' });
  assert.equal(duplicate.status, 'ambiguous');
  assert.equal(duplicate.candidateCount, 2);
  assert.equal(identity.resolve(index, 'SHOPEE', { text: 'Unknown | Item | SharedSKU' }).status, 'not_found');
  assert.equal(identity.resolve(index, 'TIKTOK', { text: 'Product | Variant | NOT-FOUND' }).status, 'not_found');
  assert.equal(identity.resolve(index, 'TIKTOK', { text: 'Product TT-001 Value Pack' }).status, 'no_identity');
});

test('source identity extraction fails closed on missing or malformed fields', () => {
  assert.equal(identity.extractSellerSku('TIKTOK', { text: 'Product | Variant' }), null);
  assert.equal(identity.extractSellerSku('SHOPEE', { text: 'Seller SKU: SKU-05' }), 'SKU-05');
  assert.equal(identity.extractSellerSku('SHOPEE', { sellerSku: ' SKU-05 ' }), 'SKU-05');
  assert.equal(identity.extractSellerSku('TIKTOK', { text: 'One | Two | Three | Four' }), null);
  assert.equal(identity.extractSellerSku('UNKNOWN', { sellerSku: 'X' }), null);
  assert.equal(identity.normalizeSellerSku('  tt-  001  '), 'TT- 001');
  const emptyIndex = identity.buildIndex(registryApi.createEmptyStore(), registryApi);
  assert.equal(identity.resolve(emptyIndex, 'TIKTOK', { text: 'A | B | Seller SKU' }).status, 'not_found');
  assert.equal(identity.resolve(emptyIndex, 'WRONG', { text: 'A | B | X' }).status, 'unavailable');
  assert.throws(() => identity.buildIndex({}, registryApi), /schema/);
});

test('Cloud and Local packing use registry-only matcher', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\.\/packmaster-registry-identity\.js"><\/script>/);
  assert.match(html, /data-pm-registry-evidence/);
  assert.match(html, /registryIdentityApi\.resolve\(marketplaceCatalogIndex, quickMapState\.row\.order\.platform, item\)/);
  assert.match(html, /ไม่มี Keyword fallback/);
  assert.match(html, /registryMatcherApi\.match\(marketplaceCatalogIndex, platform, item/);
  assert.doesNotMatch(html, /if \(!cloudMode\) return matchSkuRule\(/);
  assert.match(html, /data-pm-registry-assignments/);
  assert.match(html, /data-pm-registry-matcher-page/);
});

test('Shopee falls back to one exact catalog row only when Seller SKU is absent', () => {
  const source = catalog('SHOPEE', [null, null]);
  source.products[0].title = 'HAKU Cooling 12 ชิ้น';
  source.skuRows[0].title = 'HAKU Cooling 12 ชิ้น';
  source.products[1].title = 'Another product';
  source.skuRows[1].title = 'Another product';

  const store = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), source);
  const index = identity.buildIndex(store, registryApi);

  const found = identity.resolve(index, 'SHOPEE', { text: ' HAKU   Cooling  12 ชิ้น ' });
  assert.equal(found.status, 'found');
  assert.equal(found.identityType, 'catalog_row');
  assert.equal(found.candidate.productId, 'product-1');

  assert.equal(identity.resolve(index, 'SHOPEE', {
    sellerSku: 'NOT-IN-REGISTRY',
    text: 'HAKU Cooling 12 ชิ้น'
  }).status, 'not_found', 'explicit Seller SKU must never fall back to a title');

  source.products[1].title = 'HAKU Cooling 12 ชิ้น';
  source.skuRows[1].title = 'HAKU Cooling 12 ชิ้น';
  const duplicateIndex = identity.buildIndex(
    registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), source),
    registryApi
  );
  assert.equal(identity.resolve(duplicateIndex, 'SHOPEE', {
    text: 'HAKU Cooling 12 ชิ้น'
  }).status, 'ambiguous');
});

test('TikTok can use exact Product + Variant catalog identity when Seller SKU is absent or duplicated', () => {
  const source = catalog('TIKTOK', ['DUP-SKU', 'DUP-SKU', null]);
  source.skuRows[0].productName = 'HOYA Jersey';
  source.skuRows[0].variantName = 'S';
  source.skuRows[1].productName = 'HOYA Jersey';
  source.skuRows[1].variantName = 'M';
  source.skuRows[2].productName = 'HAKU Baby';
  source.skuRows[2].variantName = '40 sheets';
  source.products[0].productName = 'HOYA Jersey';
  source.products[1].productName = 'HOYA Jersey';
  source.products[2].productName = 'HAKU Baby';

  const store = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), source);
  const index = identity.buildIndex(store, registryApi);

  const duplicateResolved = identity.resolve(index, 'TIKTOK', {
    text: 'HOYA Jersey | M | DUP-SKU',
    sellerSku: 'DUP-SKU'
  });
  assert.equal(duplicateResolved.status, 'found');
  assert.equal(duplicateResolved.identityType, 'catalog_row');
  assert.equal(duplicateResolved.candidate.productId, 'product-2');

  const missingSkuResolved = identity.resolve(index, 'TIKTOK', {
    text: 'HAKU Baby | 40 sheets'
  });
  assert.equal(missingSkuResolved.status, 'found');
  assert.equal(missingSkuResolved.identityType, 'catalog_row');
  assert.equal(missingSkuResolved.candidate.productId, 'product-3');
});
