import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../packmaster-review-overrides.js');

test('review acknowledgement is per-order and preserves raw warnings', () => {
  assert.equal(api.getReviewAcknowledgement({}, 'sku'), false);
  assert.equal(api.getReviewAcknowledgement({}, 'qty'), false);

  const source = { id: 'A', parserWarning: true, qtyWarning: true };
  const skuConfirmed = api.confirmReview(source, 'sku', '2026-08-10T00:00:00.000Z');
  assert.equal(source.reviewAcknowledgements, undefined, 'helper must not mutate source order');
  assert.equal(skuConfirmed.parserWarning, true, 'raw parser warning must remain for audit');
  assert.equal(skuConfirmed.qtyWarning, true, 'unrelated raw qty warning must remain');
  assert.equal(api.getReviewAcknowledgement(skuConfirmed, 'sku'), true);
  assert.equal(api.getReviewAcknowledgement(skuConfirmed, 'qty'), false);
  assert.equal(skuConfirmed.reviewAcknowledgements.sku.confirmedAt, '2026-08-10T00:00:00.000Z');

  const qtyConfirmed = api.confirmReview(skuConfirmed, 'qty', '2026-08-10T00:01:00.000Z');
  assert.equal(api.getReviewAcknowledgement(qtyConfirmed, 'sku'), true);
  assert.equal(api.getReviewAcknowledgement(qtyConfirmed, 'qty'), true);
  assert.equal(qtyConfirmed.parserWarning, true);
  assert.equal(qtyConfirmed.qtyWarning, true);

  const reopened = api.clearReviewConfirmation(qtyConfirmed, 'sku');
  assert.equal(api.getReviewAcknowledgement(reopened, 'sku'), false);
  assert.equal(api.getReviewAcknowledgement(reopened, 'qty'), true);
  assert.equal(reopened.parserWarning, true);
});

test('qty correction stays in review layer and does not mutate parsed qty', () => {
  const source = {
    id: 'Q',
    qtyWarning: true,
    parsedItems: [{ text: 'SKU A', qty: 1 }]
  };

  const corrected = api.upsertQtyOverride(source, 'SKU A', 3);
  assert.equal(source.reviewQtyOverrides, undefined, 'helper must not mutate source order');
  assert.equal(source.parsedItems[0].qty, 1, 'raw parsed qty must remain untouched');
  assert.equal(corrected.qtyWarning, true, 'raw warning remains for audit');
  assert.deepEqual(api.getQtyOverride(corrected, 'SKU A'), { sourceText: 'SKU A', qty: 3 });
  assert.equal(api.getEffectiveItemQty(corrected, source.parsedItems[0]), 3);

  const replaced = api.upsertQtyOverride(corrected, 'SKU   A', 4);
  assert.equal(replaced.reviewQtyOverrides.length, 1, 'normalized upsert must replace instead of duplicate');
  assert.equal(api.getEffectiveItemQty(replaced, { text: 'SKU A', qty: 1 }), 4);
  assert.equal(api.getEffectiveItemQty(replaced, { text: 'SKU B', qty: 2 }), 2);

  assert.throws(() => api.upsertQtyOverride(source, 'SKU A', 0), /positive integer/i);
  assert.throws(() => api.upsertQtyOverride(source, 'SKU A', 1.5), /positive integer/i);
});
