// Ticket 17: print completion must wait for the print dialog to close and an explicit
// operator confirmation before a FULL_BATCH is marked printed; double clicks must not start
// two flows; a "print only ready" action must exist and use the scope helper.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const printFlow = require('../packmaster-print-flow.js');
const printScope = require('../packmaster-print-scope.js');

const CONFIRM_FRAGMENT = 'พิมพ์ออกครบแล้วใช่ไหม';

function handlePrintSource() {
  const start = html.indexOf("const handlePrint = async (mode = 'FULL_BATCH') => {");
  const end = html.indexOf('useEffect(() => {', start);
  assert.ok(start >= 0 && end > start, 'handlePrint must stay extractable at the UI seam');
  return html.slice(start, end);
}

// Runs the real handlePrint from index.html with synthetic orders and stubbed UI seams.
function harness({ orders, confirmAnswer = true, markResult = true, renderDelayMs = 0, renderError = null, snapshotFails = false }) {
  const events = [];
  const toasts = [];
  const listeners = {};
  const flight = printFlow.createSingleFlight();
  const win = {
    print() {
      events.push('print');
      if (listeners.afterprint) listeners.afterprint();
    },
    confirm(message) {
      events.push(['confirm', message]);
      return confirmAnswer;
    },
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; }
  };
  const context = {
    console: { error() {}, warn() {}, log() {} },
    printScopeApi: printScope,
    printFlowApi: printFlow,
    MappedOrders: orders,
    getReviewFlags: order => ({ ready: order.ready === true }),
    activeBatch: { id: 'batch-17' },
    activeBatchId: 'batch-17',
    thermalMode: false,
    thermalFailedImages: new Set(),
    printFlightRef: { current: flight },
    uploadGateRef: { current: { isActive: () => false } },
    setPrintScopeMode: mode => events.push(['scope', mode]),
    setPrintRenderActive: value => events.push(['render', value]),
    setPrintBusy: value => events.push(['busy', value]),
    requestAnimationFrame: fn => fn(),
    document: { querySelector: () => ({}) },
    waitForPrintRender: (container, scoped) => new Promise((resolve, reject) => {
      events.push(['render-orders', scoped.map(order => order.id)]);
      setTimeout(() => (renderError ? reject(renderError) : resolve()), renderDelayMs);
    }),
    markActiveBatchPrinted: async () => { events.push('mark'); return markResult; },
    batchApi: {},
    batchStorageReady: true,
    reprintSnapshotApi: {
      validateSnapshot(value) {
        if (snapshotFails) throw new Error('synthetic snapshot failure');
        return value;
      }
    },
    showToast: (message, type) => toasts.push({ message, type }),
    window: win
  };
  vm.createContext(context);
  vm.runInContext(`${handlePrintSource()}\nglobalThis.runPrint = handlePrint;`, context);
  return { runPrint: context.runPrint, events, toasts, flight };
}

const twoOrders = [
  { id: 'ready-1', ready: true, pdfImage: 'data:image/jpeg;base64,SYNTH1' },
  { id: 'review-1', ready: false, pdfImage: 'data:image/jpeg;base64,SYNTH2' }
];

test('helper: single-flight guard rejects a second start until finished', () => {
  const guard = printFlow.createSingleFlight();
  assert.equal(guard.isActive(), false);
  assert.equal(guard.tryStart(), true);
  assert.equal(guard.isActive(), true);
  assert.equal(guard.tryStart(), false, 'second start while active must be refused');
  guard.finish();
  assert.equal(guard.tryStart(), true, 'guard must reopen after finish');
});

test('helper: waitForPrintDialogClose resolves only after afterprint fires', async () => {
  const listeners = {};
  let printed = false;
  let resolved = false;
  const win = {
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
    print() { printed = true; }
  };
  const pending = printFlow.waitForPrintDialogClose(win, { timeoutMs: 60000 }).then(() => { resolved = true; });
  assert.equal(printed, true, 'print must be invoked');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resolved, false, 'must not resolve before the dialog reports closed');
  listeners.afterprint();
  await pending;
  assert.equal(resolved, true);
  assert.equal(listeners.afterprint, undefined, 'listener must be removed after closing');
});

test('helper: waitForPrintDialogClose falls back when afterprint never arrives', async () => {
  const win = { addEventListener() {}, removeEventListener() {}, print() {} };
  let timerFn = null;
  const setTimer = (fn) => { timerFn = fn; return 1; };
  const pending = printFlow.waitForPrintDialogClose(win, { timeoutMs: 10, setTimer, clearTimer: () => {} });
  assert.equal(typeof timerFn, 'function', 'a fallback timer must be armed');
  timerFn();
  await pending;
});

test('helper: waitForPrintDialogClose rejects when window.print throws and does not leak the listener', async () => {
  const listeners = {};
  const win = {
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
    print() { throw new Error('print blocked'); }
  };
  await assert.rejects(printFlow.waitForPrintDialogClose(win), /print blocked/);
  assert.equal(listeners.afterprint, undefined);
});

