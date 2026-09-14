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

const logicalOrders = [
  { id: 'blocked-main', orderId: 'ORDER-1', ready: false },
  { id: 'blocked-cont', orderId: 'ORDER-1', isContinuation: true, ready: true },
  { id: 'ready-main', orderId: 'ORDER-2', ready: true },
  { id: 'ready-cont', orderId: 'ORDER-2', isContinuation: true, ready: true },
  { id: 'no-order-ready', orderId: null, ready: true },
  { id: 'no-order-blocked', orderId: null, ready: false }
];

assert.deepEqual(
  helpers.selectPrintOrders(logicalOrders, 'READY_ONLY', isReady).map(row => row.id),
  ['ready-main', 'ready-cont', 'no-order-ready'],
  'READY_ONLY must select whole logical orders and must not leak a ready continuation from a blocked main order'
);
assert.deepEqual(
  helpers.selectPrintOrders(logicalOrders, 'FULL_BATCH', isReady).map(row => row.id),
  logicalOrders.map(row => row.id),
  'FULL_BATCH must remain row-preserving'
);

const missingOrderIdRows = [
  { id: 'undefined-ready', ready: true },
  { id: 'undefined-blocked', ready: false }
];
assert.deepEqual(
  helpers.selectPrintOrders(missingOrderIdRows, 'READY_ONLY', isReady).map(row => row.id),
  ['undefined-ready'],
  'records without an orderId must preserve row-level readiness instead of being grouped together'
);
