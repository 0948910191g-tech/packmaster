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

test('unique Seller SKU conflicts with a different exact catalog row and stays in Review', () => {
  const sourceData = source('TIKTOK', ['SKU-A', 'SKU-B']);
  sourceData.products[0].productName = sourceData.skuRows[0].productName = 'Exact Product A';
  sourceData.skuRows[0].variantName = 'Five pack';
  sourceData.products[1].productName = sourceData.skuRows[1].productName = 'Exact Product B';
  sourceData.skuRows[1].variantName = 'Ten pack';
  const catalog = identity.buildIndex(
    registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), sourceData), registryApi
  );
  const conflict = identity.resolve(catalog, 'TIKTOK', { text: 'Exact Product B | Ten pack | SKU-A' });
  assert.equal(conflict.status, 'ambiguous');
  assert.equal(conflict.reason, 'seller_sku_catalog_identity_conflict');
  const valid = identity.resolve(catalog, 'TIKTOK', { text: 'Exact Product A | Five pack | SKU-A' });
  assert.equal(valid.status, 'found');
  assert.equal(valid.candidate.productId, 'p0');
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

test('Upsert rejects a persistent Seller SKU identity that moved and preserves the existing assignment', () => {
  const sellerEvidence = (productId, modelId = null, variantName = null) => ({
    status: 'found',
    identityType: 'seller_sku',
    sellerSku: 'SYNTHETIC-SHARED',
    candidate: { platform: 'TIKTOK', productId, modelId, variantName }
  });
  const original = matcher.upsertAssignment(
    matcher.newAssignments(), 'TIKTOK', sellerEvidence('product-a'), 'Synthetic A'
  );
  const originalRaw = structuredClone(original);
  const originalEntry = original.entries[0];

  assert.throws(
    () => matcher.upsertAssignment(original, 'TIKTOK', sellerEvidence('product-b'), 'Synthetic B'),
    /conflict|identity|review.*existing/i,
    'the same persistent Seller SKU key must not be reassigned to another product silently'
  );
  assert.deepEqual(original, originalRaw);
  assert.strictEqual(original.entries[0], originalEntry);

  const renamed = matcher.upsertAssignment(original, 'TIKTOK', sellerEvidence('product-a'), 'Synthetic A renamed');
  assert.equal(renamed.entries.length, 1);
  assert.equal(renamed.entries[0].shortName, 'Synthetic A renamed');
});

