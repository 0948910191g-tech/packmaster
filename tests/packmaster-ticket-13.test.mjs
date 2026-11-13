import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const registryApi = require('../packmaster-marketplace-registry.js');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function createTestRegistry(platform, products) {
  const isShopee = platform === 'SHOPEE';
  const skuRows = products.flatMap(p => {
    const id = p.productId || p.itemId;
    const name = p.productName || p.title;
    if (!p.variants || !p.variants.length) {
      return [{
        platform,
        productId: isShopee ? undefined : id,
        itemId: isShopee ? id : undefined,
        productName: isShopee ? undefined : name,
        title: isShopee ? name : undefined,
        sellerSku: p.sellerSku || null,
        sellerSkuStatus: p.sellerSku ? 'present' : 'not_displayed',
        modelId: null, variantName: null, sourceRowType: isShopee ? 'item' : 'product_sku'
      }];
    }
    return p.variants.map((v, i) => ({
      platform,
      productId: isShopee ? undefined : id,
      itemId: isShopee ? id : undefined,
      productName: isShopee ? undefined : name,
      title: isShopee ? name : undefined,
      sellerSku: v.sellerSku || p.sellerSku || null,
      sellerSkuStatus: (v.sellerSku || p.sellerSku) ? 'present' : 'not_displayed',
      modelId: v.modelId || null, variantName: v.variantName || null,
      sourceRowType: 'variant', variantOrdinal: i + 1
    }));
  });

  const productsWithoutAnySellerSku = products
    .filter(p => !p.sellerSku && (!p.variants || !p.variants.some(v => v.sellerSku)))
    .map(p => ({ productId: isShopee ? undefined : (p.productId || p.itemId), itemId: isShopee ? (p.productId || p.itemId) : undefined, productName: isShopee ? undefined : (p.productName || p.title), title: isShopee ? (p.productName || p.title) : undefined }));

  return registryApi.replacePlatformRegistry(
    registryApi.createEmptyStore(),
    {
      schemaVersion: 1,
      registryType: 'marketplace_product_sku_source_registry',
      platform,
      source: { shop: 'test', captureDate: '2026-11-13' },
      products: products.map(p => ({
        platform,
        productId: isShopee ? undefined : (p.productId || p.itemId),
        itemId: isShopee ? (p.productId || p.itemId) : undefined,
        productName: isShopee ? undefined : (p.productName || p.title),
        title: isShopee ? (p.productName || p.title) : undefined,
        sellerSku: p.sellerSku || null,
        variants: p.variants || []
      })),
      skuRows,
      productsWithoutAnySellerSku,
      pages: [{ products: products.length }],
      summary: {
        listedProductCount: products.length,
        uniqueProductIdCount: products.length,
        skuModelRowCount: skuRows.length,
        sellerSkuPresentRowCount: skuRows.filter(r => r.sellerSkuStatus === 'present').length,
        sellerSkuMissingInRowsCount: skuRows.filter(r => r.sellerSkuStatus !== 'present').length,
        productsWithoutAnySellerSkuCount: productsWithoutAnySellerSku.length
      }
    }
  );
}

// 1. Single-variant exact product name requires variant
test('single-variant exact product name without variant fails closed (not_found)', () => {
  const store = createTestRegistry('SHOPEE', [
    {
      productId: 'p-single-var',
      productName: 'Synthetic Baby Wipes Premium',
      variants: [{ modelId: 'v1', variantName: 'ม่วง', sellerSku: 'SKU-PURPLE' }]
    }
  ]);
  const index = identity.buildIndex(store, registryApi);

  // Exact bare product name without variant in Shopee
  const bareItem = { text: 'Synthetic Baby Wipes Premium' };
  const res = identity.resolve(index, 'SHOPEE', bareItem);
  assert.equal(res.status, 'not_found', 'bare product title on a variant row must not match');
});

// 2. Unknown Seller SKU with mismatched or missing variant -> not_found / unmatched (Review)
test('unknown Seller SKU with mismatched or missing variant goes to Review (NS-01, NS-03, NS-04 parity)', () => {
  const store = createTestRegistry('TIKTOK', [
    {
      productId: 'p-pen',
      productName: 'Synthetic Gel Pen Blue',
      variants: [{ modelId: 'v1', variantName: 'ม่วง10', sellerSku: 'GEL-PEN-10' }]
    },
    {
      productId: 'p-mug',
      productName: 'Synthetic Mug Set',
      sellerSku: 'SYN-MUG-7',
      variants: []
    },
    {
      productId: 'p-wipes',
      productName: 'Synthetic Baby Wipes',
      variants: [{ modelId: 'v1', variantName: 'ชมพู', sellerSku: 'WIPES-PINK' }]
    }
  ]);
  const index = identity.buildIndex(store, registryApi);
  const assignments = matcher.validateAssignments({
    ...matcher.newAssignments(),
    entries: [
      { platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'GEL-PEN-10', productId: 'p-pen', shortName: 'Pen 10' },
      { platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'SYN-MUG-7', productId: 'p-mug', shortName: 'Mug 7' },
      { platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'WIPES-PINK', productId: 'p-wipes', shortName: 'Wipes Pink' }
    ]
  });

  // NS-01: SKU not in registry, PDF says 2 ห่อ, registry row says ม่วง10
  const ns01 = { text: 'Synthetic Gel Pen Blue | 2 ห่อ | NEW-SKU-999', sellerSku: 'NEW-SKU-999' };
  const ev01 = identity.resolve(index, 'TIKTOK', ns01);
  assert.equal(ev01.status, 'not_found');
  const m01 = matcher.match(index, 'TIKTOK', ns01, assignments, identity);
  assert.equal(m01.status, 'unmatched', 'NS-01 must go to Review');

  // NS-03: SKU not in registry, title matches a row assigned by another SKU (SYN-MUG-7)
  const ns03 = { text: 'Synthetic Mug Set | 7 ชิ้น | NEW-SKU-997', sellerSku: 'NEW-SKU-997' };
  const ev03 = identity.resolve(index, 'TIKTOK', ns03);
  assert.equal(ev03.status, 'not_found');
  const m03 = matcher.match(index, 'TIKTOK', ns03, assignments, identity);
  assert.equal(m03.status, 'unmatched', 'NS-03 must go to Review');

  // NS-04: SKU not in registry, row has variant ชมพู, PDF has ม่วง
  const ns04 = { text: 'Synthetic Baby Wipes | ม่วง | NEW-SKU-996', sellerSku: 'NEW-SKU-996' };
  const ev04 = identity.resolve(index, 'TIKTOK', ns04);
  assert.equal(ev04.status, 'not_found');
  const m04 = matcher.match(index, 'TIKTOK', ns04, assignments, identity);
  assert.equal(m04.status, 'unmatched', 'NS-04 must go to Review');
});

