import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sku = require('../packmaster-sku-normalization.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const registry = require('../packmaster-marketplace-registry.js');

// Synthetic data only. No real product names, SKUs or order identities.
const SKU = 'HOYA BB สีม่วง *10ห่อ';
const NAME = 'Synthetic Wipes Thin Sheet';
const VARIANT = 'ม่วง';

// Whitespace runs: every space is replaced by other whitespace, never deleted.
// Escapes are used so NBSP and EM SPACE are real characters in the file.
function whitespaceVariants(text) {
  return [
    text,
    text.replaceAll(' ', '\n'),
    text.replaceAll(' ', '\r\n'),
    text.replaceAll(' ', '  '),
    text.replaceAll(' ', '\u00A0'),
    text.replaceAll(' ', '\u2003'),
    text.replaceAll(' ', '\t'),
    `\n\u00A0${text}\t `
  ];
}

// Invisible characters inserted inside the first word. They are removed, never separators.
function invisibleVariants(text) {
  const first = text.split(' ')[0];
  return [
    text.replace(first, first.slice(0, 1) + '\u200B' + first.slice(1)),
    text.replace(first, first.slice(0, 2) + '\u200C' + first.slice(2)),
    text.replace(first, first.slice(0, 2) + '\u200D' + first.slice(2)),
    text.replace(first, first.slice(0, 1) + '\u00AD' + first.slice(1)),
    text.replace(first, first.slice(0, 2) + '\u2060' + first.slice(2)),
    '\uFEFF' + text,
    text.replace(first, first.slice(0, 1) + '\u200B\u00AD' + first.slice(1) + '\u2060')
  ];
}

// A line break inside a word. Only catalog, alias and Local text tolerate this.
function wordBreakVariants(text) {
  const first = text.split(' ')[0];
  return [text.replace(first, first.slice(0, 2) + '\n' + first.slice(2))];
}

function sourceFor(products) {
  const skuRows = products.map(product => ({
    platform: 'TIKTOK', productId: product.productId, productName: product.productName,
    sellerSku: product.sellerSku, sellerSkuStatus: product.sellerSku ? 'present' : 'not_displayed',
    modelId: null, variantName: null, sourceRowType: 'product_sku'
  }));
  const withSku = skuRows.filter(row => row.sellerSku).length;
  return {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry', platform: 'TIKTOK',
    source: { shop: 'synthetic-shop', captureDate: '2026-11-12' },
    products: products.map(product => ({
      platform: 'TIKTOK', productId: product.productId, productName: product.productName,
      sellerSku: product.sellerSku, variants: []
    })),
    skuRows,
    productsWithoutAnySellerSku: products.filter(p => !p.sellerSku).map(p => ({ productId: p.productId })),
    pages: [{ products: products.length }],
    summary: {
      listedProductCount: products.length, uniqueProductIdCount: products.length,
      skuModelRowCount: skuRows.length, sellerSkuPresentRowCount: withSku,
      sellerSkuMissingInRowsCount: skuRows.length - withSku,
      productsWithoutAnySellerSkuCount: products.length - withSku
    }
  };
}

function buildIndex(products = [{ productId: 'p1', productName: NAME, sellerSku: SKU }]) {
  const store = registry.replacePlatformRegistry(registry.createEmptyStore(), sourceFor(products));
  return identity.buildIndex(store, registry);
}

// What the user sees for a match: status, reason and the name it resolves to.
const signature = result => JSON.stringify([result.status, result.reason ?? null, result.rule?.shortName ?? null]);

function assertSameEverywhere(label, run, variants) {
  const expected = signature(run(variants[0]));
  for (const variant of variants) {
    assert.equal(signature(run(variant)), expected, `${label}: ${JSON.stringify(variant)}`);
  }
  return expected;
}

test('one normalizer: whitespace runs and invisible characters share one key per field kind', () => {
  for (const text of [SKU, NAME, `${NAME} | ${VARIANT}`]) {
    for (const variant of [...whitespaceVariants(text), ...invisibleVariants(text)]) {
      assert.equal(sku.normalizeSellerSku(variant), sku.normalizeSellerSku(text), JSON.stringify(variant));
    }
  }
  for (const text of [NAME, `${NAME} | ${VARIANT}`]) {
    for (const variant of [...whitespaceVariants(text), ...invisibleVariants(text), ...wordBreakVariants(text)]) {
      assert.equal(sku.normalizeMatchKey(variant), sku.normalizeMatchKey(text), JSON.stringify(variant));
    }
  }
  assert.equal(sku.normalizeCatalogText, sku.normalizeMatchKey, 'catalog text uses the same key, not a second rule');
  assert.equal(matcher.normalizeSku('HOYA\u00AD BB'), matcher.normalizeSku('HOYA BB'));
  assert.equal(matcher.normalizeMatchKey, sku.normalizeMatchKey);
});

test('Seller SKU match is identical across whitespace runs and invisible characters', () => {
  const index = buildIndex();
  const bySku = matcher.upsertAssignment(matcher.newAssignments(), 'TIKTOK',
    identity.resolve(index, 'TIKTOK', { sellerSku: SKU }), 'ม่วง10');
  const expected = assertSameEverywhere('registry SKU',
    text => matcher.match(index, 'TIKTOK', { sellerSku: text }, bySku, identity),
    [...whitespaceVariants(SKU), ...invisibleVariants(SKU)]);
  assert.equal(expected, JSON.stringify(['matched', 'registry_exact_verified', 'ม่วง10']));
});

test('catalog, alias and Local text give identical matches for every noise variant', () => {
  const index = buildIndex();
  const text = `${NAME} | ${VARIANT}`;
  const noise = [...whitespaceVariants(text), ...invisibleVariants(text), ...wordBreakVariants(text)];

  const byCatalog = matcher.upsertAssignment(matcher.newAssignments(), 'TIKTOK',
    identity.resolve(index, 'TIKTOK', { catalogText: NAME }), 'ชื่อสั้น');
  assertSameEverywhere('catalog text',
    value => matcher.match(index, 'TIKTOK', { catalogText: value }, byCatalog, identity),
    [...whitespaceVariants(NAME), ...invisibleVariants(NAME), ...wordBreakVariants(NAME)]);

  const aliased = matcher.upsertManualSkuAlias(matcher.newAssignments(), index, 'TIKTOK',
    { text }, { platform: 'TIKTOK', productId: 'p1', productName: NAME, variantName: null }, 'ชื่อ Alias', identity);
  assertSameEverywhere('alias pair', value => matcher.match(index, 'TIKTOK', { text: value }, aliased, identity), noise);
  assert.equal(matcher.match(index, 'TIKTOK', { text }, aliased, identity).status, 'matched');

  const local = registry.addLocalProduct(registry.createEmptyStore(), {
    id: 'local-1', platform: 'TIKTOK', productText: NAME, variantText: VARIANT, sellerSku: '', shortName: 'สินค้า Local'
  });
  const localIndex = identity.buildIndex(local, registry);
  assertSameEverywhere('local product',
    value => matcher.match(localIndex, 'TIKTOK', { text: value }, matcher.newAssignments(), identity), noise);
  assert.equal(matcher.match(localIndex, 'TIKTOK', { text }, matcher.newAssignments(), identity).reason,
    'local_product_exact_verified');
});

test('two synthetic SKUs differing by one internal space both resolve uniquely', () => {
  const spaced = 'SYN BABY 80 แผ่น X 3ห่อ';
  const joined = 'SYN BABY 80 แผ่น X3ห่อ';
  const index = buildIndex([
    { productId: 'p-spaced', productName: 'Synthetic Product A', sellerSku: spaced },
    { productId: 'p-joined', productName: 'Synthetic Product B', sellerSku: joined }
  ]);
  const a = identity.resolve(index, 'TIKTOK', { sellerSku: spaced });
  const b = identity.resolve(index, 'TIKTOK', { sellerSku: joined });
  assert.equal(a.status, 'found');
  assert.equal(a.candidate.productId, 'p-spaced');
  assert.equal(b.status, 'found');
  assert.equal(b.candidate.productId, 'p-joined');
  // Whitespace runs of the same SKU still reach the same product.
  assert.equal(identity.resolve(index, 'TIKTOK', { sellerSku: 'SYN BABY 80\u00A0แผ่น  X 3ห่อ' }).candidate.productId, 'p-spaced');
});

test('Seller SKU assignments saved with the previous display form still resolve', () => {
  // These entries are exactly what the previous normalizer wrote to storage.
  const spaced = 'SYN BABY 80 แผ่น X 3ห่อ';
  const joined = 'SYN BABY 80 แผ่น X3ห่อ';
  const index = buildIndex([
    { productId: 'p-spaced', productName: 'Synthetic Product A', sellerSku: spaced },
    { productId: 'p-joined', productName: 'Synthetic Product B', sellerSku: joined }
  ]);
  const saved = matcher.validateAssignments({
    schema: matcher.SCHEMA, version: 1, entries: [
      { platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: spaced, productId: 'p-spaced', modelId: null, variantName: null, shortName: 'ชื่อ A' },
      { platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: joined, productId: 'p-joined', modelId: null, variantName: null, shortName: 'ชื่อ B' }
    ]
  });
  const resolvedA = matcher.match(index, 'TIKTOK', { sellerSku: 'Syn baby 80 แผ่น x 3 ห่อ' }, saved, identity);
  const resolvedB = matcher.match(index, 'TIKTOK', { sellerSku: 'Syn baby 80 แผ่น x3 ห่อ' }, saved, identity);
  assert.equal(resolvedA.status, 'matched');
  assert.equal(resolvedA.rule.shortName, 'ชื่อ A');
  assert.equal(resolvedB.status, 'matched');
  assert.equal(resolvedB.rule.shortName, 'ชื่อ B');
});

test('Local products whose SKUs differ by one space are distinct; the same text with a different SKU is not a duplicate', () => {
  const base = registry.addLocalProduct(registry.createEmptyStore(), {
    id: 'local-x', platform: 'TIKTOK', productText: NAME, variantText: VARIANT, sellerSku: 'SYN X 3ห่อ', shortName: 'X'
  });
  assert.doesNotThrow(() => registry.addLocalProduct(base, {
    id: 'local-y', platform: 'TIKTOK', productText: NAME, variantText: VARIANT, sellerSku: 'SYN X3ห่อ', shortName: 'Y'
  }));
});

test('two Local products the matcher treats as the same cannot be created twice', () => {
  const base = registry.addLocalProduct(registry.createEmptyStore(), {
    id: 'local-a', platform: 'TIKTOK', productText: NAME, variantText: VARIANT, sellerSku: '', shortName: 'A'
  });
  const index = identity.buildIndex(base, registry);
  const names = [NAME, ...whitespaceVariants(NAME), ...invisibleVariants(NAME), ...wordBreakVariants(NAME)];
  const variants = [VARIANT, ...whitespaceVariants(VARIANT), ...invisibleVariants(VARIANT)];
  let checked = 0;
  for (const productText of names) {
    for (const variantText of variants) {
      const item = { text: `${productText} | ${variantText}` };
      // Cross-check: the matcher really does treat this text as the saved product.
      assert.equal(matcher.match(index, 'TIKTOK', item, matcher.newAssignments(), identity).reason,
        'local_product_exact_verified', JSON.stringify(item));
      assert.throws(() => registry.addLocalProduct(base, {
        id: 'local-b', platform: 'TIKTOK', productText, variantText, sellerSku: '', shortName: 'B'
      }), /duplicate/i, JSON.stringify(item));
      checked += 1;
    }
  }
  assert.equal(checked, names.length * variants.length);

  // Same product and variant, SKU differing only by the pack-unit spacing rule, is the same to the matcher.
  const withSku = registry.addLocalProduct(registry.createEmptyStore(), {
    id: 'local-sku', platform: 'SHOPEE', productText: NAME, variantText: VARIANT, sellerSku: 'SYN 3 ห่อ', shortName: 'C'
  });
  assert.throws(() => registry.addLocalProduct(withSku, {
    id: 'local-sku-2', platform: 'SHOPEE', productText: NAME, variantText: VARIANT, sellerSku: 'SYN 3ห่อ', shortName: 'D'
  }), /duplicate/i);

  // A genuinely different product, and the same text on another platform, are accepted.
  assert.doesNotThrow(() => registry.addLocalProduct(base, {
    id: 'local-c', platform: 'TIKTOK', productText: NAME, variantText: 'ดำ', sellerSku: '', shortName: 'E'
  }));
  assert.doesNotThrow(() => registry.addLocalProduct(base, {
    id: 'local-d', platform: 'SHOPEE', productText: NAME, variantText: VARIANT, sellerSku: '', shortName: 'F'
  }));
});

test('load and restore accept a matcher-level key collision; exact duplicates still throw', () => {
  const first = {
    id: 'local-1', platform: 'TIKTOK', productText: NAME, variantText: VARIANT, sellerSku: '', shortName: 'One'
  };
  // Same words with a zero-width space inside one word: the matcher key is equal, the exact key is not.
  const collision = { ...first, id: 'local-2', productText: NAME.replace('Thin', 'Thin\u200B'), shortName: 'Two' };
  const stored = registry.validateStore({ ...registry.createEmptyStore(), localProducts: [first, collision] });
  assert.equal(stored.localProducts.length, 2, 'loading must not throw on a key collision');

  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  memory.set(registry.STORAGE_KEY ?? 'packmasterMarketplaceRegistryV1', JSON.stringify(stored));
  assert.equal(registry.loadStore(storage).error, null, 'restored store opens');

  const index = identity.buildIndex(stored, registry);
  const result = matcher.match(index, 'TIKTOK', { text: `${NAME} | ${VARIANT}` }, matcher.newAssignments(), identity);
  assert.equal(result.status, 'ambiguous', 'the collision stays fail-safe');
  assert.equal(result.reason, 'local_catalog_conflict');

  assert.throws(() => registry.validateStore({ ...registry.createEmptyStore(),
    localProducts: [first, { ...first, id: 'local-3' }] }), /duplicate/i, 'same text and fields is an exact duplicate');
  assert.throws(() => registry.validateStore({ ...registry.createEmptyStore(),
    localProducts: [first, { ...first, id: 'local-1' }] }), /duplicate/i, 'same id is a duplicate');
});

test('normalization changes stay out of the A2-A4 fuzzy rules (regression guards)', () => {
  assert.notEqual(sku.normalizeMatchKey('Tape 1.5 ห่อ'), sku.normalizeMatchKey('Tape 15 ห่อ'));
  assert.notEqual(sku.normalizeMatchKey('Cup 5+5 ชิ้น'), sku.normalizeMatchKey('Cup 55 ชิ้น'));
  assert.notEqual(sku.normalizeMatchKey('Pack ๒ ห่อ'), sku.normalizeMatchKey('Pack ๓ ห่อ'));
  assert.notEqual(sku.normalizeMatchKey('Cup Set แพ็ค 3'), sku.normalizeMatchKey('Cup Set แพ็ค 30'));
  assert.notEqual(sku.normalizeMatchKey('HOYA Value 1 2'), sku.normalizeMatchKey('HOYA Value 12'),
    'a space between two numbers is a token boundary (existing alias test)');
  assert.equal(sku.normalizeMatchKey('30แผ่น/ ห่อ'), sku.normalizeMatchKey('30แผ่น/ห่อ'),
    'spacing before a pack unit is ignored (existing catalog test)');
  assert.equal(sku.normalizeThaiSkeleton('1.5'), '1.5', 'ticket 15: the skeleton keeps a decimal point between digits (was 15)');
  assert.equal(sku.normalizeSellerSku('SKU Qty Total: 2'), 'SKU QTY TOTAL: 2');
});
