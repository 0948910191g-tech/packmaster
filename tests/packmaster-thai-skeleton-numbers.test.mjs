import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sku = require('../packmaster-sku-normalization.js');
const identity = require('../packmaster-registry-identity.js');
const registryApi = require('../packmaster-marketplace-registry.js');

// Ticket 15: the Thai skeleton (fuzzy fallback) must keep numbers apart.
// It keeps '.', '+' and '/' between digits, converts Thai digits to ASCII, keeps a space between
// two digits (the ticket 04 rule), and never strips leading vowels. Synthetic data only.
const skeleton = sku.normalizeThaiSkeleton;
const CAPTURE = new Date('2026-01-01T00:00:00.000Z');

function shopeeIndex(rows) {
  const products = rows.map(row => ({
    platform: 'SHOPEE', itemId: row.id, title: row.name, sellerSku: null,
    variants: (row.variants || []).map(v => ({ variantName: v, sellerSku: null }))
  }));
  const skuRows = [];
  for (const row of rows) {
    (row.variants || []).forEach((variantName, i) => {
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

const NUMBER_ROWS = [
  { id: '3001', name: 'Synthetic Tape Roll Mini', variants: ['15 ห่อ'] },
  { id: '3002', name: 'Synthetic Cup Set Duo', variants: ['55 ชิ้น'] },
  { id: '3003', name: 'Synthetic Pack Set', variants: ['2 ห่อ'] },
  { id: '3004', name: 'Synthetic Mop Head', variants: ['ห่อ'] }
];
const resolveShopee = (index, text) => identity.resolve(index, 'SHOPEE', { text });

test('ticket 15: 1.5 and 15 keep different skeletons', () => {
  assert.notEqual(skeleton('1.5 ห่อ'), skeleton('15 ห่อ'));
  assert.equal(skeleton('1.5'), '1.5');
  assert.equal(skeleton('15'), '15');
});

test('ticket 15: 5+5 and 55 keep different skeletons', () => {
  assert.notEqual(skeleton('5+5 ชิ้น'), skeleton('55 ชิ้น'));
  assert.equal(skeleton('5+5'), '5+5');
});

test('ticket 15: a slash between digits is kept, so 1/2 is not 12', () => {
  assert.notEqual(skeleton('1/2'), skeleton('12'));
  assert.equal(skeleton('1/2'), '1/2');
});

test('ticket 15: Thai digit ๒ is not ๓, and ๒ equals ASCII 2', () => {
  assert.notEqual(skeleton('๒ ห่อ'), skeleton('๓ ห่อ'));
  assert.equal(skeleton('๒ ห่อ'), skeleton('2 ห่อ'));
  assert.equal(skeleton('๒ ห่อ'), '2หอ');
});

test('ticket 15: every Thai digit converts to the matching ASCII digit', () => {
  assert.equal(skeleton('๐๑๒๓๔๕๖๗๘๙'), '0123456789');
});

test('ticket 15: a space between two digits stays significant after Thai digits convert', () => {
  assert.notEqual(skeleton('๑ ๒'), skeleton('๑๒'));
  assert.equal(skeleton('๑ ๒'), '1 2');
  assert.notEqual(skeleton('1 2'), skeleton('12'));
});

test('ticket 15: leading vowels เ แ โ ไ ใ are not stripped', () => {
  for (const vowel of ['เ', 'แ', 'โ', 'ไ', 'ใ']) {
    assert.equal(skeleton(vowel + 'ก'), vowel + 'ก', `leading vowel ${vowel} kept`);
  }
  assert.notEqual(skeleton('ไก่'), skeleton('ก่'));
});

test('ticket 15: tone marks and above/below vowels are still stripped, so PDF reordering matches', () => {
  assert.equal(skeleton('ห่อ'), 'หอ');
  assert.equal(skeleton('หอ่'), skeleton('ห่อ'), 'tone mark moved after the vowel');
  assert.equal(skeleton('ก่ิ'), skeleton('กิ่'), 'tone mark and above vowel swapped');
});

test('ticket 15: punctuation outside a digit pair is still dropped', () => {
  assert.equal(skeleton('ม.ต้น'), 'มตน');
  assert.equal(skeleton('3. ห่อ'), '3หอ');
  assert.equal(skeleton('5/ห่อ'), '5หอ');
});

test('ticket 15 guard: normalizeMatchKey and normalizeSellerSku do not convert Thai digits or drop digit punctuation', () => {
  assert.notEqual(sku.normalizeMatchKey('1.5'), sku.normalizeMatchKey('15'));
  assert.notEqual(sku.normalizeMatchKey('1 2'), sku.normalizeMatchKey('12'));
  assert.equal(sku.normalizeSellerSku('๒ ห่อ'), '๒ ห่อ');
  assert.notEqual(sku.normalizeSellerSku('๒ ห่อ'), sku.normalizeSellerSku('2 ห่อ'));
});

test('ticket 15 (PK-01 shape): 1.5 ห่อ does not match the registered 15 ห่อ row', () => {
  const index = shopeeIndex(NUMBER_ROWS);
  const evidence = resolveShopee(index, 'Synthetic Tape Roll Mini 1.5 ห่อ');
  assert.equal(evidence.status, 'not_found', JSON.stringify(evidence));
  const exact = resolveShopee(index, 'Synthetic Tape Roll Mini 15 ห่อ');
  assert.equal(exact.status, 'found');
  assert.equal(exact.candidate.productId, '3001');
});

test('ticket 15 (PK-03 shape): 5+5 ชิ้น does not match the registered 55 ชิ้น row', () => {
  const index = shopeeIndex(NUMBER_ROWS);
  const evidence = resolveShopee(index, 'Synthetic Cup Set Duo 5+5 ชิ้น');
  assert.equal(evidence.status, 'not_found', JSON.stringify(evidence));
  assert.equal(resolveShopee(index, 'Synthetic Cup Set Duo 55 ชิ้น').status, 'found');
});

test('ticket 15: ๓ ห่อ does not match the registered 2 ห่อ row, and ๒ ห่อ does', () => {
  const index = shopeeIndex(NUMBER_ROWS);
  assert.equal(resolveShopee(index, 'Synthetic Pack Set ๓ ห่อ').status, 'not_found');
  const found = resolveShopee(index, 'Synthetic Pack Set ๒ ห่อ');
  assert.equal(found.status, 'found');
  assert.equal(found.candidate.productId, '3003');
});

test('ticket 15: a PDF tone-mark/vowel reorder still matches the catalog row through the skeleton', () => {
  const index = shopeeIndex(NUMBER_ROWS);
  const evidence = resolveShopee(index, 'Synthetic Mop Head หอ่');
  assert.equal(evidence.status, 'found', JSON.stringify(evidence));
  assert.equal(evidence.candidate.productId, '3004');
});

// Review fix 2: spaces around . + / between digits are removed, as in normalizeMatchKey.
test('review fix 2: spaces or invisible characters around a digit separator do not change the skeleton', () => {
  assert.equal(skeleton('5 + 5'), skeleton('5+5'));
  assert.equal(skeleton('5+ 5'), skeleton('5+5'));
  assert.equal(skeleton('1. 5'), skeleton('1.5'));
  assert.equal(skeleton('1\u200B.5'), skeleton('1.5'));
  assert.notEqual(skeleton('5 + 5'), skeleton('55'));
  assert.equal(sku.normalizeMatchKey('5 + 5'), '5+5');
  assert.notEqual(sku.normalizeMatchKey('5 + 5'), sku.normalizeMatchKey('55'));
});

// Review fix 3: a doubled sara e (เเ) is read as แ, on either side of the match.
test('review fix 3: a doubled sara e (เเ) and แ give the same skeleton', () => {
  assert.equal(skeleton('เเพ็ค'), skeleton('แพ็ค'));
  const index = shopeeIndex([
    { id: '6001', name: 'Synthetic Cup แพ็ค Duo', variants: ['ขาว'] },
    { id: '6002', name: 'Synthetic Glove เเพ็ค Pack', variants: ['ขาว'] }
  ]);
  const resolve = text => identity.resolve(index, 'SHOPEE', { text });
  const pdfDoubled = resolve('Synthetic Cup เเพ็ค Duo ขาว');
  assert.equal(pdfDoubled.status, 'found', JSON.stringify(pdfDoubled));
  assert.equal(pdfDoubled.candidate.productId, '6001');
  const catalogDoubled = resolve('Synthetic Glove แพ็ค Pack ขาว');
  assert.equal(catalogDoubled.status, 'found', JSON.stringify(catalogDoubled));
  assert.equal(catalogDoubled.candidate.productId, '6002');
});

// Review fix 4: Thai digits count as digits for the space rule in normalizeMatchKey.
test('review fix 4: a space between two Thai digits stays significant, ASCII guard unchanged', () => {
  assert.notEqual(sku.normalizeMatchKey('๑ ๒'), sku.normalizeMatchKey('๑๒'));
  assert.equal(sku.normalizeMatchKey('๑ ๒'), '๑ ๒');
  assert.equal(sku.normalizeMatchKey('๑๒'), '๑๒');
  assert.notEqual(sku.normalizeMatchKey('5 5'), sku.normalizeMatchKey('55'));
  assert.equal(sku.normalizeMatchKey('5 ห่อ'), '5ห่อ');
});

test('review fix 4: a Thai-digit variant with a space does not match the digits written together', () => {
  const index = shopeeIndex([{ id: '7001', name: 'Synthetic Duo Pack', variants: ['๑ ๒'] }]);
  const resolve = text => identity.resolve(index, 'SHOPEE', { text });
  assert.equal(resolve('Synthetic Duo Pack ๑ ๒').status, 'found');
  assert.equal(resolve('Synthetic Duo Pack ๑๒').status, 'not_found', JSON.stringify(resolve('Synthetic Duo Pack ๑๒')));
  assert.equal(resolve('Synthetic Duo Pack... ๑๒').status, 'not_found', JSON.stringify(resolve('Synthetic Duo Pack... ๑๒')));
});

test('review fix 2: spaces around a separator also collapse for Thai digits and one-sided spaces', () => {
  assert.equal(skeleton('๕ + ๕'), '5+5');
  assert.equal(skeleton('5 +5'), '5+5');
  assert.notEqual(skeleton('๕ + ๕'), skeleton('55'));
});
