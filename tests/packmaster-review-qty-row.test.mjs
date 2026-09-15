import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const api = require('../packmaster-review-overrides.js');

const order = {
  id: 'order-dup-text',
  parsedItems: [
    { text: 'SKU SAME', qty: 1 },
    { text: 'SKU SAME', qty: 2 }
  ],
  reviewQtyOverrides: []
};

const updated = api.upsertQtyOverride(order, order.parsedItems[0], 0, 3);
assert.equal(api.getEffectiveItemQty(updated, updated.parsedItems[0], 0), 3);
assert.equal(api.getEffectiveItemQty(updated, updated.parsedItems[1], 1), 2, 'row-0 override must not leak to identical row-1 text');
assert.equal(updated.reviewQtyOverrides[0].itemKey, 'row:0');
assert.equal(updated.reviewQtyOverrides[0].sourceText, 'SKU SAME');
const legacyAmbiguous = { ...order, reviewQtyOverrides: [{ sourceText: 'SKU SAME', qty: 9 }] };
assert.equal(api.getEffectiveItemQty(legacyAmbiguous, legacyAmbiguous.parsedItems[0], 0), 1, 'ambiguous legacy text-only override must fail safe');
assert.equal(api.getEffectiveItemQty(legacyAmbiguous, legacyAmbiguous.parsedItems[1], 1), 2);

const singleLegacy = {
  id: 'single',
  parsedItems: [{ text: 'SKU ONLY', qty: 1 }],
  reviewQtyOverrides: [{ sourceText: 'SKU ONLY', qty: 4 }]
};
assert.equal(api.getEffectiveItemQty(singleLegacy, singleLegacy.parsedItems[0], 0), 4, 'single-row legacy override remains backward compatible');
console.log('PackMaster item-level Qty override row identity tests passed');
import fs from 'node:fs';
const html = fs.readFileSync('index.html', 'utf8');
assert.ok(html.includes('const itemKey=reviewOverridesApi?reviewOverridesApi.getItemKey(index):`row:${index}`;'), 'Qty draft UI must key by item row, not display text');
assert.ok(html.includes('[itemKey]:e.target.value'), 'duplicate text rows must keep independent draft values');
assert.ok(html.includes('upsertQtyOverride(current, entry.item, entry.itemIndex, entry.qty)'), 'saved Qty corrections must persist row identity');