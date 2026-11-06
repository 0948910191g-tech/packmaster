import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('const resetActiveBatchCompletion =');
const end = html.indexOf('const handleClearActiveBatch =', start);
assert.ok(start >= 0 && end > start, 'completion handlers must remain extractable at the UI seam');
const handlers = html.slice(start, end);

function harness({ failSave = false, failSaveOnce = false, lostAcknowledgement = false, alreadyCompleted = false } = {}) {
  const snapshot = {
    batchId: 'batch-test', completedAt: '2026-11-06T00:00:00.000Z',
    orders: [{ id: 'order-1', displayItems: ['Original Name'], originalQty: 1,
      qtyWarning: false, unresolvedSku: false, resolvedAudit: [] }]
  };
  const state = {
    persisted: { id: 'batch-test', printedAt: alreadyCompleted ? snapshot.completedAt : null,
      resolvedSnapshot: alreadyCompleted ? snapshot : null },
    visible: { id: 'batch-test', printedAt: alreadyCompleted ? snapshot.completedAt : null,
      resolvedSnapshot: alreadyCompleted ? snapshot : null },
    events: [], saveCalls: [], localSnapshot: null, loadCalls: 0
  };
  let failuresRemaining = failSave ? Infinity : failSaveOnce ? 1 : 0;
  const batchApi = {
    buildBatchMeta: (meta, summary, overrides) => ({ ...meta, ...overrides }),
    async saveBatch(meta, orders) {
      state.saveCalls.push({ meta, orders });
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw Object.assign(new Error('injected revision conflict'), { status: 409 });
      }
      state.persisted = meta;
      if (lostAcknowledgement) throw new Error('simulated lost acknowledgement');
      return meta;
    },
    async loadBatch() { state.loadCalls += 1; return { meta: state.persisted, orders: [] }; }
  };
  const c = {
    Date,
    console: { error() {}, warn() {} },
    activeBatch: state.visible,
    activeBatchId: 'batch-test',
    batchStorageReady: true,
    batchApi,
    reviewSummary: { total: 1, ready: 1 },
    orders: [],
    MappedOrders: [{ ...snapshot.orders[0] }],
    reprintSnapshotApi: {
      getBatchSnapshot: () => state.localSnapshot,
      validateSnapshot: value => value,
      clearBatchSnapshot: () => { state.localSnapshot = null; }
    },
    upsertBatchMeta: meta => { state.visible = meta; c.activeBatch = meta; },
    setOrders: orders => { state.orders = orders; },
    cloudMode: true,
    cloud: { async saveDocument() { throw new Error('completion must not write a separate document'); } },
    showToast: message => state.events.push(message)
  };
  vm.createContext(c);
  vm.runInContext(`${handlers}\nglobalThis.mark = markActiveBatchPrinted; globalThis.reset = resetActiveBatchCompletion;`, c);
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
