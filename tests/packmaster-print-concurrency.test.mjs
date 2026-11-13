// Print follow-ups from the ticket 17/18 review: batch changes refuse while print/Save PDF runs,
// Save PDF is single-flight, print and Save PDF disable each other, and the dock help text is truthful.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const flightApi = require('../packmaster-print-flow.js');
const guards = require('../packmaster-save-guards.js');

function handlerSource(marker, endMarker) {
  const start = html.indexOf(marker);
  assert.ok(start > 0, `${marker} must exist in index.html`);
  const end = html.indexOf(endMarker, start + marker.length);
  assert.ok(end > start, `${endMarker} must bound ${marker}`);
  return html.slice(start, end);
}

test('the single-flight gate refuses a second flow until the first finishes', () => {
  const flight = flightApi.createSingleFlight();
  assert.equal(flight.tryStart(), true);
  assert.equal(flight.tryStart(), false, 'a second print or export must be refused while one runs');
  flight.finish();
  assert.equal(flight.tryStart(), true);
  flight.finish();
});

test('batch switch, open, clear, delete and archive all refuse while print or Save PDF runs', () => {
  const guarded = [
    ['const runBatchTransition =', 'const handleCreateBatch'],
    ['const handleOpenBatch =', 'const handleBackToBatchList'],
    ['const handleArchiveBatch =', 'const handleRestoreArchivedBatch'],
    ['const handleDeleteSelectedArchived =', 'const handleDeleteBatch'],
    ['const handleDeleteBatch =', 'const resetActiveBatchCompletion'],
    ['const handleClearActiveBatch =', 'const handlePrint =']
  ];
  for (const [marker, end] of guarded) {
    const source = handlerSource(marker, end);
    assert.match(source, /flightGuardMessage\(printFlightRef\.current/, `${marker} must refuse while printFlightRef is active`);
  }
});

test('opening a batch is refused while print or Save PDF is in flight, before any load', async () => {
  const calls = { loads: 0, transitions: 0, toasts: [] };
  const busy = flightApi.createSingleFlight();
  busy.tryStart();
  const sandbox = {
    console, saveGuardsApi: guards, printFlightRef: { current: busy },
    batch: { id: 'b2' }, batchStorageReady: true,
    batchApi: { loadBatch: async () => { calls.loads += 1; return { meta: null, orders: [] }; } },
    setBatchLoading() {},
    runBatchTransition: async () => { calls.transitions += 1; return true; },
    showToast(message) { calls.toasts.push(message); }
  };
  vm.createContext(sandbox);
  vm.runInContext(handlerSource('const handleOpenBatch =', 'const handleBackToBatchList') + '\nglobalThis.run = handleOpenBatch;', sandbox);
  await sandbox.run({ id: 'b2', name: 'synthetic batch' });
  assert.equal(calls.loads, 0, 'the batch must not load while printing');
  assert.equal(calls.transitions, 0, 'the batch switch must not start while printing');
  assert.match(calls.toasts[0], /กำลังพิมพ์หรือ Save PDF/);
});

test('Save PDF is refused while another print or export is in flight and leaves the UI untouched', async () => {
  const events = [];
  const busy = flightApi.createSingleFlight();
  busy.tryStart();
  const sandbox = {
    Date, console, setTimeout, requestAnimationFrame: f => f(),
    MappedOrders: [{ id: 'synthetic-order-1' }], printScopeApi: null,
    getReviewFlags: () => ({ ready: true }), thermalFailedImages: new Set(),
    printFlightRef: { current: busy },
    uploadGateRef: { current: { isActive: () => false } },
    setExportStatus: () => events.push('status-changed'),
    showToast: message => events.push(message)
  };
  vm.createContext(sandbox);
  vm.runInContext(handlerSource('const handleExportPDF =', 'const prepareSkuRules') + '\nglobalThis.runExport = handleExportPDF;', sandbox);
  await sandbox.runExport('FULL_BATCH');
  assert.equal(events.includes('status-changed'), false, 'a refused Save PDF must not start rendering');
  assert.match(events.join(' '), /กำลังพิมพ์หรือ Save PDF/);
  assert.equal(busy.isActive(), true, 'a refused Save PDF must not release the flow that is running');
});

test('Save PDF releases its single-flight gate even when the export fails', async () => {
  const flight = flightApi.createSingleFlight();
  const sandbox = {
    Date, console, setTimeout, requestAnimationFrame: f => f(),
    MappedOrders: [{ id: 'synthetic-order-2' }], printScopeApi: null,
    getReviewFlags: () => ({ ready: true }), thermalFailedImages: new Set(),
    printFlightRef: { current: flight },
    uploadGateRef: { current: { isActive: () => false } },
    setExportStatus() {}, setExportRenderOrder() {},
    window: {}, document: {},
    showToast() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(handlerSource('const handleExportPDF =', 'const prepareSkuRules') + '\nglobalThis.runExport = handleExportPDF;', sandbox);
  await sandbox.runExport('FULL_BATCH');
  assert.equal(flight.isActive(), false, 'a failed export must not leave the gate stuck busy');
});

test('Save PDF and print disable each other while either flow runs', () => {
  const savePdf = html.match(/data-pm-action="save-pdf"[\s\S]{0,200}?disabled=\{([^}]*)\}/);
  const print = html.match(/data-pm-action="print"[\s\S]{0,200}?disabled=\{([^}]*)\}/);
  assert.ok(savePdf && print, 'both export buttons must carry their action markers');
  assert.match(savePdf[1], /printBusy/, 'Save PDF must be disabled while print runs');
  assert.match(savePdf[1], /exportStatus\.active/, 'Save PDF must stay disabled while an export runs');
  assert.match(print[1], /exportStatus\.active/, 'print must be disabled while Save PDF runs');
  assert.match(print[1], /printBusy/, 'print must stay disabled while a print flow runs');
});

test('the dock help text states exactly what Print and Save PDF do to the printed status', () => {
  assert.doesNotMatch(html, /สถานะพิมพ์แล้วหมายถึงระบบเริ่มสั่งพิมพ์หรือส่งออก/,
    'the old wording blurred Print and Save PDF together');
  assert.match(html, /พิมพ์ทั้ง Batch ครั้งแรกจะถามยืนยันก่อนตั้งสถานะพิมพ์แล้ว \(พิมพ์เฉพาะที่พร้อมและการพิมพ์ซ้ำไม่ตั้งสถานะ\)/,
    'Print must say the first full-Batch print asks before marking printed, and reprints do not mark');
  assert.match(html, /Save PDF ตั้งสถานะพิมพ์แล้วทันทีหลังดาวน์โหลด PDF สำเร็จ ไม่ถามยืนยันกระดาษ/,
    'Save PDF must say it marks printed after download without a paper confirmation');
  assert.match(html, /ระบบไม่ยืนยันว่ากระดาษออกจากเครื่องพิมพ์จริง/,
    'the help text must keep the limit that paper output is not verified');
});
