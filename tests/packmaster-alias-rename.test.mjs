import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');

// Synthetic TikTok registry only. Names, IDs and SKUs are invented.
function tiktokSource(products) {
  const productList = [];
  const rows = [];
  for (const p of products) {
    const variants = p.variants || [];
    productList.push({
      platform: 'TIKTOK', productId: p.productId, productName: p.productName, sellerSku: p.sellerSku || null,
      variants: variants.map(v => ({ variantName: v.variantName, sellerSku: v.sellerSku || null }))
    });
    if (!variants.length) {
      rows.push({
        platform: 'TIKTOK', productId: p.productId, productName: p.productName, sellerSku: p.sellerSku || null,
        sellerSkuStatus: p.sellerSku ? 'present' : 'not_displayed', modelId: null, variantName: null,
        sourceRowType: 'product_sku'
      });
    }
    variants.forEach((v, i) => rows.push({
      platform: 'TIKTOK', productId: p.productId, productName: p.productName, sellerSku: v.sellerSku || null,
      sellerSkuStatus: v.sellerSku ? 'present' : 'not_displayed', modelId: null, variantName: v.variantName,
      sourceRowType: 'variant', variantOrdinal: i + 1
    }));
  }
  const withoutSku = productList.filter(p => !p.sellerSku && !p.variants.some(v => v.sellerSku));
  const present = rows.filter(row => row.sellerSku).length;
  return {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry', platform: 'TIKTOK',
    source: { shop: 'Synthetic TikTok Shop', captureDate: '2026-01-01' },
    products: productList, skuRows: rows,
    productsWithoutAnySellerSku: withoutSku.map(p => ({ productId: p.productId })),
    pages: [{ products: productList.length }],
    summary: {
      listedProductCount: productList.length, uniqueProductIdCount: productList.length,
      skuModelRowCount: rows.length, sellerSkuPresentRowCount: present,
      sellerSkuMissingInRowsCount: rows.length - present, productsWithoutAnySellerSkuCount: withoutSku.length
    }
  };
}

function tiktokIndex(products) {
  const store = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), tiktokSource(products));
  return identity.buildIndex(store, registryApi);
}

const gloves = name => [{
  productId: 'T-gloves', productName: name,
  variants: [{ variantName: '5 ห่อ' }, { variantName: '10 ห่อ' }]
}];

test('B5: an alias saved for a truncated text does not block the full text of the same row', () => {
  const catalog = tiktokIndex([...gloves('Synthetic Gloves Nitrile Pack Value')]);
  const truncated = { text: 'Synthetic Gloves Nitrile Pack Va... | 5 ห่อ' };
  const selected = { platform: 'TIKTOK', productId: 'T-gloves', productName: 'Synthetic Gloves Nitrile Pack Value', modelId: null, variantName: '5 ห่อ' };
  const assigned = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', truncated, selected, 'Gloves 5', identity);

  const full = { text: 'Synthetic Gloves Nitrile Pack Value | 5 ห่อ' };
  const actual = matcher.match(catalog, 'TIKTOK', full, assigned, identity);
  assert.equal(actual.status, 'matched', `expected matched, got ${actual.status} (${actual.reason})`);
  assert.equal(actual.rule.shortName, 'Gloves 5');

  const otherVariant = matcher.match(catalog, 'TIKTOK', { text: 'Synthetic Gloves Nitrile Pack Value | 10 ห่อ' }, assigned, identity);
  assert.notEqual(otherVariant.status, 'matched', 'the alias must not reach the 10 ห่อ row');
});

test('B5 with a Seller SKU: a SKU alias on a unique product still matches the same row by its exact full text', () => {
  const catalog = tiktokIndex([{ productId: 'T-lid', productName: 'Synthetic Cup Lid Set', variants: [{ variantName: '2 ชิ้น' }] }]);
  const selected = { platform: 'TIKTOK', productId: 'T-lid', productName: 'Synthetic Cup Lid Set', modelId: null, variantName: '2 ชิ้น' };
  const truncated = { text: 'Synthetic Cup Lid Se... | 2 ชิ้น | NEW-SKU-LID-1' };
  const assigned = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', truncated, selected, 'Lid 2', identity);
  const full = { text: 'Synthetic Cup Lid Set | 2 ชิ้น | NEW-SKU-LID-1' };
  const actual = matcher.match(catalog, 'TIKTOK', full, assigned, identity);
  assert.equal(actual.status, 'matched', `expected matched, got ${actual.status} (${actual.reason})`);
  assert.equal(actual.rule.shortName, 'Lid 2');
});

