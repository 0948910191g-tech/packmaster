import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');

// Ticket 06: a truncated product name followed by a variant must match the one row whose
// name starts with the cut text and whose variant matches as a whole token. Synthetic data only.
const CAPTURE = new Date('2026-01-01T00:00:00.000Z');

// products: { id, name, variants: [{ variantName, modelId?, sellerSku? }] }
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
  const presentCount = skuRows.filter(row => row.sellerSku).length;
  return {
    schemaVersion: 1,
    registryType: 'marketplace_product_sku_source_registry',
    platform,
    source: { shop: 'Synthetic shop', captureDate: '2026-01-01' },
    products: productRows,
    skuRows,
    productsWithoutAnySellerSku: productRows.filter(p => !p.variants.some(v => v.sellerSku)).map(p => ({ [idField]: p[idField] })),
    pages: [{ products: productRows.length }],
    summary: {
      listedProductCount: productRows.length,
      uniqueProductIdCount: productRows.length,
      skuModelRowCount: skuRows.length,
      sellerSkuPresentRowCount: presentCount,
      sellerSkuMissingInRowsCount: skuRows.length - presentCount,
      productsWithoutAnySellerSkuCount: productRows.length - productRows.filter(p => p.variants.some(v => v.sellerSku)).length
    }
  };
}

function buildIndex(platform, products) {
  const store = registryApi.replacePlatformRegistry(
    registryApi.createEmptyStore(CAPTURE), platformSource(platform, products), CAPTURE);
  return identity.buildIndex(store, registryApi);
}

const SHOPEE_REGISTRY = [
  { id: '2001', name: 'Synthetic Wipes Thin Sheet Fresh Pack Extra',
    variants: [{ modelId: 'm-3', variantName: '3ห่อ' }, { modelId: 'm-30', variantName: '30ห่อ' }] },
  { id: '2002', name: 'Synthetic Lunch Box Compact Family Set',
    variants: [{ modelId: 'm-b', variantName: 'Blue' }, { modelId: 'm-r', variantName: 'Red' }] },
  { id: '2003', name: 'Synthetic Mop Head Super Absorbent Long Name',
    variants: [{ modelId: 'm-w', variantName: 'ขาว' }] },
  { id: '2004', name: 'Synthetic Cup Set Family Pack',
    variants: [{ modelId: 'm-f30', variantName: 'แพ็ค 30' }] },
  { id: '2005', name: 'Synthetic Gauge Set Trial Pack',
    variants: [{ modelId: 'm-g35', variantName: '3.5 ชิ้น' }] },
  { id: '2006', name: 'Synthetic Tape Roll Mini',
    variants: [{ modelId: 'm-t15', variantName: '15 ห่อ' }] },
  { id: '2007', name: 'Synthetic Duo Set Red',
    variants: [{ modelId: 'm-d1', variantName: 'Red' }] },
  { id: '2008', name: 'Synthetic Duo Set Ruby',
    variants: [{ modelId: 'm-d2', variantName: 'Red' }] },
  { id: '2009', name: 'Synthetic Tub Large Pack Set',
    variants: [{ modelId: 'm-tub', variantName: 'Blue' }] }
];

const TIKTOK_REGISTRY = [
  { id: 'T-UNIQ', name: 'Synthetic Unique Cup Set',
    variants: [{ variantName: 'Blue', sellerSku: 'SKU-B' }] },
  { id: 'T-DUP-1', name: 'Synthetic Same Name Cup',
    variants: [{ variantName: 'Blue', sellerSku: 'SKU-C' }] },
  { id: 'T-DUP-2', name: 'Synthetic Same Name Cup',
    variants: [{ variantName: 'Red', sellerSku: 'SKU-D' }] }
];

// Save a confirmed name for a Shopee row the way the Review screen does.
function assignmentsFor(index, text, shortName) {
  const evidence = identity.resolve(index, 'SHOPEE', { text });
  assert.equal(evidence.status, 'found', 'setup text must resolve to one exact row: ' + text);
  return matcher.upsertAssignment(matcher.newAssignments(), 'SHOPEE', evidence, shortName);
}

const shopee = () => buildIndex('SHOPEE', SHOPEE_REGISTRY);
const resolveText = (index, text) => identity.resolve(index, 'SHOPEE', { text });

test('truncated name + variant without ellipsis matches the one row (TR-01 shape)', () => {
  const index = shopee();
  const evidence = resolveText(index, 'Synthetic Wipes Thin Sheet Fresh Pack 3ห่อ');
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.productId, '2001');
  assert.equal(evidence.candidate.variantName, '3ห่อ');

  const assignments = assignmentsFor(index, 'Synthetic Wipes Thin Sheet Fresh Pack Extra 3ห่อ', 'ชื่อ ทดสอบ 3');
  const actual = matcher.match(index, 'SHOPEE', { text: 'Synthetic Wipes Thin Sheet Fresh Pack 3ห่อ' }, assignments, identity);
  assert.equal(actual.status, 'matched');
  assert.equal(actual.rule.shortName, 'ชื่อ ทดสอบ 3');
});

