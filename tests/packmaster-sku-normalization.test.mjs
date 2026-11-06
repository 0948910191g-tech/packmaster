import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sku = require('../packmaster-sku-normalization.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const registry = require('../packmaster-marketplace-registry.js');

function makeIndex(sellerSkus) {
  const products = sellerSkus.map((sellerSku, index) => ({
    platform: 'TIKTOK', productId: 'listing-' + index,
    productName: 'Marketplace title ' + index, sellerSku, variants: []
  }));
  const skuRows = sellerSkus.map((sellerSku, index) => ({
    platform: 'TIKTOK', productId: 'listing-' + index,
    productName: 'Marketplace title ' + index, sellerSku,
    sellerSkuStatus: 'present', modelId: null, sourceRowType: 'product_sku'
  }));
  const source = {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry',
    platform: 'TIKTOK', source: { shop: 'test-shop', captureDate: '2026-11-05' },
    products, skuRows, productsWithoutAnySellerSku: [],
    pages: [{ products: products.length }],
    summary: {
      listedProductCount: products.length, uniqueProductIdCount: products.length,
      skuModelRowCount: skuRows.length, sellerSkuPresentRowCount: skuRows.length,
      sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0
    }
  };
  const store = registry.replacePlatformRegistry(registry.createEmptyStore(), source);
  return identity.buildIndex(store, registry);
}

test('Windows Thai PDF glyphs and pack spacing resolve to the exact registered SKU', () => {
  // Sanitized from the failed November 5 Cloud Batch; no order/customer identity.
  const registered = 'HOYA BB สีม่วง *10ห่อ';
  const polluted = 'HOYA BB สีม\uF70Aวง *10 ห\uF70Aอ Qty Total: Order ID: REDACTED';
  assert.equal(sku.cleanPdfSellerSku(polluted), 'HOYA BB สีม\uF70Aวง *10 ห\uF70Aอ');
  assert.equal(
    sku.normalizeSellerSku(identity.extractSellerSku('TIKTOK', { sellerSku: polluted })),
    sku.normalizeSellerSku(registered)
  );
  assert.equal(sku.normalizeSellerSku('SKU Qty Total: 2'), 'SKU QTY TOTAL: 2',
    'A registry key must not be silently truncated by normalizing it');
  const catalog = makeIndex([registered]);
  const assignments = matcher.upsertAssignment(
    matcher.newAssignments(), 'TIKTOK',
    identity.resolve(catalog, 'TIKTOK', { sellerSku: registered }),
    'ม่วง10'
  );
  const resolved = matcher.match(catalog, 'TIKTOK', { sellerSku: polluted }, assignments, identity);
  assert.equal(resolved.status, 'matched');
  assert.equal(resolved.rule.shortName, 'ม่วง10');
  assert.equal(resolved.reason, 'registry_exact_verified');
});

test('Previously saved PDF content can match without reimporting or rewriting orders', () => {
  const catalog = makeIndex(['HOYA สีชมพู *10', 'HOYA BB สีม่วง *10ห่อ']);
  const evidence = identity.resolve(catalog, 'TIKTOK', { sellerSku: 'HOYA สีชมพู *10' });
  const assignments = matcher.upsertAssignment(matcher.newAssignments(), 'TIKTOK', evidence, 'ชม10');
  const oldPage = {
    text: 'Product | Default | HOYA สีชมพู *10 Qty Total: Order ID: REDACTED',
    sellerSku: 'HOYA สีชมพู *10 Qty Total: Order ID: REDACTED',
    qty: 1
  };
  assert.equal(matcher.match(catalog, 'TIKTOK', oldPage, assignments, identity).rule.shortName, 'ชม10');
  assert.equal(oldPage.sellerSku.includes('Order ID:'), true, 'Stored historic payload remains untouched');
});

test('Matching stays fail-closed for wrong package quantity, unknown SKU, and title-only input', () => {
  const registered = 'HOYA BB สีม่วง *10ห่อ';
  const catalog = makeIndex([registered]);
  const assignments = matcher.upsertAssignment(
    matcher.newAssignments(), 'TIKTOK',
    identity.resolve(catalog, 'TIKTOK', { sellerSku: registered }), 'ม่วง10'
  );
  for (const input of [
    { sellerSku: 'HOYA BB สีม่วง *12ห่อ' },
    { sellerSku: 'HOYA BB สีม่วง *10ห่อ ADD-ON' },
    { sellerSku: 'HOYA BB สีม่วง' },
    { text: 'Marketplace title that mentions HOYA BB สีม่วง *10ห่อ' }
  ]) {
    assert.notEqual(matcher.match(catalog, 'TIKTOK', input, assignments, identity).status, 'matched');
  }
  assert.notEqual(matcher.match(catalog, 'SHOPEE',
    { sellerSku: registered }, assignments, identity).status, 'matched');
  assert.equal(matcher.match(catalog, 'TIKTOK',
    { sellerSku: registered }, matcher.newAssignments(), identity).status, 'unmatched');
});

test('Typographically equal SKU values colliding in the registry remain ambiguous', () => {
  const canonical = 'HOYA BB สีม่วง *10ห่อ';
  const fontVariant = 'HOYA BB สีม\uF70Aวง *10 ห\uF70Aอ';
  const catalog = makeIndex([canonical, fontVariant]);
  const result = identity.resolve(catalog, 'TIKTOK', { sellerSku: canonical });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidateCount, 2);
  assert.throws(() => matcher.upsertAssignment(matcher.newAssignments(),
    'TIKTOK', result, 'Do not approve'), /exact unique/);
});

test('Thai PDF font mapping is narrow and leaves distinct Seller SKUs distinct', () => {
  assert.equal(sku.repairThaiPdfGlyphs('ส\uF70Aงของ'), 'ส่งของ');
  assert.equal(sku.repairThaiPdfGlyphs('แป\uF70Bง'), 'แป้ง');
  assert.equal(sku.normalizeSellerSku('ABC-001'), 'ABC-001');
  assert.notEqual(sku.normalizeSellerSku('ABC-001'), sku.normalizeSellerSku('ABC-002'));
  assert.equal(sku.cleanPdfSellerSku('Qty Total: Order ID: REDACTED'), '');
  assert.equal(identity.extractSellerSku('TIKTOK', {
    sellerSku: 'Qty Total: Order ID: REDACTED'
  }), null);
});
