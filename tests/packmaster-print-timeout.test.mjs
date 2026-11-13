// Ticket 18: print and Save PDF must not sit in a generic timeout when Thermal conversion
// has failed or when a Batch no longer has its label images (Reprint images cleared).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const printFlow = require('../packmaster-print-flow.js');
const printScope = require('../packmaster-print-scope.js');

const ORIGINAL = 'data:image/jpeg;base64,ORIGINAL';
const THERMAL = 'data:image/jpeg;base64,THERMAL';
const GENERIC_TIMEOUT = 'รอเตรียมภาพสำหรับพิมพ์ไม่สำเร็จภายในเวลาที่กำหนด';

function slice(startNeedle, endNeedle) {
  const start = html.indexOf(startNeedle);
  const end = html.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `index.html must keep "${startNeedle}" extractable`);
  return html.slice(start, end);
}

const waitHelpers = () => slice('const printFlowUnavailable = ', '// PackMaster Frontend V3');
const thermalHelpers = () => slice('const thermalImagePromiseCache = new Map();', 'const LabelCard =');
const handlePrintSource = () => slice("const handlePrint = async (mode = 'FULL_BATCH') => {", 'useEffect(() => {');

function img({ src, loaded = true }) {
  return { src, complete: loaded, naturalWidth: loaded ? 120 : 0 };
}

test('helper: a Thermal conversion failure fails immediately with a Thai cause naming the order', () => {
  const state = printFlow.evaluatePrintReadiness({
    images: [img({ src: ORIGINAL })],
    orders: [{ id: 'order-thermal', pdfImage: ORIGINAL }],
    thermalMode: true,
    thermalFailures: new Set([ORIGINAL])
  });
  assert.equal(state.status, 'failed');
  assert.match(state.message, /แปลงภาพ Thermal ไม่สำเร็จ/);
  assert.match(state.message, /order-thermal/);
});

test('helper: a pending Thermal conversion is still waiting, not failed', () => {
  const state = printFlow.evaluatePrintReadiness({
    images: [img({ src: ORIGINAL })],
    orders: [{ id: 'o1', pdfImage: ORIGINAL }],
    thermalMode: true,
    thermalFailures: new Set()
  });
  assert.equal(state.status, 'waiting');
});

test('helper: Thermal failures are ignored when Thermal is off', () => {
  const state = printFlow.evaluatePrintReadiness({
    images: [img({ src: ORIGINAL })],
    orders: [{ id: 'o1', pdfImage: ORIGINAL }],
    thermalMode: false,
    thermalFailures: new Set([ORIGINAL])
  });
  assert.equal(state.status, 'ready');
});

test('helper: a fully rendered and Thermal-baked page is ready', () => {
  const state = printFlow.evaluatePrintReadiness({
    images: [img({ src: THERMAL })],
    orders: [{ id: 'o1', pdfImage: ORIGINAL }],
    thermalMode: true,
    thermalFailures: new Set()
  });
  assert.equal(state.status, 'ready');
});

test('helper: an order without its label image fails with an explanation about cleared Reprint images', () => {
  const orders = [{ id: 'cleared-1' }, { id: 'ok-2', pdfImage: ORIGINAL }];
  assert.deepEqual(printFlow.findOrdersWithoutImage(orders).map(o => o.id), ['cleared-1']);
  const message = printFlow.missingImageMessage(printFlow.findOrdersWithoutImage(orders));
  assert.match(message, /รูป/);
  assert.match(message, /ล้างรูป Reprint/);
  assert.match(message, /cleared-1/);
  const state = printFlow.evaluatePrintReadiness({ images: [], orders, thermalMode: true, thermalFailures: new Set() });
  assert.equal(state.status, 'failed');
  assert.equal(state.message, message);
});

test('thermal conversion failure is recorded so print and Save PDF can stop early', async () => {
  const context = {
    Image: class { set src(value) { this._src = value; setTimeout(() => this.onerror && this.onerror(), 0); } },
    document: { createElement: () => ({ getContext: () => ({}) }) },
    console: { warn() {}, error() {}, log() {} },
    Promise
  };
  vm.createContext(context);
  vm.runInContext(`${thermalHelpers()}\nglobalThis.acquire = acquireThermalImage; globalThis.failed = thermalFailedImages;`, context);
  await assert.rejects(context.acquire(ORIGINAL), /แปลงภาพ Thermal ไม่สำเร็จ/);
  assert.equal(context.failed.has(ORIGINAL), true, 'the failed image must be recorded for the print wait');
});

test('waitForPrintRender stops at once with the Thermal cause instead of the 15 second generic timeout', async () => {
  const context = {
    Date, setTimeout, console,
    printFlowApi: printFlow,
    thermalFailedImages: new Set([ORIGINAL]),
    Promise
  };
  vm.createContext(context);
  vm.runInContext(`${waitHelpers()}\nglobalThis.waitPrint = waitForPrintRender;`, context);
  const container = { querySelectorAll: () => [img({ src: ORIGINAL })] };
  const started = Date.now();
  await assert.rejects(
    context.waitPrint(container, [{ id: 'order-thermal', pdfImage: ORIGINAL }], true),
    /แปลงภาพ Thermal ไม่สำเร็จ/
  );
  assert.ok(Date.now() - started < 1000, 'a known Thermal failure must not wait for the full timeout');
});

test('waitForPrintRender still times out generically when Thermal is merely slow', async () => {
  const context = { Date, setTimeout, console, printFlowApi: printFlow, thermalFailedImages: new Set(), Promise };
  vm.createContext(context);
  vm.runInContext(`${waitHelpers()}\nglobalThis.waitPrint = waitForPrintRender;`, context);
  const container = { querySelectorAll: () => [img({ src: ORIGINAL })] };
  await assert.rejects(
    context.waitPrint(container, [{ id: 'slow', pdfImage: ORIGINAL }], true, 200),
    new RegExp(GENERIC_TIMEOUT)
  );
});