test('a mid-word cut with a whole-token variant still matches the right row', () => {
  const index = shopee();
  const evidence = resolveText(index, 'Synthetic Wipes Thin Sheet Fresh Pa 30ห่อ');
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.variantName, '30ห่อ');
});

test('short variant after an ellipsis matches the row (TR-02 shape, control)', () => {
  const evidence = resolveText(shopee(), 'Synthetic Mop Head Super Absorb... ขาว');
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.productId, '2003');
});

test('short variant 3ห่อ after an ellipsis picks the 3ห่อ row, not the 30ห่อ row (SV-02 shape)', () => {
  const evidence = resolveText(shopee(), 'Synthetic Wipes Thin Sheet Fresh Pack... 3ห่อ');
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.variantName, '3ห่อ');
});

test('short English variant after an ellipsis is not dropped (SV-03 shape)', () => {
  const index = shopee();
  const blue = resolveText(index, 'Synthetic Lunch Box Compact Fam... Blue');
  assert.equal(blue.status, 'found');
  assert.equal(blue.candidate.variantName, 'Blue');
  const red = resolveText(index, 'Synthetic Lunch Box Compact Fam... Red');
  assert.equal(red.status, 'found');
  assert.equal(red.candidate.variantName, 'Red');
});

test('an ellipsis followed by an unregistered short variant is not accepted by prefix alone (TR-03 shape)', () => {
  const evidence = resolveText(shopee(), 'Synthetic Mop Head Super Absorb... ดำ');
  assert.equal(evidence.status, 'not_found');
});

test('a name prefix plus a variant that is not registered is not matched (control)', () => {
  const evidence = resolveText(shopee(), 'Synthetic Wipes Thin Sheet Fresh Pack 5ห่อ');
  assert.equal(evidence.status, 'not_found');
});

test('แพ็ค 3 does not match the row registered only as แพ็ค 30, with or without an ellipsis (PS-01 shape)', () => {
  const index = shopee();
  assert.equal(resolveText(index, 'Synthetic Cup Set Family Pack แพ็ค 3').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Cup Set Family... แพ็ค 3').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Cup Set Family Pack แพ็ค 30').status, 'found');
});

test('a long name fragment does not carry a variant prefix: แพ็ค 3 is not inside แพ็ค 30', () => {
  const index = shopee();
  assert.equal(resolveText(index, 'Synthetic Cup Set Family... Pack แพ็ค 3').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Cup Set Fam... Family Pack').status, 'not_found');
});

test('a name-only tail does not match a row whose variant is absent from the text', () => {
  const index = shopee();
  // The tail is a real fragment of the name, not the whole title (a whole title hits the exact-title rule).
  assert.equal(resolveText(index, 'Synthetic Tub Large... Pack Se').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Tub Large... Pack Set Blue').status, 'found');
});

test('a bare 3 does not match inside 3.5 (decimal point stays part of the variant)', () => {
  const index = shopee();
  assert.equal(resolveText(index, 'Synthetic Gauge Set Trial Pack 3 ชิ้น').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Gauge Set Trial Pack... 3 ชิ้น').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Gauge Set Trial Pack 3.5 ชิ้น').status, 'found');
});

test('a name prefix alone, with no variant after it, is never matched', () => {
  const index = shopee();
  // Not the full product name (that is an exact-title match, handled before this path).
  assert.equal(resolveText(index, 'Synthetic Cup Set Family').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Cup Set Family Pa').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Cup Set Family...').status, 'not_found');
});

test('truly ambiguous truncated text returns ambiguous, never a guess', () => {
  const evidence = resolveText(shopee(), 'Synthetic Duo Se Red');
  assert.equal(evidence.status, 'ambiguous');
});

test('the matcher keeps a truncated match in Review when no name is saved for the row', () => {
  const actual = matcher.match(shopee(), 'SHOPEE', { text: 'Synthetic Wipes Thin Sheet Fresh Pack 3ห่อ' },
    matcher.newAssignments(), identity);
  assert.notEqual(actual.status, 'matched');
});

test('a TikTok Seller SKU label in a two-column text is not read as a variant column', () => {
  const index = buildIndex('TIKTOK', TIKTOK_REGISTRY);
  const evidence = identity.resolve(index, 'TIKTOK', { text: 'Synthetic Unique Cup Set | Seller SKU: SKU-B' });
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.productId, 'T-UNIQ');
});

