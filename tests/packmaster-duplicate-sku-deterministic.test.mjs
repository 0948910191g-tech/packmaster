import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
function catalog() {
  const products = [3, 6, 12].map(quantity => ({
    platform: 'TIKTOK', productId: `product-${quantity}`,
    productName: `Excare Pet ${quantity} ห่อ`,
    variantName: 'Default', sellerSku: 'Excare Pet 50แผ่น x 3ห่อ'
  }));
  return identity.buildIndex({ platforms: {
    TIKTOK: { skuRows: products }, SHOPEE: { skuRows: [] }
  } }, { validateStore: store => store });
}
test('duplicate SKU: exact catalog identity preserves each product name', () => {
  const index = catalog();
  let assignments = matcher.newAssignments();
  for (const quantity of [3, 6, 12]) {
    const item = { text: `Excare Pet ${quantity} ห่อ | Default | Excare Pet 50แผ่น x 3ห่อ` };
    const evidence = identity.resolve(index, 'TIKTOK', item);
    assert.equal(evidence.status, 'found');
    assert.equal(evidence.identityType, 'catalog_row');
    assert.ok(evidence.sellerSku);
    const name = `Excare Pet ${quantity} ห่อ`;
    assignments = matcher.upsertAssignment(assignments, 'TIKTOK', evidence, name);
    const actual = matcher.match(index, 'TIKTOK', item, assignments, identity);
    assert.equal(actual.status, 'matched');
    assert.equal(actual.rule.shortName, name);
    assert.equal(actual.identityType, 'catalog_row');
  }
  assert.equal(assignments.entries.length, 3);
});
test('ambiguous SKU without catalog evidence stays ambiguous', () => {
  assert.equal(matcher.match(catalog(), 'TIKTOK',
    { sellerSku: 'Excare Pet 50แผ่น x 3ห่อ' },
    matcher.newAssignments(), identity).status, 'ambiguous');
});
test('unidentified product does not match by fuzzy name', () => {
  assert.equal(matcher.match(catalog(), 'TIKTOK',
    { text: 'Excare Pet 3 ห่อ' },
    matcher.newAssignments(), identity).status, 'unmatched');
});
test('unique SKU remains supported', () => {
  const row = { platform: 'TIKTOK', productId: 'p1', productName: 'Unique', sellerSku: 'SAFE-SKU' };
  const index = identity.buildIndex({ platforms: {
    TIKTOK: { skuRows: [row] }, SHOPEE: { skuRows: [] }
  } }, { validateStore: store => store });
  const item = { sellerSku: 'SAFE-SKU' };
  const evidence = identity.resolve(index, 'TIKTOK', item);
  const store = matcher.upsertAssignment(matcher.newAssignments(), 'TIKTOK', evidence, 'ชื่อเดิม');
  assert.equal(matcher.match(index, 'TIKTOK', item, store, identity).rule.shortName, 'ชื่อเดิม');
});
