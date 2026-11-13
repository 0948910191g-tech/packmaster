import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');

// Synthetic registry only. Names, IDs and SKUs are invented.
const CAPTURE = new Date('2026-01-01T00:00:00.000Z');

function platformSource(platform, products) {
  const tiktok = platform === 'TIKTOK';
  const idField = tiktok ? 'productId' : 'itemId';
  const nameField = tiktok ? 'productName' : 'title';
  const productRows = [];
  const skuRows = [];
  for (const p of products) {
    const variants = p.variants || [];
    productRows.push({
      platform, [idField]: p.id, [nameField]: p.name, sellerSku: null,
      variants: variants.map(v => ({ variantName: v.variantName, sellerSku: v.sellerSku || null }))
    });
    if (tiktok && variants.length === 0) {
      skuRows.push({
        platform, [idField]: p.id, [nameField]: p.name, sellerSku: null,
        sellerSkuStatus: 'not_displayed', modelId: null, variantName: null, sourceRowType: 'product_sku'
      });
    }
    variants.forEach((v, i) => {
      skuRows.push({
        platform, [idField]: p.id, [nameField]: p.name,
        sellerSku: v.sellerSku || null,
        sellerSkuStatus: v.sellerSku ? 'present' : 'not_displayed',
        modelId: tiktok ? null : v.modelId,
        variantName: v.variantName,
        sourceRowType: 'variant',
        ...(tiktok ? { variantOrdinal: i + 1 } : {})
      });
    });
  }
  const withoutSku = productRows.filter(p => !p.variants.some(v => v.sellerSku));
  const presentCount = skuRows.filter(row => row.sellerSku).length;
  return {
    schemaVersion: 1,
    registryType: 'marketplace_product_sku_source_registry',
    platform,
    source: { shop: 'Synthetic shop', captureDate: '2026-01-01' },
    products: productRows,
    skuRows,
    productsWithoutAnySellerSku: withoutSku.map(p => ({ [idField]: p[idField] })),
    pages: [{ products: productRows.length }],
    summary: {
      listedProductCount: productRows.length,
      uniqueProductIdCount: productRows.length,
      skuModelRowCount: skuRows.length,
      sellerSkuPresentRowCount: presentCount,
      sellerSkuMissingInRowsCount: skuRows.length - presentCount,
      productsWithoutAnySellerSkuCount: withoutSku.length
    }
  };
}

function buildIndex() {
  let store = registryApi.createEmptyStore(CAPTURE);
  store = registryApi.replacePlatformRegistry(store, platformSource('TIKTOK', [
    { id: 'T-CUP-A', name: 'Synthetic Cup Set Trial Pack', variants: [{ variantName: 'แพ็ค 3', sellerSku: 'SKU-CUP-3' }, { variantName: 'แพ็ค 30' }] },
    { id: 'T-CUP-B', name: 'Synthetic Cup Set Family Pack', variants: [{ variantName: 'แพ็ค 30' }] },
    { id: 'T-CUP-LITE', name: 'Synthetic Cup Set Trial Pack Lite', variants: [] },
    { id: 'T-CUP-MINI-S', name: 'Synthetic Cup', variants: [{ variantName: 'Mini', sellerSku: 'SKU-CUP-MINI' }] },
    { id: 'T-CUP-MINI-L', name: 'Synthetic Cup Mini', variants: [{ variantName: 'Large' }] },
    { id: 'T-GAUGE', name: 'Synthetic Gauge Set Trial Pack', variants: [{ variantName: '3', sellerSku: 'SKU-GAUGE-3' }, { variantName: '3.5 ซม' }] },
    { id: 'T-WIPE', name: 'Synthetic Baby Wipes', variants: [{ variantName: 'ม่วง', sellerSku: 'SKU-WIPE-P' }, { variantName: 'ชมพู' }] }
  ]), CAPTURE);
  store = registryApi.replacePlatformRegistry(store, platformSource('SHOPEE', [
    { id: '2001', name: 'Synthetic Cup Set Trial Pack', variants: [{ modelId: 'm-3', variantName: 'แพ็ค 3', sellerSku: 'SKU-CUP-3' }, { modelId: 'm-30', variantName: 'แพ็ค 30' }] },
    { id: '2002', name: 'Synthetic Cup Set Family Pack', variants: [{ modelId: 'm-30b', variantName: 'แพ็ค 30' }] }
  ]), CAPTURE);
  return identity.buildIndex(store, registryApi);
}

// Save a confirmed name for the exact SKU row, the same way the Review screen does.
function namedAssignments(index, platform, cleanItem, shortName) {
  const evidence = identity.resolve(index, platform, cleanItem);
  assert.equal(evidence.status, 'found', 'setup item must resolve to one exact row');
  return matcher.upsertAssignment(matcher.newAssignments(), platform, evidence, shortName);
}

const REVIEW_REASON = 'seller_sku_catalog_identity_conflict';