test('an exact SKU row is still found when another product shares its name', () => {
  const index = buildIndex('TIKTOK', TIKTOK_REGISTRY);
  const evidence = identity.resolve(index, 'TIKTOK', { text: 'Synthetic Same Name Cup | Blue | SKU-C' });
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.productId, 'T-DUP-1');
});

// Review round 2 (ticket 06). Each test is a counterexample from the review, with synthetic data.

test('R1: a head that cuts a number inside the name does not prefix a longer number (Pack 3 vs Pack 30)', () => {
  const index = buildIndex('SHOPEE', [
    { id: '3101', name: 'Synthetic Tub Large Pack 30 Extra', variants: [{ modelId: 'm-t', variantName: 'Blue' }] }
  ]);
  assert.equal(resolveText(index, 'Synthetic Tub Large Pack 3 Blue').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Tub Large Pack 3... Blue').status, 'not_found');
  // The full number still matches (control).
  assert.equal(resolveText(index, 'Synthetic Tub Large Pack 30... Blue').status, 'found');
});

test('R2: a text that is the complete title of another product never matches a longer sibling', () => {
  const index = buildIndex('SHOPEE', [
    { id: '3201', name: 'Synthetic Cup Set Basic Edition Solid', variants: [{ modelId: 'm-a', variantName: 'Blue' }] },
    { id: '3202', name: 'Synthetic Cup Set Basic Edition Solid Plus Max', variants: [{ modelId: 'm-b', variantName: 'Red' }] }
  ]);
  for (const text of [
    'Synthetic Cup Set Basic Edition Solid Red',
    'Synthetic Cup Set Basic Edition Solid... Red',
    'Synthetic Cup Set Red'
  ]) {
    const evidence = resolveText(index, text);
    assert.notEqual(evidence.status, 'found', text);
    assert.notEqual(evidence.candidate?.productId, '3202', text);
  }
  // The real longer product, with its own name spelled out, still matches (control).
  const own = resolveText(index, 'Synthetic Cup Set Basic Edition Solid Plus... Red');
  assert.equal(own.status, 'found');
  assert.equal(own.candidate.productId, '3202');
});

test('R3: a brand-like head (short, or under half the title) does not match', () => {
  const index = buildIndex('SHOPEE', [
    { id: '3301', name: 'Synthetic Gloves Nitrile Powder Free Extra Long', variants: [{ modelId: 'm-g', variantName: 'L' }] }
  ]);
  assert.equal(resolveText(index, 'Synthetic Gloves Nit L').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Gloves............. L').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic ........ L').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Gloves............. S').status, 'not_found');
  // A head that is at least half the title still matches (control).
  assert.equal(resolveText(index, 'Synthetic Gloves Nitrile Powder Free... L').status, 'found');
});

test('R4: a variant with no space between digits is not matched across a space (55 vs 5 5)', () => {
  const index = buildIndex('SHOPEE', [
    { id: '3401', name: 'Synthetic Pack 5 Item Deluxe Bundle Set', variants: [{ modelId: 'm-p', variantName: '55' }] }
  ]);
  assert.equal(resolveText(index, 'Synthetic Pack 5 Item Deluxe Bundle 5 5').status, 'not_found');
  assert.equal(resolveText(index, 'Synthetic Pack 5 Item Deluxe Bundle Set 55').status, 'found');
});

const TIKTOK_VARIANT_REGISTRY = [
  { id: 'T-BLUE', name: 'Synthetic Blue Cup', variants: [{ variantName: 'สีฟ้า, ขนาด L', sellerSku: 'SKU-BLUE-L' }] }
];

test('R5a: a registry variant with a comma still matches the PDF variant without it (exact SKU stays found)', () => {
  const index = buildIndex('TIKTOK', TIKTOK_VARIANT_REGISTRY);
  const evidence = identity.resolve(index, 'TIKTOK', { text: 'Synthetic Blue Cup | สีฟ้า ขนาด L | SKU-BLUE-L' });
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.productId, 'T-BLUE');
});

test('R5b: a PDF variant that is a truncated prefix of the registry variant stays found', () => {
  const index = buildIndex('TIKTOK', TIKTOK_VARIANT_REGISTRY);
  const evidence = identity.resolve(index, 'TIKTOK', { text: 'Synthetic Blue Cup | สีฟ้า | SKU-BLUE-L' });
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.candidate.productId, 'T-BLUE');
});

test('R5c: a genuinely different PDF variant still vetoes the exact SKU row', () => {
  const index = buildIndex('TIKTOK', TIKTOK_VARIANT_REGISTRY);
  const evidence = identity.resolve(index, 'TIKTOK', { text: 'Synthetic Blue Cup | สีแดง ขนาด L | SKU-BLUE-L' });
  assert.equal(evidence.status, 'ambiguous');
  assert.equal(evidence.reason, 'seller_sku_catalog_identity_conflict');
});
