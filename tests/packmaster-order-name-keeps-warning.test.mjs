// Ticket 20: "ใช้ชื่อเฉพาะ Order นี้" names one order only. It must not acknowledge the order-wide
// SKU parser warning. Only the user's separate SKU confirmation may clear that warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const reviewApi = require('../packmaster-review-overrides.js');

test('the order-only naming handler never confirms the SKU review', () => {
  const start = html.indexOf('const handleApplyQuickOrderName = async () => {');
  const end = html.indexOf('// The single re-read-before-write guard', start);
  assert.ok(start > 0 && end > start, 'order-only naming handler must be locatable');
  assert.doesNotMatch(html.slice(start, end), /confirmReview\(/,
    'naming one order must not call confirmReview, which would clear the order-wide SKU warning');
});

test('naming one order keeps the parser SKU warning, and the separate confirmation clears it', async () => {
  const start = html.indexOf('const handleApplyQuickOrderName = async () => {');
  const end = html.indexOf('// The single re-read-before-write guard', start);
  const handler = html.slice(start, end);

  const order = {
    id: 'synthetic-order-20',
    platform: 'SHOPEE',
    parserWarning: true,
    parsedItems: [{ text: 'SYNTHETIC SKU TEXT', qty: 1 }]
  };
  const updates = [];
  const sandbox = {
    quickMapState: {
      shortName: 'Synthetic order name',
      sourceText: 'SYNTHETIC SKU TEXT',
      itemIndex: 0,
      row: { order, types: ['REVIEW_SKU'] }
    },
    reviewOverridesApi: reviewApi,
    resetActiveBatchCompletion: async () => true,
    setOrders(updater) { updates.push(updater([order])); },
    setQuickMapState() {},
    showToast() {}
  };
  vm.createContext(sandbox);
  await vm.runInContext(`${handler}\nhandleApplyQuickOrderName();`, sandbox);

  assert.equal(updates.length, 1, 'the order must be updated exactly once');
  const [afterName] = updates[0];
  assert.equal(afterName.manualSkuOverrides.length, 1, 'the name must be saved for this order');
  assert.equal(afterName.parserWarning, true, 'the order-wide parser warning must still be present');
  assert.equal(reviewApi.getReviewAcknowledgement(afterName, 'sku'), false,
    'the SKU warning must stay unacknowledged after naming only this order');

  const confirmed = reviewApi.confirmReview(afterName, 'sku', '2026-11-13T00:00:00.000Z');
  assert.equal(reviewApi.getReviewAcknowledgement(confirmed, 'sku'), true,
    'the user\'s separate SKU confirmation must clear the warning');
  assert.equal(confirmed.parserWarning, true, 'the confirmation records the user check without rewriting parser data');
});

test('the SKU confirmation checkbox is wired to its own explicit action', () => {
  assert.match(html, /handleSetReviewConfirmation\('sku',e\.target\.checked\)/,
    'the SKU checkbox must remain the explicit confirmation path');
});