test('TikTok: an alias for the 2 pack variant does not block the 3 pack variant of the same product', () => {
  const catalog = tiktokIndex([{
    productId: 'T-cup', productName: 'Synthetic Cup Set Family Pack',
    variants: [{ variantName: '2 pack' }, { variantName: '3 pack' }]
  }]);
  const selected2 = { platform: 'TIKTOK', productId: 'T-cup', productName: 'Synthetic Cup Set Family Pack', modelId: null, variantName: '2 pack' };
  const selected3 = { ...selected2, variantName: '3 pack' };
  const item2 = { text: 'Synthetic Cup Set Family Pack | 2 pack' };
  const item3 = { text: 'Synthetic Cup Set Family Pack | 3 pack' };

  const withTwo = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', item2, selected2, 'Cup 2', identity);
  const blocked = matcher.match(catalog, 'TIKTOK', item3, withTwo, identity);
  assert.notEqual(blocked.reason, 'manual_alias_catalog_pair_mismatch', 'the 2 pack alias must not block the 3 pack item');
  assert.equal(blocked.status, 'unmatched', 'the 3 pack row is still unassigned, so it goes to Review');

  const withBoth = matcher.upsertManualSkuAlias(withTwo, catalog, 'TIKTOK', item3, selected3, 'Cup 3', identity);
  assert.equal(matcher.match(catalog, 'TIKTOK', item2, withBoth, identity).rule.shortName, 'Cup 2');
  assert.equal(matcher.match(catalog, 'TIKTOK', item3, withBoth, identity).rule.shortName, 'Cup 3');
});

test('TikTok: a 2 pack SKU alias does not block a 3 pack SKU that is not in the registry', () => {
  const catalog = tiktokIndex([{
    productId: 'T-cup', productName: 'Synthetic Cup Set Family Pack',
    variants: [{ variantName: '2 pack' }, { variantName: '3 pack' }]
  }]);
  const selected2 = { platform: 'TIKTOK', productId: 'T-cup', productName: 'Synthetic Cup Set Family Pack', modelId: null, variantName: '2 pack' };
  const withTwo = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK',
    { text: 'Synthetic Cup Set Family Pack | 2 pack | CUP-NEW-2' }, selected2, 'Cup 2 sku', identity);
  const three = matcher.match(catalog, 'TIKTOK', { text: 'Synthetic Cup Set Family Pack | 3 pack | CUP-NEW-3' }, withTwo, identity);
  assert.notEqual(three.reason, 'manual_alias_catalog_pair_mismatch');
  assert.equal(three.status, 'unmatched');
});

test('B6: a registry product rename keeps the alias re-bindable only with explicit confirmation, never silently', () => {
  const before = tiktokIndex([{ productId: 'T-pen', productName: 'Synthetic Gel Pen Blue', variants: [{ variantName: '2 ห่อ' }] }]);
  const selected = { platform: 'TIKTOK', productId: 'T-pen', productName: 'Synthetic Gel Pen Blue', modelId: null, variantName: '2 ห่อ' };
  const pdf = { text: 'Synthetic Gel Pen Blue | 2 ห่อ | PEN-PDF-7' };
  const assigned = matcher.upsertManualSkuAlias(matcher.newAssignments(), before, 'TIKTOK', pdf, selected, 'Pen 2', identity);
  assert.equal(matcher.match(before, 'TIKTOK', pdf, assigned, identity).status, 'matched');

  const renamed = tiktokIndex([{ productId: 'T-pen', productName: 'Synthetic Gel Pen Blue Renamed', variants: [{ variantName: '2 ห่อ' }] }]);
  const renamedSelected = { ...selected, productName: 'Synthetic Gel Pen Blue Renamed' };
  const stale = matcher.match(renamed, 'TIKTOK', pdf, assigned, identity);
  assert.equal(stale.status, 'ambiguous');
  assert.equal(stale.reason, 'registry_identity_changed');

  assert.throws(
    () => matcher.upsertManualSkuAlias(assigned, renamed, 'TIKTOK', pdf, renamedSelected, 'Pen 2', identity),
    /confirm|title/i,
    'a rebind without confirmation must not silently accept the new title'
  );

  const rebound = matcher.upsertManualSkuAlias(assigned, renamed, 'TIKTOK', pdf, renamedSelected, 'Pen 2', identity,
    { confirmedRegistryProductName: 'Synthetic Gel Pen Blue Renamed' });
  assert.equal(rebound.entries.length, 1, 'rebinding updates the same assignment instead of adding a row');
  assert.equal(rebound.entries[0].manualSkuRegistryProductName, 'Synthetic Gel Pen Blue Renamed');
  const after = matcher.match(renamed, 'TIKTOK', pdf, rebound, identity);
  assert.equal(after.status, 'matched', `expected matched after confirmed rebind, got ${after.status} (${after.reason})`);
  assert.equal(after.rule.shortName, 'Pen 2');
});