// 3. Contradicting PDF variant when SKU matches 1 row and no other row exists (Shopee & TikTok)
test('contradicting PDF variant when SKU matches single row -> ambiguous (seller_sku_catalog_identity_conflict)', () => {
  // TikTok: SKU matches 1 row with variantName: 'ม่วง', but PDF says 'ชมพู'
  const ttStore = createTestRegistry('TIKTOK', [
    {
      productId: 'p-tt-1',
      productName: 'Synthetic Baby Wipes',
      variants: [{ modelId: 'v1', variantName: 'ม่วง', sellerSku: 'SKU-PURPLE' }]
    }
  ]);
  const ttIndex = identity.buildIndex(ttStore, registryApi);
  const ttItem = { text: 'Synthetic Baby Wipes | ชมพู | SKU-PURPLE', sellerSku: 'SKU-PURPLE' };
  const ttRes = identity.resolve(ttIndex, 'TIKTOK', ttItem);
  assert.equal(ttRes.status, 'ambiguous');
  assert.equal(ttRes.reason, 'seller_sku_catalog_identity_conflict');

  // Shopee: SKU matches 1 row with variantName: 'ม่วง', but un-piped text says 'ชมพู'
  const spStore = createTestRegistry('SHOPEE', [
    {
      productId: 'p-sp-1',
      productName: 'Synthetic Baby Wipes',
      variants: [{ modelId: 'v1', variantName: 'ม่วง', sellerSku: 'SKU-PURPLE' }]
    }
  ]);
  const spIndex = identity.buildIndex(spStore, registryApi);
  const spItem = { text: 'Synthetic Baby Wipes ชมพู', sellerSku: 'SKU-PURPLE' };
  const spRes = identity.resolve(spIndex, 'SHOPEE', spItem);
  assert.equal(spRes.status, 'ambiguous');
  assert.equal(spRes.reason, 'seller_sku_catalog_identity_conflict');
});

// 4. saveConfirmedAssignment refuses evidence with status !== 'found' and does not auto-write unknown extraSku
test('saveConfirmedAssignment refuses not_found evidence and never auto-writes unknown extraSku', () => {
  const store = createTestRegistry('TIKTOK', [
    {
      productId: 'p-row',
      productName: 'Test Product',
      variants: [{ modelId: 'v1', variantName: 'Red', sellerSku: 'REG-SKU-1' }]
    }
  ]);
  const index = identity.buildIndex(store, registryApi);

  // Status !== 'found' throws
  assert.throws(() => {
    matcher.saveConfirmedAssignment(
      matcher.newAssignments(), index, 'TIKTOK',
      { status: 'not_found', reason: 'seller_sku_not_found', sellerSku: 'UNKNOWN-SKU' },
      'Some Name'
    );
  }, /Confirmed registry assignment requires productId/);

  // Status === 'found' with an unknown requestedSellerSku does NOT write a seller_sku entry
  const foundEvidence = {
    status: 'found',
    identityType: 'catalog_row',
    sellerSku: 'UNKNOWN-SKU-999',
    requestedSellerSku: 'UNKNOWN-SKU-999',
    candidate: store.platforms.TIKTOK.skuRows[0]
  };
  const saved = matcher.saveConfirmedAssignment(
    matcher.newAssignments(), index, 'TIKTOK',
    foundEvidence,
    'Confirmed Name'
  );
  assert.ok(!saved.entries.some(e => e.identityType === 'seller_sku' && e.sellerSku === 'UNKNOWN-SKU-999'),
    'must not auto-write unknown seller_sku into assignments');
});

// 5. index.html persistRegistryAssignmentEvidence check
test('index.html persistRegistryAssignmentEvidence strictly requires evidence.status === found', () => {
  const slice = html.slice(
    html.indexOf('const persistRegistryAssignmentEvidence ='),
    html.indexOf('const confirmAssignment =')
  );
  assert.ok(!slice.includes("evidence?.status === 'not_found'"), 'must not allow not_found bypass');
  assert.match(slice, /evidence\?\.status === 'found'/);
});
