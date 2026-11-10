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

test('Ticket 02: exact title fallback for unmatched seller SKU resolves 1:1 and fails closed on multi-variant or duplicate titles', () => {
  // Construct a registry with:
  // 1. Single-variant product with unique seller SKU (product-1)
  // 2. Single-variant product with duplicated seller SKU (product-2, product-3)
  // 3. Multi-variant product with variants (product-4 has 2 variants: Red and Blue)
  // 4. Duplicate product titles across two different products (product-5 and product-6 share the same title)
  const source = {
    schemaVersion: 1,
    registryType: 'marketplace_product_sku_source_registry',
    platform: 'TIKTOK',
    source: { shop: 'test-shop', captureDate: '2026-10-21' },
    products: [
      { platform: 'TIKTOK', productId: 'product-1', productName: 'HOYA Single Unique', sellerSku: 'UNIQUE-SKU-1', variants: [] },
      { platform: 'TIKTOK', productId: 'product-2', productName: 'HOYA Dup SKU Alpha', sellerSku: 'SHARED-SKU', variants: [] },
      { platform: 'TIKTOK', productId: 'product-3', productName: 'HOYA Dup SKU Beta', sellerSku: 'SHARED-SKU', variants: [] },
      { platform: 'TIKTOK', productId: 'product-4', productName: 'HOYA Multi Variant', sellerSku: null, variants: [{ variantName: 'Red', sellerSku: 'MV-RED' }, { variantName: 'Blue', sellerSku: 'MV-BLUE' }] },
      { platform: 'TIKTOK', productId: 'product-5', productName: 'Duplicate Product Title', sellerSku: 'TITLE-A', variants: [] },
      { platform: 'TIKTOK', productId: 'product-6', productName: 'Duplicate Product Title', sellerSku: 'TITLE-B', variants: [] }
    ],
    skuRows: [
      { platform: 'TIKTOK', productId: 'product-1', productName: 'HOYA Single Unique', sellerSku: 'UNIQUE-SKU-1', modelId: null, variantName: null, sourceRowType: 'product_sku', sellerSkuStatus: 'present' },
      { platform: 'TIKTOK', productId: 'product-2', productName: 'HOYA Dup SKU Alpha', sellerSku: 'SHARED-SKU', modelId: null, variantName: null, sourceRowType: 'product_sku', sellerSkuStatus: 'present' },
      { platform: 'TIKTOK', productId: 'product-3', productName: 'HOYA Dup SKU Beta', sellerSku: 'SHARED-SKU', modelId: null, variantName: null, sourceRowType: 'product_sku', sellerSkuStatus: 'present' },
      { platform: 'TIKTOK', productId: 'product-4', productName: 'HOYA Multi Variant', sellerSku: 'MV-RED', modelId: null, variantName: 'Red', variantOrdinal: 1, sourceRowType: 'variant', sellerSkuStatus: 'present' },
      { platform: 'TIKTOK', productId: 'product-4', productName: 'HOYA Multi Variant', sellerSku: 'MV-BLUE', modelId: null, variantName: 'Blue', variantOrdinal: 2, sourceRowType: 'variant', sellerSkuStatus: 'present' },
      { platform: 'TIKTOK', productId: 'product-5', productName: 'Duplicate Product Title', sellerSku: 'TITLE-A', modelId: null, variantName: null, sourceRowType: 'product_sku', sellerSkuStatus: 'present' },
      { platform: 'TIKTOK', productId: 'product-6', productName: 'Duplicate Product Title', sellerSku: 'TITLE-B', modelId: null, variantName: null, sourceRowType: 'product_sku', sellerSkuStatus: 'present' }
    ],
    productsWithoutAnySellerSku: [],
    summary: {
      listedProductCount: 6,
      uniqueProductIdCount: 6,
      skuModelRowCount: 7,
      sellerSkuPresentRowCount: 7,
      sellerSkuMissingInRowsCount: 0,
      productsWithoutAnySellerSkuCount: 0
    },
    pages: [{ page: 1, products: 6 }]
  };

  const store = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), source);
  const index = identity.buildIndex(store, registryApi);

  // 1. Unique 1:1 title fallback returns catalog_row identity
  const uniqueFallback = identity.resolve(index, 'TIKTOK', {
    text: 'HOYA Single Unique | Default | MODIFIED-LABEL-SKU-999',
    sellerSku: 'MODIFIED-LABEL-SKU-999'
  });
  assert.equal(uniqueFallback.status, 'found');
  assert.equal(uniqueFallback.identityType, 'catalog_row');
  assert.equal(uniqueFallback.sellerSku, 'MODIFIED-LABEL-SKU-999');
  assert.equal(uniqueFallback.candidate.productId, 'product-1');
  assert.equal(uniqueFallback.candidate.sellerSku, 'UNIQUE-SKU-1');
  assert.equal(uniqueFallback.reason, 'exact_title_fallback');

  // 1b. Unique 1:1 title fallback when candidate has non-unique seller SKU
  const catalogRowFallback = identity.resolve(index, 'TIKTOK', {
    text: 'HOYA Dup SKU Alpha | Default | MODIFIED-LABEL-SKU-888',
    sellerSku: 'MODIFIED-LABEL-SKU-888'
  });
  assert.equal(catalogRowFallback.status, 'found');
  assert.equal(catalogRowFallback.identityType, 'catalog_row');
  assert.equal(catalogRowFallback.sellerSku, 'MODIFIED-LABEL-SKU-888');
  assert.equal(catalogRowFallback.candidate.productId, 'product-2');
  assert.equal(catalogRowFallback.reason, 'exact_title_fallback');

  // 1c. Unique title fallback works with explicit productName property cross-platform
  const explicitPropFallback = identity.resolve(index, 'TIKTOK', {
    productName: 'HOYA Single Unique',
    sellerSku: 'MODIFIED-LABEL-SKU-777'
  });
  assert.equal(explicitPropFallback.status, 'found');
  assert.equal(explicitPropFallback.identityType, 'catalog_row');
  assert.equal(explicitPropFallback.candidate.productId, 'product-1');
  assert.equal(explicitPropFallback.reason, 'exact_title_fallback');

  // 1d. Cross-platform: Shopee with structured productName also falls back safely
  const shopeeSource = {
    ...source,
    platform: 'SHOPEE',
    products: source.products.map(p => ({ ...p, platform: 'SHOPEE', itemId: p.productId, title: p.productName })),
    skuRows: source.skuRows.map((r, i) => ({ ...r, platform: 'SHOPEE', itemId: r.productId, title: r.productName, modelId: 'model-' + (i + 1), sourceRowType: 'variant' }))
  };
  const shopeeStore = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), shopeeSource);
  const shopeeIndex = identity.buildIndex(shopeeStore, registryApi);
  const shopeeStructuredFallback = identity.resolve(shopeeIndex, 'SHOPEE', {
    productName: 'HOYA Single Unique',
    sellerSku: 'UNMATCHED-SHOPEE-SKU'
  });
  assert.equal(shopeeStructuredFallback.status, 'found');
  assert.equal(shopeeStructuredFallback.identityType, 'catalog_row');
  assert.equal(shopeeStructuredFallback.candidate.productId, 'product-1');
  assert.equal(shopeeStructuredFallback.reason, 'exact_title_fallback');

  // Un-piped plain text on Shopee must NOT trigger title fallback and must fail closed
  const shopeePlainTextFailClosed = identity.resolve(shopeeIndex, 'SHOPEE', {
    sellerSku: 'UNMATCHED-SHOPEE-SKU',
    text: 'HOYA Single Unique'
  });
  assert.equal(shopeePlainTextFailClosed.status, 'not_found');
  assert.equal(shopeePlainTextFailClosed.reason, 'seller_sku_not_found');

  // 2. Multi-variant product safety gate: must fail closed and never guess among variants
  const multiVariantFailClosed = identity.resolve(index, 'TIKTOK', {
    text: 'HOYA Multi Variant | Unknown Variant | UNKNOWN-MODIFIED-SKU',
    sellerSku: 'UNKNOWN-MODIFIED-SKU'
  });
  assert.equal(multiVariantFailClosed.status, 'not_found');
  assert.equal(multiVariantFailClosed.reason, 'seller_sku_not_found');
  assert.equal(multiVariantFailClosed.sellerSku, 'UNKNOWN-MODIFIED-SKU');

  // 3. Duplicate product title safety gate: must fail closed and never guess between products
  const duplicateTitleFailClosed = identity.resolve(index, 'TIKTOK', {
    text: 'Duplicate Product Title | Default | UNKNOWN-MODIFIED-SKU',
    sellerSku: 'UNKNOWN-MODIFIED-SKU'
  });
  assert.equal(duplicateTitleFailClosed.status, 'not_found');
  assert.equal(duplicateTitleFailClosed.reason, 'seller_sku_not_found');
  assert.equal(duplicateTitleFailClosed.sellerSku, 'UNKNOWN-MODIFIED-SKU');

  // 4. Unknown title: must fail closed
  const unknownTitleFailClosed = identity.resolve(index, 'TIKTOK', {
    text: 'Completely Nonexistent Product | Default | UNKNOWN-MODIFIED-SKU',
    sellerSku: 'UNKNOWN-MODIFIED-SKU'
  });
  assert.equal(unknownTitleFailClosed.status, 'not_found');
  assert.equal(unknownTitleFailClosed.reason, 'seller_sku_not_found');
});