test('B6: a stale confirmation for a different title is refused', () => {
  const before = tiktokIndex([{ productId: 'T-pen', productName: 'Synthetic Gel Pen Blue', variants: [{ variantName: '2 ห่อ' }] }]);
  const selected = { platform: 'TIKTOK', productId: 'T-pen', productName: 'Synthetic Gel Pen Blue', modelId: null, variantName: '2 ห่อ' };
  const pdf = { text: 'Synthetic Gel Pen Blue | 2 ห่อ | PEN-PDF-7' };
  const assigned = matcher.upsertManualSkuAlias(matcher.newAssignments(), before, 'TIKTOK', pdf, selected, 'Pen 2', identity);
  const renamed = tiktokIndex([{ productId: 'T-pen', productName: 'Synthetic Gel Pen Blue Renamed', variants: [{ variantName: '2 ห่อ' }] }]);
  assert.throws(() => matcher.upsertManualSkuAlias(assigned, renamed, 'TIKTOK', pdf,
    { ...selected, productName: 'Synthetic Gel Pen Blue Renamed' }, 'Pen 2', identity,
    { confirmedRegistryProductName: 'Some other title' }), /confirm|title/i);
});

test('B6: after a rename, the old alias never attaches to a different row that now carries the old title', () => {
  const before = tiktokIndex([{ productId: 'T-pen', productName: 'Synthetic Gel Pen Blue', variants: [{ variantName: '2 ห่อ' }] }]);
  const selected = { platform: 'TIKTOK', productId: 'T-pen', productName: 'Synthetic Gel Pen Blue', modelId: null, variantName: '2 ห่อ' };
  const pdf = { text: 'Synthetic Gel Pen Blue | 2 ห่อ | PEN-PDF-7' };
  const assigned = matcher.upsertManualSkuAlias(matcher.newAssignments(), before, 'TIKTOK', pdf, selected, 'Pen 2', identity);
  const swapped = tiktokIndex([
    { productId: 'T-pen', productName: 'Synthetic Gel Pen Blue Renamed', variants: [{ variantName: '2 ห่อ' }] },
    { productId: 'T-new', productName: 'Synthetic Gel Pen Blue', variants: [{ variantName: '2 ห่อ' }] }
  ]);
  const result = matcher.match(swapped, 'TIKTOK', pdf, assigned, identity);
  assert.notEqual(result.status, 'matched', 'the alias is bound to T-pen, not to whichever row now has the old title');
  assert.notEqual(result.assignment?.productId, 'T-new', 'no assignment may point at the other row');
  const newTitleText = matcher.match(swapped, 'TIKTOK', { text: 'Synthetic Gel Pen Blue Renamed | 2 ห่อ' }, assigned, identity);
  assert.notEqual(newTitleText.assignment?.productId, 'T-new');
});

