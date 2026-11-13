// Ticket 19: save failures must be reported honestly, the open Local batch must not be archived or
// deleted, and unsaved edits must be flushed or warned about before the page closes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const guards = require('../packmaster-save-guards.js');
const flightApi = require('../packmaster-print-flow.js');

// Slice one handler from its declaration up to a known boundary, so checks look only inside it.
function handlerSource(marker, endMarker) {
  const start = html.indexOf(marker);
  assert.ok(start > 0, `${marker} must exist in index.html`);
  const end = html.indexOf(endMarker, start + marker.length);
  assert.ok(end > start, `${endMarker} must bound ${marker}`);
  return html.slice(start, end);
}

// ---- Pure seam: packmaster-save-guards.js ---------------------------------------------------

test('a failed upload save names the real problem and never reads as success', () => {
  const outcome = guards.uploadSaveOutcome({ saved: false, saveProblem: 'QuotaExceededError', orderCount: 3, cloudMode: false });
  assert.equal(outcome.tone, 'error');
  assert.equal(outcome.unsaved, true, 'a failed save must be flagged as unsaved');
  assert.match(outcome.message, /QuotaExceededError/, 'the real error must be shown to the operator');
  assert.match(outcome.message, /ไฟล์นี้ยังไม่ถูกจำว่านำเข้าแล้ว/, 'the message must say the file stays re-importable');
  assert.doesNotMatch(outcome.message, /สำเร็จ/, 'a failed save must not contain success wording');
});

test('a failed upload save without a reason still reports the failure', () => {
  const outcome = guards.uploadSaveOutcome({ saved: false, saveProblem: '', orderCount: 1, cloudMode: true });
  assert.equal(outcome.tone, 'error');
  assert.match(outcome.message, /ยังไม่ได้บันทึก/);
});

test('a saved upload reports success only with the number actually saved', () => {
  const local = guards.uploadSaveOutcome({ saved: true, orderCount: 2, cloudMode: false });
  assert.equal(local.tone, 'success');
  assert.equal(local.unsaved, false);
  assert.equal(local.message, 'เพิ่มข้อมูลสำเร็จ 2 ใบ');
  const cloud = guards.uploadSaveOutcome({ saved: true, orderCount: 2, cloudMode: true });
  assert.equal(cloud.tone, 'success');
  assert.match(cloud.message, /Cloud สำเร็จแล้ว 2 ใบ/);
});

test('save tracker stays dirty until the newest edit is confirmed, ignoring stale successes', () => {
  const tracker = guards.createSaveTracker();
  assert.equal(tracker.isDirty(), false);
  const first = tracker.begin();
  const second = tracker.begin();
  assert.equal(tracker.isDirty(), true);
  assert.equal(tracker.succeed(first), false, 'an older save finishing must not mark newer edits as saved');
  assert.equal(tracker.isDirty(), true);
  assert.equal(tracker.succeed(second), true);
  assert.equal(tracker.isDirty(), false);
});

test('a failed save keeps the edit dirty so the page warns before closing', () => {
  const tracker = guards.createSaveTracker();
  const seq = tracker.begin();
  tracker.fail(seq);
  assert.equal(tracker.isDirty(), true);
});

test('an unsaved upload stays dirty until a later save of the batch succeeds', () => {
  const tracker = guards.createSaveTracker();
  tracker.begin();
  const autosave = tracker.begin();
  assert.equal(tracker.succeed(autosave), true);
  assert.equal(tracker.isDirty(), false);
});

test('local mode refuses to archive or delete the batch that is currently open', () => {
  assert.match(guards.openBatchGuardMessage({ cloudMode: false, activeBatchId: 'b1', batchIds: ['b1'], action: 'archive' }), /เปิดอยู่/);
  assert.match(guards.openBatchGuardMessage({ cloudMode: false, activeBatchId: 'b1', batchIds: ['b1'], action: 'delete' }), /เปิดอยู่/);
  assert.match(guards.openBatchGuardMessage({ cloudMode: false, activeBatchId: 'b1', batchIds: ['b2', 'b1'], action: 'delete' }), /เปิดอยู่/,
    'bulk delete of archived batches must refuse when the open batch is among them');
  assert.equal(guards.openBatchGuardMessage({ cloudMode: false, activeBatchId: 'b1', batchIds: ['b2'], action: 'archive' }), '');
  assert.equal(guards.openBatchGuardMessage({ cloudMode: false, activeBatchId: null, batchIds: ['b1'], action: 'delete' }), '');
});

test('print or Save PDF in flight blocks batch changes with a Thai message', () => {
  const flight = flightApi.createSingleFlight();
  assert.equal(guards.flightGuardMessage(flight, 'สลับ Batch'), '');
  flight.tryStart();
  assert.match(guards.flightGuardMessage(flight, 'สลับ Batch'), /กำลังพิมพ์หรือ Save PDF/);
  flight.finish();
  assert.equal(guards.flightGuardMessage(null, 'สลับ Batch'), '');
});

// ---- Behaviour of the real handlers from index.html (VM sandbox with synthetic state) -------

test('archive of the open Local batch is refused before any archive write', async () => {
  const calls = { archive: 0, toasts: [] };
  const sandbox = {
    console, saveGuardsApi: guards, printFlightRef: { current: flightApi.createSingleFlight() },
    uploadGateRef: { current: { isActive: () => false } }, cloudMode: false,
    archiveApi: { archiveBatch() { calls.archive += 1; } }, activeBatchId: 'b1',
    showToast(message) { calls.toasts.push(message); }, window: { confirm: () => true },
    setBatches() {}, setSelectedArchivedBatchIds() {}, changeCloudBatchArchive: async () => {}
  };
  vm.createContext(sandbox);
  vm.runInContext(handlerSource('const handleArchiveBatch =', 'const handleRestoreArchivedBatch') + '\nglobalThis.run = handleArchiveBatch;', sandbox);
  await sandbox.run({ id: 'b1', name: 'synthetic batch', reviewSkuCount: 0 });
  assert.equal(calls.archive, 0, 'the open batch must not be archived');
  assert.match(calls.toasts[0], /เปิดอยู่/);
});

