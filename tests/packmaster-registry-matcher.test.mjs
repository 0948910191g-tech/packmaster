import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');

function source(platform, skuRows) {
  const isTikTok = platform === 'TIKTOK';
  const idField = isTikTok ? 'productId' : 'itemId';
  const nameField = isTikTok ? 'productName' : 'title';
  const products = skuRows.map((sku, i) => ({
    platform, [idField]: 'p' + i, [nameField]: 'Marketplace title ' + i,
    sellerSku: sku, variants: []
  }));
  const rows = skuRows.map((sellerSku, i) => ({
    platform, [idField]: 'p' + i, [nameField]: 'Marketplace title ' + i,
    sellerSku, sellerSkuStatus: sellerSku ? 'present' : 'not_displayed',
    modelId: isTikTok ? null : 'm' + i,
    sourceRowType: isTikTok ? 'product_sku' : 'variant'
  }));
  return {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry',
    platform, source: { shop: 'test', captureDate: '2026-11-04' },
    products, skuRows: rows,
    productsWithoutAnySellerSku: products.filter(p => !p.sellerSku).map(p => ({ [idField]: p[idField] })),
    pages: [{ products: products.length }],
    summary: {
      listedProductCount: products.length, uniqueProductIdCount: products.length,
      skuModelRowCount: rows.length, sellerSkuPresentRowCount: skuRows.filter(Boolean).length,
      sellerSkuMissingInRowsCount: skuRows.filter(s => !s).length,
      productsWithoutAnySellerSkuCount: skuRows.filter(s => !s).length
    }
  };
}
function index() {
  let store = registryApi.createEmptyStore();
  store = registryApi.replacePlatformRegistry(store, source('TIKTOK', ['SKU-1', 'DUP', 'DUP', null]));
  store = registryApi.replacePlatformRegistry(store, source('SHOPEE', ['SKU-1', 'SHOPEE-2', null]));
  return identity.buildIndex(store, registryApi);
}

test('Only unique exact Seller SKU with an approved internal name is pack-ready', () => {
  const catalog = index();
  const product = { text: 'Marketplace title | Variant | SKU-1', qty: 2 };
  assert.equal(matcher.match(catalog, 'TIKTOK', product, matcher.newAssignments(), identity).status, 'unmatched');
  const evidence = identity.resolve(catalog, 'TIKTOK', product);
  const assigned = matcher.upsertAssignment(matcher.newAssignments(), 'TIKTOK', evidence, 'คลัง A 5 ห่อ');
  const actual = matcher.match(catalog, 'TIKTOK', product, assigned, identity);
  assert.equal(actual.status, 'matched');
  assert.equal(actual.reason, 'registry_exact_verified');
  assert.equal(actual.rule.shortName, 'คลัง A 5 ห่อ');
  assert.equal(actual.rule.keyword, 'SKU-1');
  assert.equal(matcher.match(catalog, 'SHOPEE', {sellerSku:'SKU-1'}, assigned, identity).status, 'unmatched');
  const shopee = matcher.upsertAssignment(assigned, 'SHOPEE',
    identity.resolve(catalog, 'SHOPEE', { sellerSku: 'SKU-1' }), 'คลัง B 1 ชิ้น');
  assert.equal(matcher.match(catalog, 'SHOPEE', { sellerSku: 'sku-1' }, shopee, identity).rule.shortName, 'คลัง B 1 ชิ้น');
  assert.equal(shopee.entries.length, 2);
});

test('Duplicate, incomplete and non-explicit identity never fall back to keyword titles', () => {
  const catalog = index();
  const assignments = matcher.newAssignments();
  assert.equal(matcher.match(catalog, 'TIKTOK', {text:'Title | V | DUP'}, assignments, identity).status, 'ambiguous');
  assert.equal(matcher.match(catalog, 'TIKTOK', {text:'Marketplace title SKU-1'}, assignments, identity).status, 'unmatched');
  assert.equal(matcher.match(catalog, 'SHOPEE', {text:'Shopee product title | Variant | SKU-1'}, assignments, identity).status, 'unmatched');
  assert.equal(matcher.match(catalog, 'TIKTOK', {text:'A | V | NOT-FOUND'}, assignments, identity).status, 'unmatched');
  assert.equal(matcher.match(catalog, 'TIKTOK', {text:'A | V | DUP'}, assignments, identity).reason, 'duplicate_seller_sku');
  assert.throws(() => matcher.upsertAssignment(assignments, 'TIKTOK',
    identity.resolve(catalog, 'TIKTOK', {text:'A | V | DUP'}), 'Unsafe'), /exact unique/);
});

test('Assignment becomes invalid when marketplace SKU identity moves to another listing', () => {
  const cat = index();
  const evidence = identity.resolve(cat, 'TIKTOK', {sellerSku:'SKU-1'});
  const assigned = matcher.upsertAssignment(matcher.newAssignments(), 'TIKTOK', evidence, 'Warehouse A');
  const changed = identity.buildIndex(registryApi.replacePlatformRegistry(
    registryApi.createEmptyStore(), source('TIKTOK', ['UNRELATED', 'SKU-1'])
  ), registryApi);
  assert.equal(matcher.match(changed, 'TIKTOK', {sellerSku:'SKU-1'}, assigned, identity).status, 'ambiguous');
  assert.equal(matcher.match(changed, 'TIKTOK', {sellerSku:'SKU-1'}, assigned, identity).reason, 'registry_identity_changed');
});

test('Reject malformed, duplicate, empty or cross-platform assignments', () => {
  const cat = index();
  const evidence = identity.resolve(cat, 'TIKTOK', {sellerSku:'SKU-1'});
  const first = matcher.upsertAssignment(matcher.newAssignments(), 'TIKTOK', evidence, 'Warehouse A');
  assert.equal(matcher.upsertAssignment(first,'TIKTOK',evidence,'Warehouse B').entries.length,1);
  assert.throws(() => matcher.validateAssignments({...first,entries:[...first.entries,...first.entries]}),/Duplicate/);
  assert.throws(() => matcher.validateAssignments({...first,entries:[{...first.entries[0],shortName:''}]}),/Invalid/);
  assert.throws(() => matcher.makeAssignment('SHOPEE',evidence,'test-invalid-no-id'),/./);
});

test('Exact unique Shopee catalog row can use a catalog-row internal-name assignment', () => {
  const sourceData = source('SHOPEE', [null, null]);
  sourceData.products[0].title = 'HOYA Baby 3 ห่อ';
  sourceData.skuRows[0].title = 'HOYA Baby 3 ห่อ';
  sourceData.products[1].title = 'Other listing';
  sourceData.skuRows[1].title = 'Other listing';

  const store = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), sourceData);
  const catalogIndex = identity.buildIndex(store, registryApi);
  const evidence = identity.resolve(catalogIndex, 'SHOPEE', { text: 'HOYA  Baby 3 ห่อ' });
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.identityType, 'catalog_row');

  const assigned = matcher.upsertAssignment(
    matcher.newAssignments(), 'SHOPEE', evidence, 'เด้งม่วง3'
  );
  assert.equal(assigned.entries[0].sellerSku, null);
  assert.equal(assigned.entries[0].identityType, 'catalog_row');

  const actual = matcher.match(
    catalogIndex, 'SHOPEE', { text: 'HOYA Baby 3 ห่อ' }, assigned, identity
  );
  assert.equal(actual.status, 'matched');
  assert.equal(actual.reason, 'registry_catalog_exact_verified');
  assert.equal(actual.rule.shortName, 'เด้งม่วง3');
});
