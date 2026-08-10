import fs from 'node:fs';
import assert from 'node:assert/strict';

const modulePath = new URL('../packmaster-print-scope.js', import.meta.url);
assert.equal(fs.existsSync(modulePath), true, 'print scope helper module must exist');

const api = await import(modulePath.href);
const helpers = api.default || api;
const orders = [
  { id: 'ready-1', ready: true },
  { id: 'review-1', ready: false },
  { id: 'ready-2', ready: true }
];
const isReady = (order) => order.ready === true;

assert.deepEqual(helpers.selectPrintOrders(orders, 'READY_ONLY', isReady).map(row => row.id), ['ready-1', 'ready-2']);
assert.deepEqual(helpers.selectPrintOrders(orders, 'FULL_BATCH', isReady).map(row => row.id), ['ready-1', 'review-1', 'ready-2']);
assert.deepEqual(helpers.selectPrintOrders([], 'READY_ONLY', isReady), []);
assert.throws(() => helpers.selectPrintOrders(orders, 'UNKNOWN', isReady), /print scope/i);

console.log('PackMaster print scope contract passed');
