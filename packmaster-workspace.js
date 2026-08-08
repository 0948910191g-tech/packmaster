(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterWorkspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'packmaster-workspace-backup';
  const VERSION = 1;

  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const cloneJson = (value) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      throw new Error('Workspace backup contains data that cannot be serialized as JSON');
    }
  };

  const requireArray = (value, name) => {
    if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  };

  const validateBackup = (candidate) => {
    if (!isPlainObject(candidate)) throw new Error('Workspace backup must be an object');
    if (candidate.schema !== SCHEMA) throw new Error(`Unsupported backup schema: expected ${SCHEMA}`);
    if (candidate.version !== VERSION) throw new Error(`Unsupported backup version: expected ${VERSION}`);
    if (typeof candidate.createdAt !== 'string' || Number.isNaN(Date.parse(candidate.createdAt))) {
      throw new Error('createdAt must be a valid ISO date string');
    }
    if (typeof candidate.appVersion !== 'string') throw new Error('appVersion must be a string');
    if (!isPlainObject(candidate.settings)) throw new Error('settings must be an object');

    requireArray(candidate.skuRules, 'skuRules');
    requireArray(candidate.batches, 'batches');
    requireArray(candidate.batchOrders, 'batchOrders');

    candidate.skuRules.forEach((rule, index) => {
      if (!isPlainObject(rule) ||
          typeof rule.keyword !== 'string' || !rule.keyword.trim() ||
          typeof rule.shortName !== 'string' || !rule.shortName.trim()) {
        throw new Error(`skuRules[${index}] must contain non-empty string keyword and shortName`);
      }
    });

    const batchIds = new Set();
    for (const batch of candidate.batches) {
      if (!isPlainObject(batch) || typeof batch.id !== 'string' || !batch.id.trim()) {
        throw new Error('Every batch must have a non-empty id');
      }
      if (batchIds.has(batch.id)) throw new Error(`Duplicate batch id: ${batch.id}`);
      batchIds.add(batch.id);
    }

    const orderRecordIds = new Set();
    for (const record of candidate.batchOrders) {
      if (!isPlainObject(record) || typeof record.batchId !== 'string' || !record.batchId.trim()) {
        throw new Error('Every batchOrders record must have a non-empty batchId');
      }
      if (!batchIds.has(record.batchId)) throw new Error(`batchOrders references missing batch: ${record.batchId}`);
      if (orderRecordIds.has(record.batchId)) throw new Error(`Duplicate batchOrders record: ${record.batchId}`);
      requireArray(record.orders, `batchOrders[${record.batchId}].orders`);
      orderRecordIds.add(record.batchId);
    }

    for (const batchId of batchIds) {
      if (!orderRecordIds.has(batchId)) throw new Error(`Missing batchOrders record for batch: ${batchId}`);
    }

    return candidate;
  };

  const createBackup = (payload, now = new Date()) => {
    if (!isPlainObject(payload)) throw new Error('Workspace payload is required');
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid backup date');

    const backup = {
      schema: SCHEMA,
      version: VERSION,
      createdAt: date.toISOString(),
      appVersion: typeof payload.appVersion === 'string' ? payload.appVersion : '',
      settings: cloneJson(isPlainObject(payload.settings) ? payload.settings : {}),
      skuRules: cloneJson(Array.isArray(payload.skuRules) ? payload.skuRules : []),
      batches: cloneJson(Array.isArray(payload.batches) ? payload.batches : []),
      batchOrders: cloneJson(Array.isArray(payload.batchOrders) ? payload.batchOrders : [])
    };

    return validateBackup(backup);
  };

  const getBackupSummary = (candidate) => {
    const backup = validateBackup(candidate);
    const orders = backup.batchOrders.reduce((sum, row) => sum + row.orders.length, 0);
    return {
      skuRules: backup.skuRules.length,
      batches: backup.batches.length,
      orders,
      createdAt: backup.createdAt
    };
  };

  const requireBatchApi = (batchApi) => {
    if (!batchApi || typeof batchApi !== 'object') throw new Error('Batch API is required');
    for (const method of ['listBatches', 'loadBatch', 'saveBatch', 'deleteBatch']) {
      if (typeof batchApi[method] !== 'function') throw new Error(`Batch API missing ${method}()`);
    }
  };

  const collectBackupPayload = async ({ batchApi, skuRules, settings, appVersion }) => {
    requireBatchApi(batchApi);
    const listed = await batchApi.listBatches();
    const batches = [];
    const batchOrders = [];

    for (const listedMeta of Array.isArray(listed) ? listed : []) {
      if (!listedMeta || !listedMeta.id) continue;
      const loaded = await batchApi.loadBatch(listedMeta.id);
      const meta = loaded && loaded.meta ? loaded.meta : listedMeta;
      const orders = loaded && Array.isArray(loaded.orders) ? loaded.orders : [];
      batches.push(cloneJson(meta));
      batchOrders.push({ batchId: meta.id, orders: cloneJson(orders) });
    }

    return {
      appVersion: typeof appVersion === 'string' ? appVersion : '',
      settings: cloneJson(isPlainObject(settings) ? settings : {}),
      skuRules: cloneJson(Array.isArray(skuRules) ? skuRules : []),
      batches,
      batchOrders
    };
  };

  const replaceWorkspaceBatches = async (candidate, batchApi) => {
    requireBatchApi(batchApi);
    const backup = validateBackup(candidate);
    const existing = await batchApi.listBatches();

    for (const batch of Array.isArray(existing) ? existing : []) {
      if (batch && batch.id) await batchApi.deleteBatch(batch.id);
    }

    const ordersByBatchId = new Map(backup.batchOrders.map(row => [row.batchId, row.orders]));
    for (const meta of backup.batches) {
      await batchApi.saveBatch(cloneJson(meta), cloneJson(ordersByBatchId.get(meta.id) || []));
    }
  };

  return {
    SCHEMA,
    VERSION,
    createBackup,
    validateBackup,
    getBackupSummary,
    collectBackupPayload,
    replaceWorkspaceBatches
  };
});