test('Upsert rejects changed model or variant identity under the same Seller SKU key', () => {
  const sellerEvidence = (modelId, variantName) => ({
    status: 'found',
    identityType: 'seller_sku',
    sellerSku: 'SYNTHETIC-MODEL-KEY',
    candidate: { platform: 'TIKTOK', productId: 'synthetic-product', modelId, variantName }
  });

  const modelAssignment = matcher.upsertAssignment(
    matcher.newAssignments(), 'TIKTOK', sellerEvidence('model-a', 'Large'), 'Synthetic Model'
  );
  assert.throws(
    () => matcher.upsertAssignment(modelAssignment, 'TIKTOK', sellerEvidence('model-b', 'Large'), 'Changed Model'),
    /conflict|identity|review.*existing/i
  );

  const variantAssignment = matcher.upsertAssignment(
    matcher.newAssignments(), 'TIKTOK', sellerEvidence(null, 'Small'), 'Synthetic Variant'
  );
  assert.throws(
    () => matcher.upsertAssignment(variantAssignment, 'TIKTOK', sellerEvidence(null, 'Medium'), 'Changed Variant'),
    /conflict|identity|review.*existing/i
  );
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

test('Catalog-row assignments keep TikTok variants separate when modelId is unavailable', () => {
  const assignments = matcher.validateAssignments({
    schema: matcher.SCHEMA,
    version: 1,
    entries: [
      {
        platform: 'TIKTOK',
        identityType: 'catalog_row',
        sellerSku: null,
        productId: 'product-shirt',
        modelId: null,
        variantName: 'S',
        shortName: 'เสื้อ S'
      },
      {
        platform: 'TIKTOK',
        identityType: 'catalog_row',
        sellerSku: null,
        productId: 'product-shirt',
        modelId: null,
        variantName: 'M',
        shortName: 'เสื้อ M'
      }
    ]
  });
  assert.equal(assignments.entries.length, 2);
  assert.notEqual(
    matcher.assignmentKey(assignments.entries[0]),
    matcher.assignmentKey(assignments.entries[1])
  );
});

test('Seller SKU assignment with null variantName matches candidate with non-null variantName', () => {
  const store = registryApi.replacePlatformRegistry(
    registryApi.createEmptyStore(),
    {
      schemaVersion: 1,
      registryType: 'marketplace_product_sku_source_registry',
      platform: 'TIKTOK',
      source: { shop: 'test', captureDate: '2026-11-04' },
      products: [{ platform: 'TIKTOK', productId: 'p1', productName: 'Item 1', sellerSku: 'SKU-VAR', variants: [] }],
      skuRows: [{
        platform: 'TIKTOK', productId: 'p1', productName: 'Item 1',
        sellerSku: 'SKU-VAR', sellerSkuStatus: 'present',
        modelId: null, variantName: 'Red 500ml',
        sourceRowType: 'product_sku'
      }],
      productsWithoutAnySellerSku: [],
      pages: [{ products: 1 }],
      summary: {
        listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 1,
        sellerSkuPresentRowCount: 1, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0
      }
    }
  );
  const catalog = identity.buildIndex(store, registryApi);

  // 1. Seller SKU assignment with null variantName matches candidate with variantName 'Red 500ml'
  const assignmentWithNullVariant = matcher.validateAssignments({
    schema: matcher.SCHEMA,
    version: 1,
    entries: [{
      platform: 'TIKTOK',
      identityType: 'seller_sku',
      sellerSku: 'SKU-VAR',
      productId: 'p1',
      modelId: null,
      variantName: null,
      shortName: 'แดง 500'
    }]
  });
  const res1 = matcher.match(catalog, 'TIKTOK', { sellerSku: 'SKU-VAR' }, assignmentWithNullVariant, identity);
  assert.equal(res1.status, 'matched');
  assert.equal(res1.reason, 'registry_exact_verified');
  assert.equal(res1.rule.shortName, 'แดง 500');

  // 2. Seller SKU assignment with specific non-null variantName requires strict match
  const assignmentWithSpecificVariant = matcher.validateAssignments({
    schema: matcher.SCHEMA,
    version: 1,
    entries: [{
      platform: 'TIKTOK',
      identityType: 'seller_sku',
      sellerSku: 'SKU-VAR',
      productId: 'p1',
      modelId: null,
      variantName: 'Blue 500ml',
      shortName: 'น้ำเงิน 500'
    }]
  });
  const res2 = matcher.match(catalog, 'TIKTOK', { sellerSku: 'SKU-VAR' }, assignmentWithSpecificVariant, identity);
  assert.equal(res2.status, 'ambiguous');
  assert.equal(res2.reason, 'registry_identity_changed');

  // 3. Catalog-row assignment with null variantName does not match candidate with 'Red 500ml'
  const catalogRowNullVariant = matcher.validateAssignments({
    schema: matcher.SCHEMA,
    version: 1,
    entries: [{
      platform: 'TIKTOK',
      identityType: 'catalog_row',
      sellerSku: null,
      productId: 'p1',
      modelId: null,
      variantName: null,
      shortName: 'แถวแคตตาล็อก'
    }]
  });
  const res3 = matcher.match(catalog, 'TIKTOK', { catalogText: 'Item 1 Red 500ml' }, catalogRowNullVariant, identity);
  assert.equal(res3.status, 'unmatched');
  assert.equal(res3.reason, 'internal_name_not_assigned');
});

test('saveConfirmedAssignment persists label requested seller SKU when candidate SKU differs', () => {
  const store = registryApi.replacePlatformRegistry(
    registryApi.createEmptyStore(),
    {
      schemaVersion: 1,
      registryType: 'marketplace_product_sku_source_registry',
      platform: 'TIKTOK',
      source: { shop: 'test', captureDate: '2026-11-04' },
      products: [{ platform: 'TIKTOK', productId: 'prod-hoya-5', productName: 'HOYA 5 pack title', sellerSku: 'CATALOG-SKU-ORIGINAL', variants: [] }],
      skuRows: [{
        platform: 'TIKTOK', productId: 'prod-hoya-5', productName: 'HOYA 5 pack title',
        sellerSku: 'CATALOG-SKU-ORIGINAL', sellerSkuStatus: 'present',
        modelId: null, variantName: null, sourceRowType: 'product_sku'
      }],
      productsWithoutAnySellerSku: [],
      pages: [{ products: 1 }],
      summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 1, sellerSkuPresentRowCount: 1, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
    }
  );
  const catalog = identity.buildIndex(store, registryApi);

  // Label has modified sellerSku but resolves via title
  const labelItem = {
    qty: 1,
    sellerSku: 'MODIFIED-LABEL-SKU-5PK',
    text: 'HOYA 5 pack title | 1 | MODIFIED-LABEL-SKU-5PK'
  };
  const resolved = identity.resolve(catalog, 'TIKTOK', labelItem);
  const canonical = matcher.canonicalEvidence(catalog, 'TIKTOK', resolved);
  const saved = matcher.saveConfirmedAssignment(matcher.newAssignments(), catalog, 'TIKTOK', canonical, 'HOYA ฟ้า 5 ห่อ');

  // Verify both canonical SKU and modified label SKU are saved
  assert.ok(saved.entries.some(e => e.sellerSku === 'CATALOG-SKU-ORIGINAL' && e.shortName === 'HOYA ฟ้า 5 ห่อ'));
  assert.ok(saved.entries.some(e => e.sellerSku === 'MODIFIED-LABEL-SKU-5PK' && e.shortName === 'HOYA ฟ้า 5 ห่อ'));

  // Subsequent item with only the modified SKU matches automatically
  const subsequent = matcher.match(catalog, 'TIKTOK', { sellerSku: 'MODIFIED-LABEL-SKU-5PK' }, saved, identity);
  assert.equal(subsequent.status, 'matched');
  assert.equal(subsequent.reason, 'registry_exact_verified');
  assert.equal(subsequent.rule.shortName, 'HOYA ฟ้า 5 ห่อ');
});

test('saveConfirmedAssignment binds unfound seller SKU by matching existing unambiguous shortName', () => {
  const store = registryApi.replacePlatformRegistry(
    registryApi.createEmptyStore(),
    {
      schemaVersion: 1,
      registryType: 'marketplace_product_sku_source_registry',
      platform: 'TIKTOK',
      source: { shop: 'test', captureDate: '2026-11-04' },
      products: [{ platform: 'TIKTOK', productId: 'prod-purple', productName: 'HOYA Purple', sellerSku: 'HOYA-PURPLE-EXISTING', variants: [] }],
      skuRows: [{
        platform: 'TIKTOK', productId: 'prod-purple', productName: 'HOYA Purple',
        sellerSku: 'HOYA-PURPLE-EXISTING', sellerSkuStatus: 'present',
        modelId: null, variantName: null, sourceRowType: 'product_sku'
      }],
      productsWithoutAnySellerSku: [],
      pages: [{ products: 1 }],
      summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 1, sellerSkuPresentRowCount: 1, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
    }
  );
  const catalog = identity.buildIndex(store, registryApi);

  const initialAssignments = matcher.validateAssignments({
    schema: matcher.SCHEMA,
    version: 1,
    entries: [{
      platform: 'TIKTOK',
      identityType: 'seller_sku',
      sellerSku: 'HOYA-PURPLE-EXISTING',
      productId: 'prod-purple',
      modelId: null,
      variantName: null,
      shortName: 'ม่วง5'
    }]
  });

  const unfoundItem = {
    qty: 1,
    sellerSku: 'HOYA-PURPLE-BRAND-NEW',
    text: 'Some Unmatched Title | New Variant | HOYA-PURPLE-BRAND-NEW'
  };
  const unfoundEv = identity.resolve(catalog, 'TIKTOK', unfoundItem);
  assert.equal(unfoundEv.status, 'not_found');

  const saved = matcher.saveConfirmedAssignment(initialAssignments, catalog, 'TIKTOK', unfoundEv, 'ม่วง5');
  const subsequent = matcher.match(catalog, 'TIKTOK', unfoundItem, saved, identity);
  assert.equal(subsequent.status, 'matched');
  assert.equal(subsequent.reason, 'registry_exact_verified');
  assert.equal(subsequent.rule.shortName, 'ม่วง5');
});

test('saveConfirmedAssignment throws when evidence.status !== found and shortName is shared across multiple distinct productIds', () => {
  const store = registryApi.replacePlatformRegistry(
    registryApi.createEmptyStore(),
    {
      schemaVersion: 1,
      registryType: 'marketplace_product_sku_source_registry',
      platform: 'SHOPEE',
      source: { shop: 'test', captureDate: '2026-11-04' },
      products: [
        { platform: 'SHOPEE', itemId: 'prod-adult', title: 'Adult wipes', sellerSku: 'ADULT-1', variants: [] },
        { platform: 'SHOPEE', itemId: 'prod-baby', title: 'Baby wipes', sellerSku: 'BABY-1', variants: [] }
      ],
      skuRows: [
        { platform: 'SHOPEE', itemId: 'prod-adult', title: 'Adult wipes', sellerSku: 'ADULT-1', sellerSkuStatus: 'present', modelId: 'm1', variantName: null, sourceRowType: 'variant' },
        { platform: 'SHOPEE', itemId: 'prod-baby', title: 'Baby wipes', sellerSku: 'BABY-1', sellerSkuStatus: 'present', modelId: 'm2', variantName: null, sourceRowType: 'variant' }
      ],
      productsWithoutAnySellerSku: [],
      pages: [{ products: 2 }],
      summary: { listedProductCount: 2, uniqueProductIdCount: 2, skuModelRowCount: 2, sellerSkuPresentRowCount: 2, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
    }
  );
  const catalog = identity.buildIndex(store, registryApi);

  // Initial assignments have two different products sharing the same shortName 'ผู้ใหญ่6'
  const ambiguousAssignments = matcher.validateAssignments({
    schema: matcher.SCHEMA,
    version: 1,
    entries: [
      { platform: 'SHOPEE', identityType: 'catalog_row', sellerSku: null, productId: 'prod-adult', modelId: 'm1', variantName: null, shortName: 'ผู้ใหญ่6' },
      { platform: 'SHOPEE', identityType: 'catalog_row', sellerSku: null, productId: 'prod-baby', modelId: 'm2', variantName: null, shortName: 'ผู้ใหญ่6' }
    ]
  });

  const unfoundEv = {
    status: 'not_found',
    reason: 'seller_sku_not_found',
    identityType: 'seller_sku',
    sellerSku: 'AMBIGUOUS-NEW-SKU'
  };

  assert.throws(() => {
    matcher.saveConfirmedAssignment(ambiguousAssignments, catalog, 'SHOPEE', unfoundEv, 'ผู้ใหญ่6');
  }, /Confirmed registry assignment requires productId|An exact unique registry identity/);
});

test('explicit local SKU alias pairs persist and resolve only while selected registry row remains unique', () => {
  const sourceData = source('TIKTOK', ['HOYA Value Pack 5', 'HOYA Value Pack 5']);
  sourceData.products[0].productId = 'listing-wholesale'; sourceData.skuRows[0].productId = 'listing-wholesale';
  sourceData.products[0].productName = sourceData.skuRows[0].productName = 'HOYA Baby Wipes Wholesale';
  sourceData.skuRows[0].variantName = '50 ห่อ';
  sourceData.products[1].productId = 'listing-5-pack'; sourceData.skuRows[1].productId = 'listing-5-pack';
  sourceData.products[1].productName = sourceData.skuRows[1].productName = 'HOYA Baby Wipes Value Pack';
  sourceData.skuRows[1].modelId = 'model-5-pack';
  sourceData.skuRows[1].variantName = '5 ห่อ 400 แผ่น';
  const store = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), sourceData);
  const catalog = identity.buildIndex(store, registryApi);
  const pdfItem = { text: 'HOYA Baby Wipes Value Pack | 5 ห่อ 400 แผ่น | 5 ห่อ HOYA Baby Wipes Value Pack', sellerSku: '5 ห่อ HOYA Baby Wipes Value Pack' };
  const pdfItemSecondSku = { text: 'HOYA Baby Wipes Value Pack | 5 ห่อ 400 แผ่น | HOYA Baby Wipes Value Pack 5 ห่อ', sellerSku: 'HOYA Baby Wipes Value Pack 5 ห่อ' };
  const sameSkuOtherTitle = { text: 'HOYA Baby Wipes Wholesale | 50 ห่อ | 5 ห่อ HOYA Baby Wipes Value Pack', sellerSku: '5 ห่อ HOYA Baby Wipes Value Pack' };
  const thirdItem = { text: 'HOYA Baby Wipes Value Pack | 10 ห่อ 800 แผ่น | 5 ห่อ HOYA Baby Wipes Value Pack', sellerSku: '5 ห่อ HOYA Baby Wipes Value Pack' };
  const selected = { platform: 'TIKTOK', productId: 'listing-5-pack', productName: 'HOYA Baby Wipes Value Pack', modelId: 'model-5-pack', variantName: '5 ห่อ 400 แผ่น' };

  assert.equal(identity.resolve(catalog, 'TIKTOK', pdfItem).reason, 'exact_title_fallback');
  assert.throws(() => matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', pdfItem,
    { ...selected, productName: 'Different product title' }, 'Unsafe', identity), /title conflicts/i);
  const first = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', pdfItem, selected, 'HOYA Value 5', identity);
  assert.equal(matcher.match(catalog, 'TIKTOK', pdfItem, first, identity).status, 'matched');
  assert.equal(matcher.match(catalog, 'TIKTOK', sameSkuOtherTitle, first, identity).status, 'unmatched');
  assert.equal(matcher.match(catalog, 'TIKTOK', thirdItem, first, identity).status, 'unmatched');
  const second = matcher.upsertManualSkuAlias(first, catalog, 'TIKTOK', pdfItemSecondSku, selected, 'HOYA Value 5', identity);
  assert.equal(second.entries[0].manualSkuAliases.length, 2, 'a second exact PDF SKU preserves the first alias pair');
  assert.equal(matcher.match(catalog, 'TIKTOK', pdfItemSecondSku, second, identity).rule.shortName, 'HOYA Value 5');
  assert.equal(matcher.match(catalog, 'TIKTOK', { ...pdfItem, orderOnlyName: 'Order label' }, second, identity).rule.shortName, 'HOYA Value 5');

  const otherSelected = { platform: 'TIKTOK', productId: 'listing-wholesale', productName: 'HOYA Baby Wipes Wholesale', modelId: null, variantName: '50 ห่อ' };
  const otherPair = matcher.upsertManualSkuAlias(second, catalog, 'TIKTOK', sameSkuOtherTitle, otherSelected, 'HOYA Wholesale', identity);
  assert.equal(otherPair.entries.length, 2, 'same explicit SKU can be paired to another exact title as a separate identity');
  assert.equal(matcher.match(catalog, 'TIKTOK', sameSkuOtherTitle, otherPair, identity).rule.shortName, 'HOYA Wholesale');

  const storage = new Map([[matcher.LOCAL_ASSIGNMENTS_KEY, JSON.stringify(otherPair)]]);
  const reloaded = matcher.loadLocalAssignments({ getItem: key => storage.get(key) ?? null });
  assert.equal(matcher.match(catalog, 'TIKTOK', pdfItem, reloaded, identity).rule.shortName, 'HOYA Value 5');
  assert.equal(matcher.match(catalog, 'TIKTOK', pdfItemSecondSku, reloaded, identity).rule.shortName, 'HOYA Value 5');
  assert.equal(matcher.match(catalog, 'TIKTOK', sameSkuOtherTitle, reloaded, identity).rule.shortName, 'HOYA Wholesale');
  const renamed = matcher.upsertAssignment(reloaded, 'TIKTOK', {
    status: 'found', identityType: 'catalog_row', sellerSku: null,
    candidate: { platform: 'TIKTOK', productId: 'listing-5-pack', modelId: 'model-5-pack', variantName: '5 ห่อ 400 แผ่น' }
  }, 'HOYA Value Five');
  const reloadedAfterRename = matcher.validateAssignments(JSON.parse(JSON.stringify(renamed)));
  assert.equal(reloadedAfterRename.entries.find(entry => entry.productId === 'listing-5-pack').manualSkuAliases.length, 2);
  assert.equal(matcher.match(catalog, 'TIKTOK', pdfItem, reloadedAfterRename, identity).rule.shortName, 'HOYA Value Five');
  assert.equal(matcher.match(catalog, 'TIKTOK', pdfItemSecondSku, reloadedAfterRename, identity).rule.shortName, 'HOYA Value Five');

  const changed = identity.buildIndex(registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), source('TIKTOK', ['HOYA Value Pack 5'])), registryApi);
  assert.equal(matcher.match(changed, 'TIKTOK', pdfItem, reloaded, identity).status, 'ambiguous');
  assert.equal(matcher.match(changed, 'TIKTOK', pdfItem, reloaded, identity).reason, 'registry_identity_changed');
  const variantChangedStore = structuredClone(store);
  variantChangedStore.platforms.TIKTOK.skuRows.find(row => row.productId === 'listing-5-pack').variantName = '3 ห่อ 240 แผ่น';
  const variantChanged = identity.buildIndex(variantChangedStore, registryApi);
  assert.equal(matcher.match(variantChanged, 'TIKTOK', pdfItem, reloaded, identity).reason, 'registry_identity_changed',
    'a stable model/listing ID does not mask a changed variant');
  const titleChangedStore = structuredClone(store);
  titleChangedStore.platforms.TIKTOK.skuRows.find(row => row.productId === 'listing-5-pack').productName = 'HOYA Baby Wipes New Listing';
  const titleChanged = identity.buildIndex(titleChangedStore, registryApi);
  assert.equal(matcher.match(titleChanged, 'TIKTOK', pdfItem, reloaded, identity).reason, 'registry_identity_changed',
    'a stable listing ID does not mask a changed registry product title');
});