test('cancelling the print dialog never marks the batch printed', async () => {
  const h = harness({ orders: twoOrders, confirmAnswer: false });
  await h.runPrint('FULL_BATCH');
  assert.ok(h.events.includes('print'), 'the dialog must open');
  assert.equal(h.events.includes('mark'), false, 'a closed or cancelled dialog must not set printed status');
  assert.ok(h.toasts.some(t => /ยังไม่ตั้งสถานะ/.test(t.message)), 'operator must be told the batch is not marked');
});

test('a Batch whose completion history cannot be prepared is not printed at all', async () => {
  const h = harness({ orders: twoOrders, snapshotFails: true });
  await h.runPrint('FULL_BATCH');
  assert.equal(h.events.includes('print'), false, 'no dialog may open without Reprint history');
  assert.equal(h.events.includes('mark'), false);
  assert.ok(h.toasts.some(t => /Snapshot/.test(t.message)));
});

test('the confirmation is asked after the dialog closes and before the printed status is written', async () => {
  const h = harness({ orders: twoOrders, confirmAnswer: true });
  await h.runPrint('FULL_BATCH');
  const printIndex = h.events.indexOf('print');
  const confirmIndex = h.events.findIndex(e => Array.isArray(e) && e[0] === 'confirm');
  const markIndex = h.events.indexOf('mark');
  assert.ok(printIndex >= 0 && confirmIndex > printIndex, 'confirmation must come after the print dialog');
  assert.ok(markIndex > confirmIndex, 'printed status must be written only after confirmation');
  assert.ok(h.events[confirmIndex][1].includes(CONFIRM_FRAGMENT), 'confirmation must use the agreed Thai question');
});

test('a second click while a print flow is running does not start another flow', async () => {
  const h = harness({ orders: twoOrders, confirmAnswer: true, renderDelayMs: 20 });
  const first = h.runPrint('FULL_BATCH');
  const second = h.runPrint('FULL_BATCH');
  await Promise.all([first, second]);
  assert.equal(h.events.filter(e => e === 'print').length, 1, 'exactly one print dialog');
  assert.equal(h.events.filter(e => e === 'mark').length, 1, 'exactly one completion write');
  assert.equal(h.flight.isActive(), false, 'guard must be released after the flow ends');
});

test('the guard is released and nothing is printed when render preparation fails', async () => {
  const h = harness({ orders: twoOrders, renderError: new Error('synthetic render failure') });
  await h.runPrint('FULL_BATCH');
  assert.equal(h.flight.isActive(), false, 'guard must be released after a failed flow');
  assert.equal(h.events.includes('print'), false, 'no dialog may open after a failed render');
  assert.equal(h.events.includes('mark'), false);
  assert.ok(h.toasts.some(t => /synthetic render failure/.test(t.message)));
});

test('print only ready prints just the ready orders and never marks the batch completed', async () => {
  const h = harness({ orders: [
    { id: 'ready-a', ready: true, pdfImage: 'data:image/jpeg;base64,A' },
    { id: 'pending-b', ready: false, pdfImage: 'data:image/jpeg;base64,B' },
    { id: 'ready-c', ready: true, pdfImage: 'data:image/jpeg;base64,C' }
  ] });
  await h.runPrint('READY_ONLY');
  assert.deepEqual(h.events.find(e => Array.isArray(e) && e[0] === 'render-orders'), ['render-orders', ['ready-a', 'ready-c']]);
  assert.equal(h.events.filter(e => e === 'print').length, 1);
  assert.equal(h.events.includes('mark'), false, 'a partial print must not set the batch printed status');
  assert.equal(h.events.some(e => Array.isArray(e) && e[0] === 'confirm'), false, 'partial print needs no completion confirmation');
});

test('source: index.html wires the helper, the print-only-ready button and the in-flight guard', () => {
  assert.match(html, /<script src="\.\/packmaster-print-flow\.js"><\/script>/);
  assert.match(html, /const printFlowApi = window\.PackMasterPrintFlow;/);
  assert.match(html, /data-pm-action="print-ready"/, 'print-only-ready button must exist');
  assert.match(html, /พิมพ์เฉพาะที่พร้อม/, 'print-only-ready button must have the agreed Thai label');
  assert.match(html, /handlePrint\('READY_ONLY'\)/);
  assert.match(html, /printFlightRef/);
  assert.match(html, /disabled=\{[^}]*printBusy/, 'print buttons must be disabled while a flow runs');
  assert.match(handlePrintSource(), /window\.confirm\(printFlowApi\.PRINT_CONFIRM_MESSAGE\)/, 'handlePrint must ask the confirmation question after the dialog closes');
  assert.ok(printFlow.PRINT_CONFIRM_MESSAGE.includes(CONFIRM_FRAGMENT), 'the confirmation text must carry the agreed question');
  assert.doesNotMatch(handlePrintSource(), /markActiveBatchPrinted\(\);\s*window\.print\(\)/, 'status must not be written before printing');
});

console.log('PackMaster print completion (ticket 17) tests passed');
