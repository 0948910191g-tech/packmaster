import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');

test('loads Review UX sidecars before the app uses them', () => {
  assert.ok(html.includes('<script src="./packmaster-review-keyword-suggestions.js"></script>'));
  assert.ok(html.includes('<script src="./packmaster-batch-source-files.js"></script>'));
  assert.ok(html.includes('window.PackMasterReviewKeywordSuggestions'));
  assert.ok(html.includes('window.PackMasterBatchSourceFiles'));
});

test('Batch cards expose contained source PDF filenames', () => {
  assert.ok(html.includes('data-pm-batch-source-files'), 'Batch card needs a stable source-file marker');
  assert.ok(html.includes('summarizeBatchSourceFiles'), 'Batch source labels must come from the sidecar helper');
  assert.ok(html.includes('batchApi.loadBatch'), 'Batch cards must derive filenames from persisted batch orders without changing batch schema');
});

test('Review modal shows original PDF page beside review controls', () => {
  assert.ok(html.includes('data-pm-review-original-pdf'));
  assert.ok(html.includes('quickMapState.row?.order?.pdfImage') || html.includes('quickMapState.row.order.pdfImage'));
  assert.ok(html.includes('sourceFileName'));
  assert.ok(html.includes('sourcePage'));
  assert.ok(html.includes('lg:grid-cols-'), 'desktop Review modal must use a side-by-side layout');
});

test('Review modal exposes advisory Keyword choices without auto-fill', () => {
  assert.ok(html.includes('reviewKeywordSuggestionsApi.generateReviewKeywordSuggestions'));
  assert.ok(html.includes('data-pm-keyword-suggestion'));
  assert.match(html, /setQuickMapState\(\{[^}]*keyword:\s*''/s, 'opening Review must keep Keyword blank until user clicks a recommendation');
});

test('SKU and Qty warnings can be confirmed or corrected per Order', () => {
  assert.ok(html.includes('data-pm-review-confirm-sku'));
  assert.ok(html.includes('data-pm-review-confirm-qty'));
  assert.ok(html.includes('reviewOverridesApi.confirmReview'));
  assert.ok(html.includes('data-pm-review-qty-override'));
  assert.ok(html.includes('reviewOverridesApi.upsertQtyOverride'));
  assert.ok(html.includes('reviewOverridesApi.getEffectiveItemQty'), 'display/aggregation must use effective review qty while raw parsed qty stays untouched');
});

test('saving a valid Qty correction resolves the Qty review in the same action', () => {
  const start = html.indexOf('const handleSaveQtyReviewCorrections = () => {');
  const end = html.indexOf('const handleApplyQuickOrderName = () => {', start);
  assert.ok(start >= 0 && end > start, 'Qty correction handler must exist');
  const handler = html.slice(start, end);
  assert.ok(handler.includes("reviewOverridesApi.confirmReview(next, 'qty')"), 'valid Qty correction must confirm the corrected Qty without a second manual click');
  assert.doesNotMatch(handler, /ติ๊ก.*Qty ถูกต้อง.*ปิด Exception/s, 'successful Qty correction must not instruct the user to perform a redundant second confirmation');
});

test('Review card and table show effective Qty after a Review-layer correction', () => {
  const effectiveFirst = (html.match(/order\.originalQty\|\|\(order\.parsedItems\|\|\[\]\)\.reduce/g) || []).length;
  assert.ok(effectiveFirst >= 2, 'both Review table and Review cards must prefer effective order.originalQty over raw parsed Qty');
});

test('Review flow offers a single inspect action for SKU and Qty exceptions', () => {
  assert.ok(html.includes('data-pm-action="review-exception"'));
  assert.ok(html.includes('ตรวจรายการ'));
});
