import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const safety = require('../packmaster-pilot-safety.js');

test('print safety blocks any unresolved exception order', () => {
  assert.equal(safety.hasBlockingExceptions([]), false);
  assert.equal(safety.hasBlockingExceptions([{ types: ['UNMAPPED'] }]), true);
  assert.equal(safety.hasBlockingExceptions([{ types: ['REVIEW_SKU', 'REVIEW_QTY'] }]), true);
});

test('effective batch status prioritizes exceptions over printedAt', () => {
  assert.equal(safety.getEffectiveBatchStatus({ totalOrders: 0, status: 'COMPLETED', printedAt: '2026-08-08T00:00:00.000Z' }), 'WAITING');
  assert.equal(safety.getEffectiveBatchStatus({ totalOrders: 10, readyCount: 7, unmappedCount: 3, status: 'COMPLETED', printedAt: '2026-08-08T00:00:00.000Z' }), 'REVIEW');
  assert.equal(safety.getEffectiveBatchStatus({ totalOrders: 10, readyCount: 10, reviewSkuCount: 0, reviewQtyCount: 0, unmappedCount: 0, status: 'COMPLETED', printedAt: '2026-08-08T00:00:00.000Z' }), 'COMPLETED');
  assert.equal(safety.getEffectiveBatchStatus({ totalOrders: 10, readyCount: 10, reviewSkuCount: 0, reviewQtyCount: 0, unmappedCount: 0, status: 'READY', printedAt: null }), 'READY');
});

test('SKU exception fix only prefills a single unambiguous unresolved product identity', () => {
  const single = { types: ['UNMAPPED'], order: { parsedItems: [{ text: 'HOYA Baby 5 packs purple', qty: 2 }] } };
  assert.equal(safety.getSkuFixSeed(single), 'HOYA Baby 5 packs purple');

  const multi = {
    types: ['UNMAPPED'],
    order: {
      parsedItems: [
        { text: 'HOYA Baby 5 packs purple', qty: 2 },
        { text: 'HAKU Cooling 1 pack', qty: 1 }
      ]
    }
  };
  assert.equal(safety.getSkuFixSeed(multi), '', 'do not guess which SKU is unresolved without a resolver');

  const resolver = (text) => text.includes('HAKU') ? { status: 'unmatched' } : { status: 'matched', rule: { shortName: 'known' } };
  assert.equal(safety.getSkuFixSeed(multi, resolver), 'HAKU Cooling 1 pack');

  const ambiguousResolver = () => ({ status: 'unmatched' });
  assert.equal(safety.getSkuFixSeed(multi, ambiguousResolver), '', 'multiple unresolved items require manual review');
  assert.equal(safety.getSkuFixSeed({ types: ['REVIEW_QTY'], order: multi.order }, resolver), '');
  assert.equal(safety.getSkuFixSeed({ types: ['UNMAPPED'], order: { parsedItems: [] } }, resolver), '');
});
