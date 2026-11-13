// Review fixes for tickets 19/20 and the print follow-ups:
// stale dirty state after leaving a batch, fail() symmetry, exact back-button wording, Save PDF and upload
// cross-gates, fail-closed guards when the guard module is missing, and the accurate print help text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const guards = require('../packmaster-save-guards.js');
const flightApi = require('../packmaster-print-flow.js');

const UNAVAILABLE = /โมดูลป้องกันยังไม่พร้อม/;

function handlerSource(marker, endMarker) {
  const start = html.indexOf(marker);
  assert.ok(start > 0, `${marker} must exist in index.html`);
  const end = html.indexOf(endMarker, start + marker.length);
  assert.ok(end > start, `${endMarker} must bound ${marker}`);
  return html.slice(start, end);
}

// ---- (2) fail() must be symmetric with succeed(): only the newest attempt can mark dirty ----------

test('a stale failure after a newer save succeeded does not re-dirty the page', () => {
  const tracker = guards.createSaveTracker();
  const older = tracker.begin();
  const newer = tracker.begin();
  assert.equal(tracker.succeed(newer), true);
  assert.equal(tracker.fail(older), false, 'an older attempt failing must not mark saved edits dirty');
  assert.equal(tracker.isDirty(), false);
});

test('the newest failure marks dirty', () => {
  const tracker = guards.createSaveTracker();
  tracker.begin();
  const newest = tracker.begin();
  assert.equal(tracker.fail(newest), true);
  assert.equal(tracker.isDirty(), true);
});

// ---- (1) leaving a batch must clear dirty state and the banner ------------------------------------

test('reset clears dirty state, and a late save of the old batch cannot dirty it again', () => {
  const tracker = guards.createSaveTracker();
  const pending = tracker.begin();
  tracker.reset();
  assert.equal(tracker.isDirty(), false, 'leaving the batch must clear the dirty flag');
  tracker.fail(pending);
  assert.equal(tracker.isDirty(), false, 'a late failure of the old batch must not warn on the list screen');
});

test('leaving the open batch clears the tracker and the banner in index.html', () => {
  const effect = handlerSource('// Leaving the open batch', 'const resetRestorePreview');
  assert.match(effect, /if \(!activeBatchId\)/, 'a batch-less state must be detected');
  assert.match(effect, /tracker\.reset\(\)|saveTrackerRef\.current\?\.reset\(\)/, 'the tracker must be reset when the batch is left');
  assert.match(effect, /setUnsavedWarning\(''\)/, 'the banner must be cleared when the batch is left');
  assert.match(effect, /\[activeBatchId\]/, 'the reset must run when the open batch changes');
});

test('a successful save of the active batch clears dirty state and the banner', () => {
  const saveSource = handlerSource('const saveActiveBatchSnapshot = async', 'const cancelStoreSwitch');
  assert.match(saveSource, /const storedMeta = await batchApi\.saveBatch\(updated, orders\);[\s\S]*?saveTrackerRef\.current\?\.reset\(\);[\s\S]*?setUnsavedWarning\(''\);/,
    'a confirmed transition or store-switch save must reset the tracker and the banner');
});

// ---- (3) exact wording for the open-batch refusal -------------------------------------------------

test('the open-batch refusal names the exact back button on the upload screen', () => {
  const archive = guards.openBatchGuardMessage({ cloudMode: false, activeBatchId: 'b1', batchIds: ['b1'], action: 'archive' });
  const remove = guards.openBatchGuardMessage({ cloudMode: false, activeBatchId: 'b1', batchIds: ['b1'], action: 'delete' });
  for (const message of [archive, remove]) {
    assert.match(message, /กด "กลับรายการ Batch" ในหน้าอัปโหลดก่อน/);
  }
  assert.ok(html.includes('กลับรายการ Batch'), 'the named button must exist in index.html');
});

// ---- (4) Save PDF refuses during upload; upload refuses during print/Save PDF --------------------

test('Save PDF is refused while a PDF upload is processing, without touching the UI', async () => {
  const events = [];
  const sandbox = {
    Date, console, setTimeout, requestAnimationFrame: f => f(),
    MappedOrders: [{ id: 'synthetic-order-4' }], printScopeApi: null,
    getReviewFlags: () => ({ ready: true }), thermalFailedImages: new Set(),
    printFlightRef: { current: flightApi.createSingleFlight() },
    uploadGateRef: { current: { isActive: () => true } },
    setExportStatus: () => events.push('status-changed'),
    showToast: message => events.push(message)
  };
  vm.createContext(sandbox);
  vm.runInContext(handlerSource('const handleExportPDF =', 'const renderLabelsPdf') + '\nglobalThis.runExport = handleExportPDF;', sandbox);
  await sandbox.runExport('FULL_BATCH');
  assert.equal(events.includes('status-changed'), false, 'Save PDF must not start while an upload runs');
  assert.match(events.join(' '), /ประมวลผล PDF/);
  assert.equal(sandbox.printFlightRef.current.isActive(), false, 'a refused Save PDF must not hold the print gate');
});