// B9 "SKU wins" cases: the name guess is either ambiguous or points at the same product with no variant evidence.
test('B9: exact SKU wins over a truncated name with no variant evidence (Shopee)', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'SHOPEE',
    { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack แพ็ค 3' }, 'ชื่อ ข');
  const item = { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack' };
  const evidence = identity.resolve(index, 'SHOPEE', item);
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.productId, '2001');
  assert.equal(evidence.candidate.variantName, 'แพ็ค 3');
  const actual = matcher.match(index, 'SHOPEE', item, assignments, identity);
  assert.equal(actual.status, 'matched');
  assert.equal(actual.rule.shortName, 'ชื่อ ข');
});

test('B9: exact SKU wins over a truncated TikTok name with an empty variant column', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'TIKTOK',
    { text: 'Synthetic Cup Set Trial Pack | แพ็ค 3 | SKU-CUP-3' }, 'ชื่อ ก');
  const item = { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack' };
  const actual = matcher.match(index, 'TIKTOK', item, assignments, identity);
  assert.equal(actual.status, 'matched');
  assert.equal(actual.rule.shortName, 'ชื่อ ก');
});

// Finding 1: a name guess to a DIFFERENT product always stays in Review.
test('finding 1: a name guess to a different product (same SKU) stays in Review (TikTok)', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'TIKTOK',
    { text: 'Synthetic Cup Set Trial Pack | แพ็ค 3 | SKU-CUP-3' }, 'ชื่อ ก');
  const item = { text: 'Synthetic Cup Set Family Pack | แพ็ค 3 | SKU-CUP-3' };
  const actual = matcher.match(index, 'TIKTOK', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});

test('finding 1: a name guess to a different product (same SKU) stays in Review (Shopee)', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'SHOPEE',
    { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack แพ็ค 3' }, 'ชื่อ ข');
  const item = { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Family Pack แพ็ค 3' };
  const actual = matcher.match(index, 'SHOPEE', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});

test('finding 1: a name guess to a different product with no variant stays in Review', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'TIKTOK',
    { text: 'Synthetic Cup Set Trial Pack | แพ็ค 3 | SKU-CUP-3' }, 'ชื่อ ก');
  // The name guess is the variant-less Lite row (exact product name); the PDF names no variant.
  const item = { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack Lite' };
  const actual = matcher.match(index, 'TIKTOK', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});

// Finding 2: the SKU variant must not be found inside the guessed product's own name.
test('finding 2: SKU variant that only appears inside another product name stays in Review', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'TIKTOK',
    { text: 'Synthetic Cup | Mini | SKU-CUP-MINI' }, 'ชื่อ ง');
  const item = { text: 'Synthetic Cup Mini | Large | SKU-CUP-MINI' };
  const actual = matcher.match(index, 'TIKTOK', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});

// Finding 3: a PDF that names two variants of the same product stays in Review, even with no name guess.
test('finding 3: PDF naming both variants of the SKU product stays in Review (Shopee)', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'SHOPEE',
    { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack แพ็ค 3' }, 'ชื่อ ข');
  const item = { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack แพ็ค 3 แพ็ค 30' };
  const actual = matcher.match(index, 'SHOPEE', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});

// Boundary: a bare "3" must not match inside "3.5".
test('boundary: SKU variant "3" does not match inside PDF variant "3.5" and stays in Review', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'TIKTOK',
    { text: 'Synthetic Gauge Set Trial Pack | 3 | SKU-GAUGE-3' }, 'ชื่อ ฉ');
  const item = { text: 'Synthetic Gauge Set Trial Pack | 3.5 | SKU-GAUGE-3' };
  const actual = matcher.match(index, 'TIKTOK', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});

// Guards that must keep their current Review result.
test('guard: a same-product variant that contradicts the SKU row stays in Review (TikTok)', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'TIKTOK',
    { text: 'Synthetic Cup Set Trial Pack | แพ็ค 3 | SKU-CUP-3' }, 'ชื่อ ก');
  const item = { text: 'Synthetic Cup Set Trial Pack | แพ็ค 30 | SKU-CUP-3' };
  const actual = matcher.match(index, 'TIKTOK', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});

test('guard: a same-product variant that contradicts the SKU row stays in Review (Shopee)', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'SHOPEE',
    { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack แพ็ค 3' }, 'ชื่อ ข');
  const item = { sellerSku: 'SKU-CUP-3', catalogText: 'Synthetic Cup Set Trial Pack แพ็ค 30' };
  const actual = matcher.match(index, 'SHOPEE', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});

test('guard: a colour variant from the name guess that differs from the SKU row stays in Review', () => {
  const index = buildIndex();
  const assignments = namedAssignments(index, 'TIKTOK',
    { text: 'Synthetic Baby Wipes | ม่วง | SKU-WIPE-P' }, 'ชื่อ ค');
  const item = { text: 'Synthetic Baby Wipes | ชมพู | SKU-WIPE-P' };
  const actual = matcher.match(index, 'TIKTOK', item, assignments, identity);
  assert.equal(actual.status, 'ambiguous');
  assert.equal(actual.reason, REVIEW_REASON);
});
