import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const manual = require('../packmaster-manual-items.js');
const overrides = require('../packmaster-review-overrides.js');
const exceptions = require('../packmaster-exceptions.js');

// Synthetic unreadable order: the parser found no line items, but the order itself is real.
const unreadable = () => ({
  id: 'order-unreadable-1',
  tracking: 'TH0000000001',
  orderId: 'SYN-ORDER-1',
  platform: 'SHOPEE',
  sourceFileName: 'synthetic-batch.pdf',
  sourcePage: 2,
  pdfImage: null,
  parsedItems: [],
  declaredTotalQty: null,
  parserWarning: true,
  isContinuation: false
});

const CUSTOMER_FIELDS = ['id', 'tracking', 'orderId', 'platform', 'sourceFileName', 'sourcePage', 'pdfImage', 'declaredTotalQty', 'parserWarning', 'isContinuation'];

// 1. Only a non-continuation order with zero parsed items is unreadable.
assert.equal(manual.isUnreadableOrder(unreadable()), true, 'zero-item order must be unreadable');
assert.equal(manual.isUnreadableOrder({ ...unreadable(), isContinuation: true }), false, 'continuation pages belong to a parent order');
assert.equal(manual.isUnreadableOrder({ ...unreadable(), parsedItems: [{ text: 'SKU A', qty: 1 }] }), false, 'readable order must not take manual entry');

// 2. Validation fails safe: text and integer qty >= 1 are required.
assert.equal(manual.buildManualItems([]).ok, false, 'empty entry list must be rejected');
assert.equal(manual.buildManualItems([{ text: '   ', qty: '1', shortName: '' }]).ok, false, 'blank item text must be rejected');
for (const bad of ['0', '-1', '1.5', 'abc', '']) {
  assert.equal(manual.buildManualItems([{ text: 'SKU A', qty: bad, shortName: '' }]).ok, false, `qty ${JSON.stringify(bad)} must be rejected`);
}
const built = manual.buildManualItems([{ text: '  SKU   A ', qty: ' 3 ', shortName: ' ม่วง10 ' }]);
assert.equal(built.ok, true);
assert.equal(built.items[0].text, 'SKU A', 'text is whitespace-normalized');
assert.equal(built.items[0].qty, 3, 'qty is parsed as an integer');
assert.equal(built.items[0].shortName, 'ม่วง10');

// 3. Adding items fills parsedItems, marks every item as a manual edit, keeps customer data untouched.
const before = unreadable();
const after = manual.applyManualItems(before, [
  { text: 'SKU A', qty: '2', shortName: 'ม่วง10' },
  { text: 'SKU B', qty: '1', shortName: '' }
], '2026-11-13T02:00:00.000Z');
assert.equal(before.parsedItems.length, 0, 'applyManualItems must not mutate the input order');
assert.equal(after.parsedItems.length, 2);
assert.equal(after.parsedItems[0].manualEntry, true, 'added items must be flagged as manual edits');
assert.equal(after.parsedItems[1].manualEntry, true);
assert.equal(manual.hasManualItems(after), true);
assert.equal(manual.hasManualItems(before), false);
assert.equal(after.manualItemsAddedAt, '2026-11-13T02:00:00.000Z');
for (const field of CUSTOMER_FIELDS) {
  assert.deepEqual(after[field], before[field], `customer/source field ${field} must stay untouched`);
}
assert.equal(manual.isUnreadableOrder(after), false, 'once items exist the order is no longer unreadable');
const untouched = manual.applyManualItems(after, [{ text: 'X', qty: '1', shortName: '' }], '2026-11-13T02:00:00.000Z');
assert.equal(untouched, after, 'applyManualItems is a no-op for an order that is not unreadable');

// 4. Manual names resolve through the existing per-row override path.
assert.equal(overrides.getManualSkuOverride(after, 'SKU A', 0).shortName, 'ม่วง10', 'named manual item resolves via manualSkuOverrides');
assert.equal(overrides.getManualSkuOverride(after, 'SKU B', 1), null, 'unnamed manual item stays unresolved');

// 5. Readiness, composed the same way index.html does it.
// Before: unreadable order is in review.
const emptyDisplay = { ...before, displayItems: ['• ⚠️ ตรวจสอบ SKU', '• ⚠️ ตรวจสอบ Qty'], originalQty: 0, qtyWarning: true, unresolvedSku: true, parserWarning: true };
assert.equal(exceptions.getExceptionFlags(emptyDisplay).ready, false, 'unreadable order must not be ready');

// Named manual items, acknowledged by the reviewer as one action (as the save handler does).
const named = manual.applyManualItems(before, [{ text: 'SKU A', qty: '2', shortName: 'ม่วง10' }], '2026-11-13T02:00:00.000Z');
const acked = overrides.confirmReview(overrides.confirmReview(named, 'sku', '2026-11-13T02:01:00.000Z'), 'qty', '2026-11-13T02:01:00.000Z');
const namedDisplay = { ...acked, displayItems: ['ม่วง10 x2'], originalQty: 2, qtyWarning: true, unresolvedSku: false };
assert.equal(exceptions.getExceptionFlags(namedDisplay).ready, true, 'named and acknowledged manual items must be print-ready');
assert.equal(exceptions.getExceptionFlags(namedDisplay).reviewSku, false);
assert.equal(exceptions.getExceptionFlags(namedDisplay).reviewQty, false);

