(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterBatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const DB_NAME = 'packmaster-local-v1';
  const DB_VERSION = 1;
  const META_STORE = 'batchMeta';
  const ORDERS_STORE = 'batchOrders';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const toNonNegativeInt = (value) => Math.max(0, parseInt(value, 10) || 0);

  const normalizeSummary = (summary) => ({
    total: toNonNegativeInt(summary && summary.total),
    ready: toNonNegativeInt(summary && summary.ready),
    reviewSku: toNonNegativeInt(summary && summary.reviewSku),
    reviewQty: toNonNegativeInt(summary && summary.reviewQty),
    unmapped: toNonNegativeInt(summary && summary.unmapped)
  });

  const deriveBatchStatus = (summary, printedAt = null) => {
    const clean = normalizeSummary(summary);
    if (printedAt) return 'COMPLETED';
    if (clean.total === 0) return 'WAITING';
    if (clean.reviewSku > 0 || clean.reviewQty > 0 || clean.unmapped > 0) return 'REVIEW';
    return 'READY';
  };

  const createBatchMeta = (existingBatches = [], now = new Date()) => {
    const date = now instanceof Date ? now : new Date(now);
    const sequence = (Array.isArray(existingBatches) ? existingBatches.length : 0) + 1;
    const createdAt = date.toISOString();
    const randomPart = Math.random().toString(36).slice(2, 8);

    return {
      id: `batch-${date.getTime()}-${randomPart}`,
      name: `${date.getDate()} ${MONTHS[date.getMonth()]} / Batch #${String(sequence).padStart(3, '0')}`,
      createdAt,
      updatedAt: createdAt,
      status: 'WAITING',
      printedAt: null,
      totalOrders: 0,
      readyCount: 0,
      reviewSkuCount: 0,
      reviewQtyCount: 0,
      unmappedCount: 0
    };
  };

  const buildBatchMeta = (meta, summary, overrides = {}) => {
    if (!meta || !meta.id) throw new Error('Batch metadata is required');
    const clean = normalizeSummary(summary);
    const nowValue = Object.prototype.hasOwnProperty.call(overrides, 'now') ? overrides.now : new Date();
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
    const printedAt = Object.prototype.hasOwnProperty.call(overrides, 'printedAt')
      ? overrides.printedAt
      : (meta.printedAt || null);

    return {
      ...meta,
      ...overrides,
      id: meta.id,
      printedAt,
      updatedAt: now.toISOString(),
      totalOrders: clean.total,
      readyCount: clean.ready,
      reviewSkuCount: clean.reviewSku,
      reviewQtyCount: clean.reviewQty,
      unmappedCount: clean.unmapped,
      status: deriveBatchStatus(clean, printedAt)
    };
  };

  const requestToPromise = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });

  const transactionToPromise = (transaction) => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });

  let dbPromise = null;

  const openDb = () => {
    if (dbPromise) return dbPromise;

    const indexedDb = root && root.indexedDB;
    if (!indexedDb) return Promise.reject(new Error('IndexedDB is not available in this browser'));

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          const metaStore = db.createObjectStore(META_STORE, { keyPath: 'id' });
          metaStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(ORDERS_STORE)) {
          db.createObjectStore(ORDERS_STORE, { keyPath: 'batchId' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('เปิด Local Batch storage ไม่สำเร็จ'));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error('Local Batch storage ถูก Browser block กรุณาปิดแท็บ PackMaster อื่นแล้วลองใหม่'));
      };
    });

    return dbPromise;
  };

  const listBatches = async () => {
    const db = await openDb();
    const tx = db.transaction(META_STORE, 'readonly');
    const rows = await requestToPromise(tx.objectStore(META_STORE).getAll());
    await transactionToPromise(tx);
    return (Array.isArray(rows) ? rows : []).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  };

  const saveBatch = async (meta, orders) => {
    if (!meta || !meta.id) throw new Error('Batch metadata is required');
    const db = await openDb();
    const tx = db.transaction([META_STORE, ORDERS_STORE], 'readwrite');
    tx.objectStore(META_STORE).put(meta);
    tx.objectStore(ORDERS_STORE).put({
      batchId: meta.id,
      orders: Array.isArray(orders) ? orders : [],
      updatedAt: meta.updatedAt || new Date().toISOString()
    });
    await transactionToPromise(tx);
    return meta;
  };

  const loadBatch = async (batchId) => {
    if (!batchId) throw new Error('Batch id is required');
    const db = await openDb();
    const tx = db.transaction([META_STORE, ORDERS_STORE], 'readonly');
    const metaRequest = tx.objectStore(META_STORE).get(batchId);
    const ordersRequest = tx.objectStore(ORDERS_STORE).get(batchId);
    const [meta, orderRecord] = await Promise.all([
      requestToPromise(metaRequest),
      requestToPromise(ordersRequest)
    ]);
    await transactionToPromise(tx);
    return {
      meta: meta || null,
      orders: orderRecord && Array.isArray(orderRecord.orders) ? orderRecord.orders : []
    };
  };

  const deleteBatch = async (batchId) => {
    if (!batchId) throw new Error('Batch id is required');
    const db = await openDb();
    const tx = db.transaction([META_STORE, ORDERS_STORE], 'readwrite');
    tx.objectStore(META_STORE).delete(batchId);
    tx.objectStore(ORDERS_STORE).delete(batchId);
    await transactionToPromise(tx);
  };

  return {
    DB_NAME,
    DB_VERSION,
    createBatchMeta,
    deriveBatchStatus,
    buildBatchMeta,
    listBatches,
    saveBatch,
    loadBatch,
    deleteBatch
  };
});