test('deleting the open Local batch is refused before any delete write', async () => {
  const calls = { deleted: 0, toasts: [] };
  const sandbox = {
    console, saveGuardsApi: guards, printFlightRef: { current: flightApi.createSingleFlight() },
    uploadGateRef: { current: { isActive: () => false } }, cloudMode: false,
    batchApi: { deleteBatch: async () => { calls.deleted += 1; } }, batchStorageReady: true,
    localMetadataHealth: { status: 'ok' }, activeBatchId: 'b1',
    showToast(message) { calls.toasts.push(message); }, window: { confirm: () => true },
    batchSourceFilesApi: null, duplicateApi: null, archiveApi: null, reprintSnapshotApi: null, cloud: {},
    setBatches() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(handlerSource('const handleDeleteBatch =', 'const resetActiveBatchCompletion') + '\nglobalThis.run = handleDeleteBatch;', sandbox);
  await sandbox.run({ id: 'b1', name: 'synthetic batch' });
  assert.equal(calls.deleted, 0, 'the open batch must not be deleted');
  assert.match(calls.toasts[0], /เปิดอยู่/);
});

test('bulk delete of archived batches refuses when the open batch is selected', async () => {
  const calls = { deleted: 0, toasts: [] };
  const sandbox = {
    console, saveGuardsApi: guards, printFlightRef: { current: flightApi.createSingleFlight() },
    uploadGateRef: { current: { isActive: () => false } }, cloudMode: false,
    batchApi: { deleteBatch: async () => { calls.deleted += 1; } }, batchStorageReady: true,
    localMetadataHealth: { status: 'ok' }, activeBatchId: 'b1', selectedArchivedBatchIds: ['b1'],
    batches: [{ id: 'b1', archivedAt: '2026-11-01T00:00:00.000Z' }],
    getBatchArchivedAt: batch => batch.archivedAt,
    showToast(message) { calls.toasts.push(message); }, window: { confirm: () => true },
    batchSourceFilesApi: null, duplicateApi: null, archiveApi: null, reprintSnapshotApi: null,
    setBatches() {}, setSelectedArchivedBatchIds() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(handlerSource('const handleDeleteSelectedArchived =', 'const handleDeleteBatch') + '\nglobalThis.run = handleDeleteSelectedArchived;', sandbox);
  await sandbox.run();
  assert.equal(calls.deleted, 0, 'the open batch must not be deleted through bulk delete');
  assert.match(calls.toasts[0], /เปิดอยู่/);
});

// ---- Source wiring of index.html -------------------------------------------------------------

test('the upload toast is decided by the save outcome, not by a cloud-or-saved shortcut', () => {
  assert.doesNotMatch(html, /cloudMode \|\| batchSaved/, 'cloud mode must not show success when the save did not persist');
  assert.match(html, /saveGuardsApi\.uploadSaveOutcome\(/, 'the upload result must come from the shared outcome helper');
});

test('the failed Local upload keeps a persistent unsaved warning on screen', () => {
  assert.match(html, /data-pm-unsaved-warning/, 'an unsaved warning banner must be rendered');
  assert.match(html, /setUnsavedWarning\(outcome\.message\)/, 'a failed upload save must set the persistent warning');
});

test('autosave reports its pending edit to the tracker and exposes a flush handle', () => {
  assert.match(html, /pendingAutosaveFlushRef\.current = flush/, 'the 600ms debounce must register a flush handle');
  assert.match(html, /saveTrackerRef\.current/, 'autosave must update the dirty tracker');
});

test('edits pending in the autosave debounce are flushed or warned about on unload', () => {
  assert.match(html, /addEventListener\('beforeunload'/, 'beforeunload must be handled');
  assert.match(html, /addEventListener\('pagehide'/, 'pagehide must flush pending edits');
  assert.match(html, /event\.preventDefault\(\)/, 'unsaved edits must trigger the browser leave-page warning');
  assert.match(html, /window\.packmasterDesktop/, 'the desktop shell must not be blocked by an unhandled unload prompt');
});

test('archive, delete and bulk delete all refuse the open Local batch in index.html', () => {
  const handlers = [
    ['const handleArchiveBatch =', 'const handleRestoreArchivedBatch'],
    ['const handleDeleteSelectedArchived =', 'const handleDeleteBatch'],
    ['const handleDeleteBatch =', 'const resetActiveBatchCompletion']
  ];
  for (const [marker, end] of handlers) {
    assert.match(handlerSource(marker, end), /openBatchGuardMessage\(/, `${marker} must call the open-batch guard`);
  }
});

test('cancelling the duplicate-order warning returns without importing and still resets the file input', () => {
  const uploadHandler = handlerSource('const handleFileUpload = async (e) => {', 'const importPdfFiles =');
  assert.match(uploadHandler, /finally \{[\s\S]*?resetFileInput\(e\.target\);[\s\S]*?\}/,
    'the PDF input must be reset on every exit, including a cancelled duplicate warning');
  const importSource = handlerSource('const importPdfFiles = async (e) => {', 'const LiveMappedOrders');
  assert.match(importSource, /if \(!importPossibleDuplicates\) \{[\s\S]*?return;\s*\}/,
    'cancelling the duplicate-order warning must stop the import');
});
