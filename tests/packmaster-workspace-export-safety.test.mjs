import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const workspace = require('../packmaster-workspace.js');

const batchApi = (listBatches, loadBatch) => ({
  listBatches,
  loadBatch,
  async saveBatch() {},
  async deleteBatch() {}
});

const collect = api => workspace.collectBackupPayload({
  batchApi: api,
  skuRules: [],
  settings: {},
  appVersion: 'synthetic-test'
});

const metadata = new Map([['synthetic-sidecar-missing', { id: 'synthetic-sidecar-missing' }]]);
const orderRecords = new Map();
globalThis.indexedDB = {
  open() {
    const request = {};
    setTimeout(() => {
      request.result = {
        transaction() {
          const transaction = {};
          let requests = 0;
          transaction.objectStore = storeName => ({
            get(id) {
              const read = {};
              requests += 1;
              setTimeout(() => {
                read.result = (storeName === 'batchMeta' ? metadata : orderRecords).get(id);
                if (typeof read.onsuccess === 'function') read.onsuccess();
                if (requests === 2) {
                  setTimeout(() => {
                    if (typeof transaction.oncomplete === 'function') transaction.oncomplete();
                  }, 0);
                }
              }, 0);
              return read;
            }
          });
          return transaction;
        }
      };
      request.onsuccess();
    }, 0);
    return request;
  }
};
const batch = require('../packmaster-batch.js');
const exportApiWithMissingSidecar = batchApi(
  async () => [{ id: 'synthetic-sidecar-missing' }],
  batch.loadBatch
);
assert.deepEqual((await batch.loadBatch('synthetic-sidecar-missing')).orders, [],
  'default batch loading must retain its existing missing-sidecar behavior');
await assert.rejects(
  () => batch.loadBatch('synthetic-sidecar-missing', { requireOrders: true }),
  /order record|missing|invalid/i,
  'strict loading must reject a missing order record'
);
await assert.rejects(
  () => collect(exportApiWithMissingSidecar),
  /order|sidecar|missing|load/i,
  'workspace export must reject a missing IndexedDB order record'
);
orderRecords.set('synthetic-sidecar-missing', { batchId: 'synthetic-sidecar-missing', orders: [] });
assert.deepEqual((await batch.loadBatch('synthetic-sidecar-missing', { requireOrders: true })).orders, [],
  'strict loading must accept a present, valid empty orders record');
assert.equal((await collect(exportApiWithMissingSidecar)).batchOrders[0].orders.length, 0,
  'workspace export must preserve batches with valid empty orders');

const emptyExport = await collect(batchApi(async () => [], async () => null));
assert.deepEqual(emptyExport.batches, [], 'a valid empty store must remain exportable');
assert.deepEqual(emptyExport.batchOrders, []);

await assert.rejects(
  () => collect(batchApi(async () => [{ id: 'synthetic-unreadable' }], async () => null)),
  /load|unreadable|missing|invalid/i,
  'an unreadable listed batch must fail the backup export'
);

await assert.rejects(
  () => collect(batchApi(async () => [{ id: 'synthetic-requested' }], async () => ({
    meta: { id: 'synthetic-different' },
    orders: []
  }))),
  /id|identity|match/i,
  'a loaded batch with a different identity must fail the backup export'
);

await assert.rejects(
  () => collect(batchApi(async () => [{ id: 'synthetic-no-orders' }], async () => ({
    meta: { id: 'synthetic-no-orders' },
    orders: null
  }))),
  /orders|array/i,
  'a loaded batch without an orders array must fail the backup export'
);

for (const invalidList of [null, {}, [{ name: 'missing-id' }]]) {
  await assert.rejects(
    () => collect(batchApi(async () => invalidList, async () => null)),
    /list|batch|array|id/i,
    'an invalid batch list must fail instead of exporting an incomplete backup'
  );
}

console.log('PackMaster workspace export safety tests passed');