test('B5 guard: the exact full text of an alias row is refused when its Seller SKU carries a different name', () => {
  const catalog = tiktokIndex([{ productId: 'T-mug', productName: 'Synthetic Mug Set', variants: [{ variantName: '7 ชิ้น', sellerSku: 'MUG-SKU-7' }] }]);
  const store = matcher.validateAssignments({
    ...matcher.newAssignments(),
    version: 2,
    entries: [
      { platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'MUG-SKU-7', productId: 'T-mug', modelId: null, variantName: null, shortName: 'Mug SKU' },
      { platform: 'TIKTOK', identityType: 'catalog_row', sellerSku: null, productId: 'T-mug', modelId: null, variantName: '7 ชิ้น', shortName: 'Mug Alias',
        manualSkuAliases: [{ sellerSku: 'MUG-PDF-X', productText: 'Synthetic Mug Se...', variantText: '7 ชิ้น' }],
        manualSkuRegistryProductName: 'Synthetic Mug Set' }
    ]
  });
  // The alias was saved for the truncated text; the full text with the same SKU reaches the same row.
  const result = matcher.match(catalog, 'TIKTOK', { text: 'Synthetic Mug Set | 7 ชิ้น | MUG-PDF-X' }, store, identity);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.reason, 'registry_name_conflict_or_stale');
});

test('B6 guard: after a rename, the new title alone does not match an alias saved under the old title until confirmed', () => {
  const before = tiktokIndex([{ productId: 'T-pen', productName: 'Synthetic Gel Pen Blue', variants: [{ variantName: '2 ห่อ' }] }]);
  const selected = { platform: 'TIKTOK', productId: 'T-pen', productName: 'Synthetic Gel Pen Blue', modelId: null, variantName: '2 ห่อ' };
  const assigned = matcher.upsertManualSkuAlias(matcher.newAssignments(), before, 'TIKTOK',
    { text: 'Synthetic Gel Pen Blue | 2 ห่อ | PEN-PDF-7' }, selected, 'Pen 2', identity);
  const renamed = tiktokIndex([{ productId: 'T-pen', productName: 'Synthetic Gel Pen Blue Renamed', variants: [{ variantName: '2 ห่อ' }] }]);
  const result = matcher.match(renamed, 'TIKTOK', { text: 'Synthetic Gel Pen Blue Renamed | 2 ห่อ' }, assigned, identity);
  assert.notEqual(result.status, 'matched', 'the stored title is stale until the user confirms the rebind');
  assert.equal(result.reason, 'registry_identity_changed', 'the reason points at the title change, not a text mismatch');
});

test('B5 guard: an alias is not reached by a PDF Seller SKU it was not saved with', () => {
  const catalog = tiktokIndex([{ productId: 'T-lid', productName: 'Synthetic Cup Lid Set', variants: [{ variantName: '2 ชิ้น' }] }]);
  const selected = { platform: 'TIKTOK', productId: 'T-lid', productName: 'Synthetic Cup Lid Set', modelId: null, variantName: '2 ชิ้น' };
  const withSku = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK',
    { text: 'Synthetic Cup Lid Se... | 2 ชิ้น | NEW-SKU-LID-1' }, selected, 'Lid 2', identity);
  const otherSku = matcher.match(catalog, 'TIKTOK', { text: 'Synthetic Cup Lid Set | 2 ชิ้น | OTHER-SKU-9' }, withSku, identity);
  assert.notEqual(otherSku.status, 'matched', 'a different PDF SKU must not attach to the alias row');
  const noSku = matcher.match(catalog, 'TIKTOK', { text: 'Synthetic Cup Lid Set | 2 ชิ้น' }, withSku, identity);
  assert.notEqual(noSku.status, 'matched', 'a SKU-less PDF line must not attach to an alias saved with a SKU');

  const textOnly = matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK',
    { text: 'Synthetic Cup Lid Se... | 2 ชิ้น' }, selected, 'Lid text', identity);
  assert.equal(matcher.match(catalog, 'TIKTOK', { text: 'Synthetic Cup Lid Set | 2 ชิ้น' }, textOnly, identity).rule.shortName, 'Lid text');
  assert.notEqual(matcher.match(catalog, 'TIKTOK', { text: 'Synthetic Cup Lid Set | 2 ชิ้น | NEW-SKU-LID-1' }, textOnly, identity).status, 'matched',
    'a text-only alias must not attach to a line that carries a Seller SKU');
});
