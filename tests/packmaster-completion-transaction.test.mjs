import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('const resetActiveBatchCompletion =');
const end = html.indexOf('const handlePrint =', start);
assert.ok(start >= 0 && end > start, 'completion handlers must remain extractable at the UI seam');
const handlers = html.slice(start, end);

function harness({ failSave = false, failSaveOnce = false, lostAcknowledgement = false, alreadyCompleted = false,
  localOrders = null, authoritativeOrders = null, authoritativeMeta = null, saveGate = null, loadFailure = false, serverTimestamp = false } = {}) {
  const snapshot = {
    batchId: 'batch-test', completedAt: '2026-11-06T00:00:00.000Z',
    orders: [{ id: 'order-1', displayItems: ['Original Name'], originalQty: 1,
      qtyWarning: false, unresolvedSku: false, resolvedAudit: [] }]
  };
  const state = {
    persisted: { id: 'batch-test', cloudRevision: 4, updatedAt: '2026-11-06T00:00:00.000Z', printedAt: alreadyCompleted ? snapshot.completedAt : null,
      resolvedSnapshot: alreadyCompleted ? snapshot : null },
    visible: { id: 'batch-test', cloudRevision: 4, updatedAt: '2026-11-06T00:00:00.000Z', printedAt: alreadyCompleted ? snapshot.completedAt : null,
      resolvedSnapshot: alreadyCompleted ? snapshot : null },
    events: [], saveCalls: [], localSnapshot: null, loadCalls: 0,
    orders: localOrders || [{ ...snapshot.orders[0] }],
    persistedOrders: authoritativeOrders || localOrders || [{ ...snapshot.orders[0] }],
    authoritativeMeta
  };
  let failuresRemaining = failSave ? Infinity : failSaveOnce ? 1 : 0;
  const batchApi = {
    buildBatchMeta: (meta, summary, overrides) => ({ ...meta, ...overrides }),
    async saveBatch(meta, orders) {
      state.saveCalls.push({ meta, orders });
      if (saveGate) await saveGate(meta, orders, state);
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw Object.assign(new Error('injected revision conflict'), { status: 409 });
      }
      state.persisted = { ...meta, cloudRevision: (meta.cloudRevision || 0) + 1, ...(serverTimestamp ? { updatedAt: '2026-11-07T00:00:00.000Z' } : {}) };
      state.persistedOrders = orders;
      if (lostAcknowledgement) throw new Error('simulated lost acknowledgement');
      return state.persisted;
    },
    async loadBatch() {
      state.loadCalls += 1;
      if (loadFailure) throw new Error('simulated reconciliation read failure');
      return { meta: state.authoritativeMeta || state.persisted, orders: state.persistedOrders };
    }
  };
  const c = {
    Date,
    crypto: { randomUUID: () => 'synthetic-clear-unique' },
    console: { error() {}, warn() {} },
    activeBatch: state.visible,
    activeBatchId: 'batch-test',
    activeBatchIdRef: { current: 'batch-test' },
    activeBatchTransitionVersionRef: { current: 0 },
    batchStorageReady: true,
    batchApi,
    reviewSummary: { total: 1, ready: 1 },
    orders: state.orders,
    MappedOrders: [{ ...snapshot.orders[0] }],
    reprintSnapshotApi: {
      getBatchSnapshot: () => state.localSnapshot,
      validateSnapshot: value => value,
      clearBatchSnapshot: () => { state.localSnapshot = null; }
    },
    upsertBatchMeta: meta => { state.visible = meta; c.activeBatch = meta; },
    setOrders: orders => { state.orders = orders; c.orders = orders; },
    window: { confirm: () => true },
    duplicateApi: { clearBatchFingerprints() {} },
    // Upload busy gate: idle in this harness, so clear proceeds as before.
    uploadGateRef: { current: { isActive: () => false } },
    // Print gate and save guards: idle in this harness, so clear proceeds as before.
    saveGuardsApi: require('../packmaster-save-guards.js'),
    printFlightRef: { current: require('../packmaster-print-flow.js').createSingleFlight() },
    cloudMode: true,
    cloud: { async saveDocument() { throw new Error('completion must not write a separate document'); } },
    showToast: message => state.events.push(message)
  };
  vm.createContext(c);
  vm.runInContext(`${handlers}\nglobalThis.mark = markActiveBatchPrinted; globalThis.reset = resetActiveBatchCompletion; globalThis.clear = handleClearActiveBatch;`, c);
  return { c, state };
}