test('Ticket 02: real PDF batch fixture items (pages 14, 17, 20) resolve to HOYA Value Pack 5', () => {
  const bootstrap = require('../packmaster-local-registry-bootstrap.js');
  const matcher = require('../packmaster-registry-matcher.js');
  const rawRegistry = require('../data/packmaster-marketplace-registry.json');
  const rawAssignments = require('../data/packmaster-registry-assignments.json');

  const mergedRegistry = bootstrap.mergeRegistryBaseline(registryApi.createEmptyStore(), rawRegistry, registryApi);
  const mergedAssignments = bootstrap.mergeAssignmentBaseline(matcher.newAssignments(), rawAssignments, matcher);
  const completeAssignments = bootstrap.ensureRegistryAssignments(mergedRegistry, mergedAssignments, registryApi, matcher, identity);
  const index = identity.buildIndex(mergedRegistry, registryApi);
  const prepared = matcher.prepareAssignments(completeAssignments);

  const pdfFixtures = [
    {
      page: 14,
      qty: 1,
      sellerSku: '5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น',
      text: '( ราคาส่ง )HOYA Baby Wipes Value Pack 5 ห่อ (400 แผ่น ) ทิชชู่เปียกเด็ก สูตรน้ำบริสุทธิ์ 99.9% ไม่มีแอลกอฮอล์ ไม่มีน้ำหอม | 5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น | 5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น'
    },
    {
      page: 17,
      qty: 1,
      sellerSku: '5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น',
      text: '( ราคาส่ง )HOYA Baby Wipes Value Pack 5 ห่อ (400 แผ่น ) ทิชชู่เปียกเด็ก สูตรน้ำบริสุทธิ์ 99.9% ไม่มีแอลกอฮอล์ ไม่มีน้ำหอม | 5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น | 5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น'
    },
    {
      page: 20,
      qty: 2,
      sellerSku: '5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น',
      text: '( ราคาส่ง )HOYA Baby Wipes Value Pack 5 ห่อ (400 แผ่น ) ทิชชู่เปียกเด็ก สูตรน้ำบริสุทธิ์ 99.9% ไม่มีแอลกอฮอล์ ไม่มีน้ำหอม | 5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น | 5 ห่อ HOYA Baby Wipes Value Pack 400 แผ่น'
    }
  ];

  for (const item of pdfFixtures) {
    const evidence = identity.resolve(index, 'TIKTOK', item);
    assert.equal(evidence.status, 'found', `p${item.page} status must be found`);
    assert.equal(evidence.candidate.productId, '1736126922142418758');
    assert.equal(evidence.reason, 'exact_title_fallback');
    assert.equal(evidence.sellerSku, item.sellerSku);

    const matchResult = matcher.match(index, 'TIKTOK', item, completeAssignments, identity, prepared);
    assert.equal(matchResult.status, 'matched', `p${item.page} match status must be matched`);
    assert.equal(matchResult.rule?.shortName, 'HOYA Value Pack 5');
    assert.ok(
      matchResult.reason === 'registry_exact_verified' || matchResult.reason === 'registry_catalog_exact_verified',
      `p${item.page} match reason must be verified`
    );
  }
});