test('a PDF pick is refused while print or Save PDF runs, and the file input is reset for the next pick', async () => {
  const calls = { exclusive: 0 };
  const busy = flightApi.createSingleFlight();
  busy.tryStart();
  const toasts = [];
  const target = { files: [{ name: 'synthetic.pdf' }], value: 'synthetic.pdf' };
  const sandbox = {
    console, saveGuardsApi: guards, printFlightRef: { current: busy },
    uploadGateRef: { current: { isActive: () => false } },
    uploadSessionApi: { runExclusive: async () => { calls.exclusive += 1; return { ran: true }; } },
    resetFileInput: t => { t.value = ''; },
    setUploadError() {},
    showToast: message => toasts.push(message)
  };
  vm.createContext(sandbox);
  vm.runInContext(handlerSource('const handleFileUpload = async (e) => {', 'const importPdfFiles =') + '\nglobalThis.upload = handleFileUpload;', sandbox);
  await sandbox.upload({ target });
  assert.equal(calls.exclusive, 0, 'the import must not start while printing');
  assert.equal(target.value, '', 'the input must be reset so the same file can be picked again');
  assert.match(toasts.join(' '), /กำลังพิมพ์หรือ Save PDF/);
});

// ---- (5) fail-closed when the guard module is missing ---------------------------------------------

test('archive, delete, bulk delete and open batch are refused when the guard module is missing', async () => {
  const archiveCalls = { archive: 0, delete: 0, bulk: 0, load: 0, transition: 0 };
  const toasts = [];
  const base = {
    console, saveGuardsApi: undefined, printFlightRef: { current: flightApi.createSingleFlight() },
    uploadGateRef: { current: { isActive: () => false } }, cloudMode: false, activeBatchId: null,
    showToast: message => toasts.push(message), window: { confirm: () => true },
    archiveApi: { archiveBatch() { archiveCalls.archive += 1; } },
    batchApi: { deleteBatch: async () => { archiveCalls.delete += 1; }, loadBatch: async () => { archiveCalls.load += 1; return { meta: null, orders: [] }; } },
    batchStorageReady: true, localMetadataHealth: { status: 'ok' },
    selectedArchivedBatchIds: ['b1'], batches: [{ id: 'b1', archivedAt: '2026-11-01T00:00:00.000Z' }],
    getBatchArchivedAt: batch => batch.archivedAt,
    batchSourceFilesApi: null, duplicateApi: null, reprintSnapshotApi: null, cloud: {},
    setBatches() {}, setSelectedArchivedBatchIds() {}, setBatchLoading() {},
    runBatchTransition: async () => { archiveCalls.transition += 1; return true; }
  };
  const cases = [
    ['const handleArchiveBatch =', 'const handleRestoreArchivedBatch', 'handleArchiveBatch', { id: 'b1', name: 'synthetic' }, () => archiveCalls.archive],
    ['const handleDeleteBatch =', 'const resetActiveBatchCompletion', 'handleDeleteBatch', { id: 'b1', name: 'synthetic' }, () => archiveCalls.delete],
    ['const handleDeleteSelectedArchived =', 'const handleDeleteBatch', 'handleDeleteSelectedArchived', undefined, () => archiveCalls.delete],
    ['const handleOpenBatch =', 'const handleBackToBatchList', 'handleOpenBatch', { id: 'b1', name: 'synthetic' }, () => archiveCalls.load + archiveCalls.transition]
  ];
  for (const [marker, end, name, arg, count] of cases) {
    const sandbox = vm.createContext({ ...base, toasts });
    vm.runInContext(handlerSource(marker, end) + `\nglobalThis.run = ${name};`, sandbox);
    toasts.length = 0;
    await sandbox.run(arg);
    assert.equal(count(), 0, `${name} must not mutate anything without its guard module`);
    assert.match(toasts[0] || '', UNAVAILABLE, `${name} must show the Thai fail-closed message`);
  }
});

test('every destructive handler carries the fail-closed message in index.html', () => {
  const handlers = [
    ['const handleArchiveBatch =', 'const handleRestoreArchivedBatch'],
    ['const handleDeleteSelectedArchived =', 'const handleDeleteBatch'],
    ['const handleDeleteBatch =', 'const resetActiveBatchCompletion'],
    ['const handleOpenBatch =', 'const handleBackToBatchList'],
    ['const handleClearActiveBatch =', 'const handlePrint ='],
    ['const runBatchTransition =', 'const handleCreateBatch']
  ];
  for (const [marker, end] of handlers) {
    assert.match(handlerSource(marker, end), /โมดูลป้องกันยังไม่พร้อม/, `${marker} must refuse when the guard module is missing`);
  }
});

// ---- (6) print help text must match the real behaviour ---------------------------------------------

test('the print help text says the first full-Batch print asks before marking printed, and reprints do not', () => {
  assert.ok(html.includes('พิมพ์ทั้ง Batch ครั้งแรกจะถามยืนยันก่อนตั้งสถานะพิมพ์แล้ว (พิมพ์เฉพาะที่พร้อมและการพิมพ์ซ้ำไม่ตั้งสถานะ)'),
    'the dock help text must state the confirm-first and no-status-on-reprint rules');
  assert.equal(html.includes('ปุ่มพิมพ์จะถามยืนยันว่าพิมพ์ออกครบแล้วก่อนตั้งสถานะ'), false, 'the earlier wording must be replaced');
});