test('completion persists printedAt and the resolved snapshot in one Batch revision', async () => {
  const { c, state } = harness();
  assert.equal(await c.mark(), true);
  assert.equal(state.saveCalls.length, 1);
  assert.ok(state.saveCalls[0].meta.printedAt);
  assert.deepEqual(state.saveCalls[0].meta.resolvedSnapshot.orders.map(order => order.displayItems), [['Original Name']]);
  assert.equal(state.persisted.printedAt, state.persisted.resolvedSnapshot.completedAt);
  assert.equal(state.visible.printedAt, state.persisted.printedAt);
});

test('a rejected completion save leaves the persisted Batch and visible state uncompleted', async () => {
  const { c, state } = harness({ failSave: true });
  assert.equal(await c.mark(), false);
  assert.equal(state.persisted.printedAt, null);
  assert.equal(state.persisted.resolvedSnapshot, null);
  assert.equal(state.visible.printedAt, null);
  assert.equal(state.visible.resolvedSnapshot, null);
  assert.match(state.events.at(-1), /ไม่สำเร็จ/);
});

test('a lost save acknowledgement is reconciled against the authoritative Batch', async () => {
  const { c, state } = harness({ lostAcknowledgement: true });
  assert.equal(await c.mark(), true);
  assert.equal(state.persisted.printedAt, state.visible.printedAt);
  assert.deepEqual(state.visible.resolvedSnapshot, state.persisted.resolvedSnapshot);
});

test('reset keeps completion intact after a 409 revision conflict', async () => {
  const { c, state } = harness({ failSave: true, alreadyCompleted: true });
  await c.reset();
  assert.ok(state.persisted.printedAt);
  assert.ok(state.persisted.resolvedSnapshot);
  assert.ok(state.visible.printedAt);
  assert.ok(state.visible.resolvedSnapshot);
});

test('reset clears printedAt and history together only after Batch save succeeds', async () => {
  const { c, state } = harness({ alreadyCompleted: true });
  await c.reset();
  assert.equal(state.persisted.printedAt, null);
  assert.equal(state.persisted.resolvedSnapshot, null);
  assert.equal(state.visible.printedAt, null);
  assert.equal(state.visible.resolvedSnapshot, null);
});

test('reset reconciles a lost save acknowledgement from the authoritative Batch', async () => {
  const { c, state } = harness({ lostAcknowledgement: true, alreadyCompleted: true });
  assert.equal(await c.reset(), true);
  assert.equal(state.persisted.printedAt, null);
  assert.equal(state.persisted.resolvedSnapshot, null);
  assert.equal(state.visible.printedAt, null);
  assert.equal(state.visible.resolvedSnapshot, null);
});

test('reset reloads after a 409 and succeeds on retry without losing the old snapshot first', async () => {
  const { c, state } = harness({ failSaveOnce: true, alreadyCompleted: true });
  assert.equal(await c.reset(), false);
  assert.ok(state.persisted.printedAt);
  assert.ok(state.persisted.resolvedSnapshot);
  assert.ok(state.visible.printedAt);
  assert.ok(state.visible.resolvedSnapshot);
  assert.equal(state.loadCalls, 1, 'the 409 response must trigger an authoritative reload');

  assert.equal(await c.reset(), true);
  assert.equal(state.persisted.printedAt, null);
  assert.equal(state.persisted.resolvedSnapshot, null);
  assert.equal(state.visible.printedAt, null);
  assert.equal(state.visible.resolvedSnapshot, null);
});

test('reset refuses to continue when a 409 reveals newer Orders and adopts that authoritative revision', async () => {
  const local = [{ id: 'order-A', sku: 'A' }];
  const remote = [{ id: 'order-A', sku: 'A' }, { id: 'order-B', sku: 'B' }];
  const { c, state } = harness({ failSave: true, alreadyCompleted: true, localOrders: local, authoritativeOrders: remote,
    authoritativeMeta: { id: 'batch-test', printedAt: null, resolvedSnapshot: null } });

  assert.equal(await c.reset(), false, 'callers must stop their edit after discovering newer Batch contents');
  assert.deepEqual(state.orders.map(order => order.id), ['order-A', 'order-B']);
  assert.deepEqual(state.persistedOrders.map(order => order.id), ['order-A', 'order-B']);
  assert.equal(state.saveCalls.length, 1, 'do not retry a reset against the refreshed revision');
  assert.match(state.events.at(-1), /โหลดข้อมูลล่าสุด/);
});

