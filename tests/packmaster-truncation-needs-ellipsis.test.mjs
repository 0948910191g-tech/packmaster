import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const identity = require('../packmaster-registry-identity.js');
const registryApi = require('../packmaster-marketplace-registry.js');

// Ticket 14: a "truncated name" match is accepted only when the text really has a cut point
// ("..." or "…"), and its parts must come in the row's own order: name head first, then the
// tail pieces in sequence. Text with no cut point is never matched by a plain name prefix.
// Synthetic data only.
const CAPTURE = new Date('2026-01-01T00:00:00.000Z');

function shopeeIndex(rows) {
  const products = rows.map(row => ({
    platform: 'SHOPEE', itemId: row.id, title: row.name, sellerSku: null,
    variants: row.variants.map(v => ({ variantName: v, sellerSku: null }))
  }));
  const skuRows = [];
  for (const row of rows) {
    row.variants.forEach((variantName, i) => {
      skuRows.push({ platform: 'SHOPEE', itemId: row.id, title: row.name, sellerSku: null,
        sellerSkuStatus: 'not_displayed', modelId: `m-${row.id}-${i}`, variantName, sourceRowType: 'variant' });
    });
  }
  const source = {
    schemaVersion: 1,
    registryType: 'marketplace_product_sku_source_registry',
    platform: 'SHOPEE',
    source: { shop: 'Synthetic shop', captureDate: '2026-01-01' },
    products,
    skuRows,
    productsWithoutAnySellerSku: products.map(p => ({ itemId: p.itemId })),
    pages: [{ products: products.length }],
    summary: {
      listedProductCount: products.length,
      uniqueProductIdCount: products.length,
      skuModelRowCount: skuRows.length,
      sellerSkuPresentRowCount: 0,
      sellerSkuMissingInRowsCount: skuRows.length,
      productsWithoutAnySellerSkuCount: products.length
    }
  };
  const store = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(CAPTURE), source, CAPTURE);
  return identity.buildIndex(store, registryApi);
}

const ROWS = [
  { id: '4001', name: 'Synthetic Cup Set Family Pack', variants: ['แพ็ค 30'] },
  { id: '4002', name: 'Synthetic Cup Set Trial Pack', variants: ['แพ็ค 3'] },
  { id: '4003', name: 'Synthetic Mop Head Super Absorbent Long Name', variants: ['ขาว'] }
];
const index = shopeeIndex(ROWS);
const resolveShopee = text => identity.resolve(index, 'SHOPEE', { text });

test('ticket 14: แพ็ค 3 text without an ellipsis does not match the row registered only as แพ็ค 30', () => {
  const evidence = resolveShopee('Synthetic Cup Set Family Pack แพ็ค 3');
  assert.equal(evidence.status, 'not_found', JSON.stringify(evidence));
});

test('ticket 14: แพ็ค 30 text without an ellipsis does not match the row registered only as แพ็ค 3', () => {
  const evidence = resolveShopee('Synthetic Cup Set Trial Pack แพ็ค 30');
  assert.equal(evidence.status, 'not_found', JSON.stringify(evidence));
});

test('ticket 14: the exact variant text still matches its own row (control)', () => {
  assert.equal(resolveShopee('Synthetic Cup Set Family Pack แพ็ค 30').candidate.productId, '4001');
  assert.equal(resolveShopee('Synthetic Cup Set Trial Pack แพ็ค 3').candidate.productId, '4002');
});

test('ticket 14: a plain name prefix with no ellipsis and no variant is never matched', () => {
  assert.equal(resolveShopee('Synthetic Mop Head Super Absorbent').status, 'not_found');
  assert.equal(resolveShopee('Synthetic Mop Head Super Absorbent Long').status, 'not_found');
});

test('ticket 14 / ticket 13: bare product name on a variant row fails closed without variant', () => {
  const evidence = resolveShopee('Synthetic Cup Set Family Pack');
  assert.equal(evidence.status, 'not_found');
});

test('ticket 14: a name prefix followed by a variant that is not registered is not matched', () => {
  assert.equal(resolveShopee('Synthetic Cup Set Family Pack แพ็ค 3').status, 'not_found');
  assert.equal(resolveShopee('Synthetic Cup Set Family Pack... แพ็ค 3').status, 'not_found');
});

test('ticket 14: a name prefix with an ellipsis and the registered variant matches the one row (control)', () => {
  const evidence = resolveShopee('Synthetic Mop Head Super Absorb... ขาว');
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.productId, '4003');
});

test('ticket 14: ellipsis tail pieces must follow the row order (in order matches)', () => {
  const evidence = resolveShopee('Synthetic Mop Head Super Absorb... Long Name... ขาว');
  assert.equal(evidence.status, 'found', JSON.stringify(evidence));
  assert.equal(evidence.candidate.productId, '4003');
});

test('ticket 14: ellipsis tail pieces out of the row order are not matched', () => {
  const evidence = resolveShopee('Synthetic Mop Head Super Absorb... ขาว... Long Name');
  assert.equal(evidence.status, 'not_found', JSON.stringify(evidence));
});

test('ticket 14: the name head must start the text, so a head after other words is not matched', () => {
  assert.equal(resolveShopee('ขาว Synthetic Mop Head Super Absorb...').status, 'not_found');
  assert.equal(resolveShopee('Long Name... Synthetic Mop Head Super Absorb... ขาว').status, 'not_found');
});

// Review fix 1: a head that stops inside a number must not match a longer number, even when
// the row keeps the separator ("1.5", "5+5", "1/2") that the skeleton now keeps between digits.
const CUT_ROWS = [
  { id: '5001', name: 'Synthetic Cup Set Pack 1.5', variants: ['ขาว'] },
  { id: '5002', name: 'Synthetic Cup Set Pack 5+5', variants: ['ขาว'] },
  { id: '5003', name: 'Synthetic Cup Set Pack 1/2', variants: ['ขาว'] }
];
const cutIndex = shopeeIndex(CUT_ROWS);
const resolveCut = text => identity.resolve(cutIndex, 'SHOPEE', { text });

test('review fix 1: a head that stops inside a number is not matched (5 / 1, with or without ellipsis)', () => {
  for (const text of [
    'Synthetic Cup Set Pack 5 ขาว',
    'Synthetic Cup Set Pack 5... ขาว',
    'Synthetic Cup Set Pack 1 ขาว',
    'Synthetic Cup Set Pack 1... ขาว'
  ]) {
    assert.equal(resolveCut(text).status, 'not_found', text + ' ' + JSON.stringify(resolveCut(text)));
  }
});

test('review fix 1 control: the full separator-number text still matches its own row', () => {
  assert.equal(resolveCut('Synthetic Cup Set Pack 1.5 ขาว').candidate.productId, '5001');
  assert.equal(resolveCut('Synthetic Cup Set Pack 5+5 ขาว').candidate.productId, '5002');
  assert.equal(resolveCut('Synthetic Cup Set Pack 1/2 ขาว').candidate.productId, '5003');
});