test('waitForLabelRender (Save PDF) explains a cleared image instead of a generic timeout', async () => {
  const context = { Date, setTimeout, console, printFlowApi: printFlow, thermalFailedImages: new Set(), Promise };
  vm.createContext(context);
  vm.runInContext(`${waitHelpers()}\nglobalThis.waitLabel = waitForLabelRender;`, context);
  const started = Date.now();
  await assert.rejects(
    context.waitLabel({ querySelector: () => null, querySelectorAll: () => [] }, { id: 'cleared-9' }, true),
    /ล้างรูป Reprint/
  );
  assert.ok(Date.now() - started < 1000);
});

test('handlePrint shows the cleared-image explanation before preparing or opening any dialog', async () => {
  const events = [];
  const toasts = [];
  const flight = printFlow.createSingleFlight();
  const context = {
    console: { error() {}, warn() {}, log() {} },
    printScopeApi: printScope,
    printFlowApi: printFlow,
    MappedOrders: [{ id: 'cleared-1', ready: true }],
    getReviewFlags: order => ({ ready: order.ready === true }),
    activeBatch: { id: 'archived-batch' },
    activeBatchId: 'archived-batch',
    thermalMode: true,
    printFlightRef: { current: flight },
    uploadGateRef: { current: { isActive: () => false } },
    setPrintScopeMode: mode => events.push(['scope', mode]),
    setPrintRenderActive: value => events.push(['render', value]),
    setPrintBusy: value => events.push(['busy', value]),
    requestAnimationFrame: fn => fn(),
    document: { querySelector: () => ({}) },
    waitForPrintRender: async () => { events.push('wait'); },
    markActiveBatchPrinted: async () => { events.push('mark'); return true; },
    showToast: (message, type) => toasts.push({ message, type }),
    window: { print() { events.push('print'); }, confirm: () => true, addEventListener() {}, removeEventListener() {} }
  };
  vm.createContext(context);
  vm.runInContext(`${handlePrintSource()}\nglobalThis.runPrint = handlePrint;`, context);
  const started = Date.now();
  await context.runPrint('FULL_BATCH');
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(events.filter(e => e === 'print' || e === 'wait' || e === 'mark'), []);
  assert.equal(flight.isActive(), false);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, 'error');
  assert.match(toasts[0].message, /ล้างรูป Reprint/);
});

test('source: index.html routes Thermal failure and cleared images through the helper', () => {
  assert.match(html, /<script src="\.\/packmaster-print-flow\.js"><\/script>/);
  assert.match(html, /const printFlowApi = window\.PackMasterPrintFlow;/);
  assert.match(html, /const thermalFailedImages = new Set\(\);/);
  assert.match(html, /thermalFailedImages\.add\(/);
  assert.match(html, /printFlowApi\.evaluatePrintReadiness\(/);
  assert.match(html, /printFlowApi\.findOrdersWithoutImage\(/);
  assert.ok(html.includes(GENERIC_TIMEOUT), 'the generic timeout stays only as the last-resort message');
});

test('scope: printFlowApi is visible to the top-level wait helpers (declared before function App)', () => {
  const declaration = html.indexOf('const printFlowApi = window.PackMasterPrintFlow;');
  const appStart = html.indexOf('function App() {');
  const waitHelper = html.indexOf('const waitForPrintRender = async');
  assert.ok(declaration >= 0 && appStart > 0 && waitHelper > 0, 'declaration, App and wait helper must exist');
  assert.ok(declaration < waitHelper, 'waitForPrintRender runs outside App, so printFlowApi must be declared at top level before it');
  assert.ok(declaration < appStart, 'printFlowApi must not be declared only inside App');
});

test('a stale Thermal failure from an earlier attempt is cleared before a new print flow waits', async () => {
  const seenAtWait = [];
  const context = {
    console: { error() {}, warn() {}, log() {} },
    printScopeApi: printScope,
    printFlowApi: printFlow,
    MappedOrders: [{ id: 'retry-1', ready: true, pdfImage: ORIGINAL }],
    getReviewFlags: order => ({ ready: order.ready === true }),
    activeBatch: { id: 'batch-retry' },
    activeBatchId: 'batch-retry',
    thermalMode: true,
    thermalFailedImages: new Set([ORIGINAL]),
    printFlightRef: { current: printFlow.createSingleFlight() },
    uploadGateRef: { current: { isActive: () => false } },
    batchApi: {},
    batchStorageReady: true,
    reprintSnapshotApi: { validateSnapshot: value => value },
    setPrintScopeMode() {},
    setPrintRenderActive() {},
    setPrintBusy() {},
    requestAnimationFrame: fn => fn(),
    document: { querySelector: () => ({}) },
    waitForPrintRender: async (container, orders) => { seenAtWait.push(context.thermalFailedImages.has(orders[0].pdfImage)); },
    markActiveBatchPrinted: async () => true,
    showToast() {},
    window: { print() {}, confirm: () => false, addEventListener() {}, removeEventListener() {} }
  };
  vm.createContext(context);
  vm.runInContext(`${handlePrintSource()}\nglobalThis.runPrint = handlePrint;`, context);
  await context.runPrint('READY_ONLY');
  assert.deepEqual(seenAtWait, [false], 'a retry must not inherit the earlier failure and fail before it renders');
});

console.log('PackMaster print timeout (ticket 18) tests passed');