test('clearing a completed Batch saves cleared completion metadata before changing the visible Orders', async () => {
  const { c, state } = harness({ alreadyCompleted: true });

  await c.clear();

  assert.equal(state.saveCalls.length, 1);
  assert.equal(state.saveCalls[0].meta.printedAt, null);
  assert.equal(state.saveCalls[0].meta.resolvedSnapshot, null);
  assert.equal(state.saveCalls[0].orders.length, 0);
  assert.equal(state.persisted.resolvedSnapshot, null);
  assert.equal(state.orders.length, 0);
  assert.equal(state.visible.resolvedSnapshot, null);
});

test('a failed clear save preserves the completed Batch and visible Orders', async () => {
  const { c, state } = harness({ failSave: true, alreadyCompleted: true });

  await c.clear();

  assert.equal(state.persisted.printedAt !== null, true);
  assert.ok(state.persisted.resolvedSnapshot);
  assert.equal(state.orders.length, 1);
  assert.ok(state.visible.resolvedSnapshot);
  assert.match(state.events.at(-1), /ยืนยันผลการล้างไม่ได้/);
});

test('clear reconciles a lost acknowledgement only when its exact cleared revision is authoritative', async () => {
  const { c, state } = harness({ lostAcknowledgement: true, alreadyCompleted: true });

  await c.clear();

  assert.equal(state.loadCalls, 1);
  assert.equal(state.persistedOrders.length, 0);
  assert.equal(state.visible.printedAt, null);
  assert.equal(state.visible.resolvedSnapshot, null);
  assert.equal(state.orders.length, 0);
  assert.match(state.events.at(-1), /เรียบร้อย/);
});

test('clear reconciles when Worker overwrites updatedAt after committing', async () => {
  const { c, state } = harness({ lostAcknowledgement: true, alreadyCompleted: true, serverTimestamp: true });
  await c.clear();
  assert.equal(state.orders.length, 0);
  assert.match(state.events.at(-1), /เรียบร้อย/);
});

test('clear keeps UI and sidecars when reconciliation sees an unrelated empty revision', async () => {
  const { c, state } = harness({ failSave: true, alreadyCompleted: true,
    authoritativeMeta: { id: 'batch-test', cloudRevision: 5, updatedAt: '2026-11-06T00:00:00.001Z', printedAt: null, resolvedSnapshot: null },
    authoritativeOrders: [] });
  state.localSnapshot = { id: 'old-sidecar' };

  await c.clear();

  assert.equal(state.orders.length, 1);
  assert.ok(state.visible.resolvedSnapshot);
  assert.deepEqual(state.localSnapshot, { id: 'old-sidecar' });
  assert.match(state.events.at(-1), /ยืนยันผลการล้างไม่ได้/);
});

test('clear reports uncertainty and preserves UI when authoritative reconciliation fails', async () => {
  const { c, state } = harness({ lostAcknowledgement: true, alreadyCompleted: true, loadFailure: true });

  await c.clear();

  assert.equal(state.persistedOrders.length, 0);
  assert.equal(state.orders.length, 1);
  assert.ok(state.visible.resolvedSnapshot);
  assert.match(state.events.at(-1), /ยืนยันผลการล้างไม่ได้/);
});

test('a late clear response cannot clear the newly active Batch UI', async () => {
  let releaseSave;
  const saveGate = () => new Promise(resolve => { releaseSave = resolve; });
  const { c, state } = harness({ saveGate });
  const pending = c.clear();
  await new Promise(resolve => setImmediate(resolve));
  c.activeBatchIdRef.current = 'batch-B';
  c.activeBatchId = 'batch-B';
  c.activeBatch = { id: 'batch-B', cloudRevision: 8 };
  state.orders = [{ id: 'order-B' }];
  c.orders = state.orders;
  releaseSave();

  await pending;

  assert.deepEqual(state.orders.map(order => order.id), ['order-B']);
  assert.equal(c.activeBatch.id, 'batch-B', 'the stale Clear must not update Batch B metadata');
});