test('manual SKU alias pair preserves numeric token boundaries and legacy v1 assignments stay readable', () => {
  const catalog = index();
  const selected = { platform: 'TIKTOK', productId: 'p0', modelId: null, variantName: null };
  const spaced = { text: 'HOYA Value 1 2 | 5 ห่อ | SYNTHETIC-ALIAS', sellerSku: 'SYNTHETIC-ALIAS' };
  const joined = { text: 'HOYA Value 12 | 5 ห่อ | SYNTHETIC-ALIAS', sellerSku: 'SYNTHETIC-ALIAS' };
  // Catalog text is intentionally absent from this registry; selection is explicit and aliases remain exact pairs.
  const first = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', spaced, selected, 'Synthetic value', identity);
  assert.equal(matcher.match(catalog, 'TIKTOK', joined, first, identity).status, 'unmatched');
  assert.equal(first.version, 2);
  assert.throws(() => matcher.validateAssignments({ ...first, entries: [{ ...first.entries[0], manualSkuAliases: 'corrupt' }] }), /alias metadata/i);
  assert.throws(() => matcher.validateAssignments({ ...first, entries: [{ ...first.entries[0], manualSkuAliases: [{ sellerSku: 'X', productText: 'Y', variantText: '', fuzzy: true }] }] }), /alias pair metadata/i);
  assert.throws(() => matcher.validateAssignments({ ...first, entries: [{ ...first.entries[0], manualSkuUnexpected: true }] }), /alias metadata/i);
  const corruptRaw = JSON.stringify({ ...first, entries: [{ ...first.entries[0], manualSkuAliases: 'damaged' }] });
  const corruptStorage = { raw: corruptRaw, getItem() { return this.raw; }, setItem(_key, value) { this.raw = value; } };
  assert.throws(() => matcher.loadLocalAssignments(corruptStorage), /alias metadata/i);
  assert.equal(corruptStorage.raw, corruptRaw, 'loading malformed v2 aliases must not rewrite the original value');
  assert.throws(() => matcher.saveLocalAssignments(corruptStorage, { ...first, entries: [{ ...first.entries[0], manualSkuAliases: 'damaged' }] }), /alias metadata/i);
  assert.equal(corruptStorage.raw, corruptRaw, 'a rejected save preserves the existing assignment text');
  const legacy = matcher.newAssignments();
  assert.equal(matcher.validateAssignments(legacy).version, 1);
});