// Acknowledging without names is not enough: the item is still unmapped.
const unnamed = manual.applyManualItems(before, [{ text: 'SKU A', qty: '2', shortName: '' }], '2026-11-13T02:00:00.000Z');
const unnamedAcked = overrides.confirmReview(overrides.confirmReview(unnamed, 'sku', '2026-11-13T02:01:00.000Z'), 'qty', '2026-11-13T02:01:00.000Z');
const unnamedDisplay = { ...unnamedAcked, displayItems: ['ยังไม่ตั้งชื่อ'], originalQty: 2, qtyWarning: true, unresolvedSku: false };
assert.equal(exceptions.getExceptionFlags(unnamedDisplay).ready, false, 'unnamed manual item must not be ready');
assert.equal(exceptions.getExceptionFlags(unnamedDisplay).unmapped, true);

// 6. Survives reload: the batch save path serializes orders as JSON.
const reloaded = JSON.parse(JSON.stringify(acked));
assert.deepEqual(reloaded, acked, 'manual items and acknowledgements must round-trip through JSON');
assert.equal(exceptions.getExceptionFlags({ ...reloaded, displayItems: ['ม่วง10 x2'], originalQty: 2, qtyWarning: true, unresolvedSku: false }).ready, true);

// 7. index.html wiring: module loaded, UI entry point, save path uses the existing guards and confirmations.
const html = fs.readFileSync('index.html', 'utf8');
assert.ok(html.includes('<script src="./packmaster-manual-items.js"></script>'), 'index.html must load the manual items helper');
assert.ok(html.includes('const manualItemsApi = window.PackMasterManualItems;'), 'index.html must bind the helper');
assert.ok(html.includes('data-pm-manual-items'), 'manual items dialog must expose a stable marker');
assert.ok(html.includes('เพิ่มรายการสินค้าเอง'), 'manual items dialog must use Review Thai copy');
assert.ok(html.includes('manualItemsApi.isUnreadableOrder(row.order)'), 'Review exception entry must route unreadable orders to manual entry');
assert.ok(html.includes('manualItemsApi.planManualItemsSave('), 'save path must use the helper');
assert.match(html, /const handleSaveManualItems = async \(\) => \{[\s\S]*?await resetActiveBatchCompletion\(\)[\s\S]*?setOrders\(/, 'save must reset completed batch state before writing orders');
assert.match(html, /handleSaveManualItems = async[\s\S]*?reviewOverridesApi\.confirmReview\(next, 'sku'[\s\S]*?reviewOverridesApi\.confirmReview\(next, 'qty'/, 'save must acknowledge SKU and Qty like the existing Review flows');

// 8. Production smoke checks the helper is deployed, like the other Review helpers.
const workflow = fs.readFileSync('.github/workflows/production-smoke.yml', 'utf8');
assert.ok(workflow.includes("grep -Fq './packmaster-manual-items.js' <<< \"$html\""), 'production smoke must verify the manual items helper is deployed');

// 9. Source hygiene: no literal invisible characters in the helper (use \u escapes like the other helpers).
const moduleSource = fs.readFileSync(new URL('../packmaster-manual-items.js', import.meta.url), 'utf8');
for (const code of [0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0xFEFF, 0x00A0]) {
  assert.equal(moduleSource.includes(String.fromCharCode(code)), false, `helper must use an escape, not literal U+${code.toString(16).toUpperCase()}`);
}

// 10. Stale save: the order was deleted, filled in another tab, or no longer unreadable.
const STALE_MESSAGE = 'ออเดอร์นี้ถูกแก้ไขแล้ว กรุณาโหลดหน้าใหม่';
const rowsOk = [{ text: 'SKU A', qty: '2', shortName: '' }];
const deleted = manual.planManualItemsSave(undefined, rowsOk, {});
assert.equal(deleted.ok, false);
assert.equal(deleted.reason, 'stale');
assert.equal(deleted.error, STALE_MESSAGE);
const alreadyFilled = manual.planManualItemsSave(after, rowsOk, {});
assert.equal(alreadyFilled.reason, 'stale', 'an order that already has items must not be overwritten');
assert.equal(alreadyFilled.error, STALE_MESSAGE);
const fresh = manual.planManualItemsSave(before, rowsOk, { now: '2026-11-13T02:00:00.000Z' });
assert.equal(fresh.ok, true);
assert.equal(fresh.order.parsedItems[0].manualEntry, true);

// 11. Validation reports the offending row and field so the UI can focus it.
const badText = manual.planManualItemsSave(before, [{ text: 'SKU A', qty: '1', shortName: '' }, { text: '  ', qty: '1', shortName: '' }], {});
assert.equal(badText.reason, 'invalid');
assert.equal(badText.rowIndex, 1);
assert.equal(badText.field, 'text');
const badQty = manual.planManualItemsSave(before, [{ text: 'SKU A', qty: '0', shortName: '' }], {});
assert.equal(badQty.reason, 'invalid');
assert.equal(badQty.rowIndex, 0);
assert.equal(badQty.field, 'qty');

// 12. Declared total from the PDF: a mismatch needs an explicit extra confirmation, a match does not.
const declared = { ...unreadable(), declaredTotalQty: 5 };
const twoRows = [{ text: 'SKU A', qty: '2', shortName: '' }, { text: 'SKU B', qty: '2', shortName: '' }];
const needsConfirm = manual.planManualItemsSave(declared, twoRows, {});
assert.equal(needsConfirm.ok, false, 'sum 4 vs declared 5 must not save silently');
assert.equal(needsConfirm.reason, 'qty_mismatch');
assert.equal(needsConfirm.total, 4);
assert.equal(needsConfirm.declaredTotalQty, 5);
const confirmedMismatch = manual.planManualItemsSave(declared, twoRows, { qtyMismatchConfirmed: true, now: '2026-11-13T02:00:00.000Z' });
assert.equal(confirmedMismatch.ok, true, 'explicit confirmation allows a mismatched total');
assert.equal(confirmedMismatch.order.parsedItems.length, 2);
const matchingTotal = manual.planManualItemsSave(declared, [{ text: 'SKU A', qty: '5', shortName: '' }], { now: '2026-11-13T02:00:00.000Z' });
assert.equal(matchingTotal.ok, true, 'a matching total needs no extra confirmation');
assert.equal(manual.planManualItemsSave(unreadable(), twoRows, { now: '2026-11-13T02:00:00.000Z' }).ok, true, 'no declared total means no mismatch check');
const summary = manual.summarizeManualQty(twoRows, 5);
assert.equal(summary.total, 4);
assert.equal(summary.declaredTotalQty, 5);
assert.equal(summary.mismatch, true);
assert.equal(manual.summarizeManualQty(twoRows, null).mismatch, false);
assert.equal(manual.summarizeManualQty([{ text: 'A', qty: 'x' }], 5).mismatch, false, 'an incomplete qty is not reported as a mismatch yet');

// 13. A manual-item order survives the workspace backup validator and a JSON round trip unchanged.
const workspace = require('../packmaster-workspace.js');
const saved = manual.applyManualItems(before, [{ text: 'SKU A', qty: '2', shortName: 'ม่วง10' }], '2026-11-13T02:00:00.000Z');
const backup = workspace.createBackup({
  appVersion: 'ticket-12',
  settings: {},
  skuRules: [],
  batches: [{ id: 'batch-manual-1', printedAt: null }],
  batchOrders: [{ batchId: 'batch-manual-1', orders: [saved] }]
}, new Date('2026-11-13T03:00:00.000Z'));
const restoredBackup = JSON.parse(JSON.stringify(backup));
assert.doesNotThrow(() => workspace.validateBackup(restoredBackup));
assert.deepEqual(restoredBackup.batchOrders[0].orders[0], saved, 'manual-item order must round-trip through backup unchanged');

// 14. index.html wiring for focus management, labels, the name warning, the qty confirmation and the save guard.
assert.ok(html.includes('aria-labelledby="pm-manual-items-title"'), 'dialog must be labelled by its heading');
assert.ok(html.includes('id="pm-manual-items-title"'), 'dialog heading must have the id it references');
assert.ok(html.includes('htmlFor={`pm-manual-text-${entry.uid}`}'), 'row text label must point at its input');
assert.ok(html.includes('htmlFor={`pm-manual-qty-${entry.uid}`}'), 'row qty label must point at its input');
assert.ok(html.includes('htmlFor={`pm-manual-name-${entry.uid}`}'), 'row name label must point at its input');
assert.ok(html.includes('data-pm-manual-item-name-warning'), 'unknown internal name must show a non-blocking warning');
assert.ok(html.includes('จำนวนไม่ตรงกับยอดรวมในใบ ยืนยันแล้ว'), 'mismatch confirmation copy must be explicit');
assert.ok(html.includes('id="pm-manual-qty-confirm"'), 'mismatch confirmation checkbox must be focusable by id');
assert.ok(html.includes('disabled={manualItemsState.saving}'), 'save button must be disabled while a save is in flight');
assert.ok(html.includes('ยกเลิกโดยไม่บันทึกรายการที่กรอกไว้'), 'discarding typed rows must ask first');
assert.ok((html.match(/manualItemsApi\.planManualItemsSave\(/g) || []).length >= 2, 'save must re-check staleness after awaiting the batch reset');
assert.ok(html.includes("showToast(`เพิ่มรายการ"), 'success toast must only appear after the staleness check');

// 15. Helper and CI marker stay in place for desktop/cloud packaging (prepare.mjs copies root *.js).
const prepareSource = fs.readFileSync(new URL('../desktop/scripts/prepare.mjs', import.meta.url), 'utf8');
assert.ok(prepareSource.includes("file.endsWith('.js')"), 'desktop prepare must keep copying root .js helpers');

console.log('PackMaster manual items for unreadable orders tests passed');