test('manual alias refuses conflicts, duplicates, unknown variants, exact SKUs and unsafe assignment schemas', () => {
  const sourceData = source('TIKTOK', ['SHARED', 'SHARED']);
  sourceData.products[0].productId = 'listing-a'; sourceData.skuRows[0].productId = 'listing-a';
  sourceData.products[1].productId = 'listing-b'; sourceData.skuRows[1].productId = 'listing-b';
  const catalog = identity.buildIndex(registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), sourceData), registryApi);
  const selected = { platform: 'TIKTOK', productId: 'listing-a', modelId: null, variantName: null };
  const knownSkuItem = { text: 'Marketplace title 0 | Variant 0 | SHARED', sellerSku: 'SHARED' };
  assert.throws(() => matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', knownSkuItem, selected, 'Unsafe', identity), /already exists|known Seller SKU/i);
  const unknownItem = { text: 'Marketplace title 0 | Variant 0 | UNKNOWN', sellerSku: 'UNKNOWN' };
  assert.throws(() => matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', unknownItem, { ...selected, productId: 'missing' }, 'Unsafe', identity), /current registry|unique/i);
  const one = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', unknownItem, selected, 'Name A', identity);
  assert.throws(() => matcher.upsertManualSkuAlias(one, catalog, 'TIKTOK', unknownItem, { ...selected, productId: 'listing-b' }, 'Name B', identity), /different registry row|already assigned/i);
  assert.throws(() => matcher.validateAssignments({ ...one, version: 99 }), /Invalid registry SKU assignments/);

  const moved = identity.buildIndex(registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), source('TIKTOK', ['OTHER'])), registryApi);
  const matched = matcher.match(moved, 'TIKTOK', unknownItem, one, identity);
  assert.equal(matched.status, 'ambiguous');
  assert.equal(matched.reason, 'registry_identity_changed');
});
