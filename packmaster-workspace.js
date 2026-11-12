(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterWorkspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
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
    if (candidate.settings.reprintSnapshots != null) {
      if (!isPlainObject(candidate.settings.reprintSnapshots)) {
        throw new Error('settings.reprintSnapshots must be an object');
      }
      const snapshotValidator = (typeof root !== 'undefined' && root && root.PackMasterReprintSnapshot && typeof root.PackMasterReprintSnapshot.validateSnapshot === 'function')
        ? root.PackMasterReprintSnapshot.validateSnapshot
        : null;

      for (const [batchId, snap] of Object.entries(candidate.settings.reprintSnapshots)) {
        if (snapshotValidator) {
          const validated = snapshotValidator(snap);
          if (validated.batchId !== batchId) throw new Error(`Resolved snapshot key mismatch: ${batchId}`);
        } else {
          if (!isPlainObject(snap) || snap.batchId !== batchId) {
            throw new Error(`Invalid reprintSnapshots entry for batch: ${batchId}`);
          }
          if (typeof snap.completedAt !== 'string' || Number.isNaN(Date.parse(snap.completedAt))) {
            throw new Error(`Invalid reprintSnapshots completedAt for batch: ${batchId}`);
          }
          if (!Array.isArray(snap.orders)) {
            throw new Error(`Invalid reprintSnapshots orders for batch: ${batchId}`);
          }
          const seenIds = new Set();
          for (const order of snap.orders) {
            if (!isPlainObject(order) || typeof order.id !== 'string' || !order.id.trim()) {
              throw new Error(`Invalid reprintSnapshots order in batch: ${batchId}`);
            }
            if (seenIds.has(order.id)) {
              throw new Error(`Duplicate reprintSnapshots order id: ${order.id}`);
            }
            seenIds.add(order.id);
            if (!Array.isArray(order.displayItems) || !Array.isArray(order.resolvedAudit)) {
              throw new Error(`Invalid reprintSnapshots order structure in batch: ${batchId}`);
            }
          }
        }
      }
    }

    if (candidate.settings.registryAssignments != null) {
      if (!isPlainObject(candidate.settings.registryAssignments) ||
          candidate.settings.registryAssignments.schema !== 'packmaster-registry-sku-assignments' ||
          ![1, 2].includes(candidate.settings.registryAssignments.version) ||
          !Array.isArray(candidate.settings.registryAssignments.entries)) {
        throw new Error('settings.registryAssignments must be a valid registry assignments object');
      }
      const matcherValidator = (typeof root !== 'undefined' && root && root.PackMasterRegistryMatcher && typeof root.PackMasterRegistryMatcher.validateAssignments === 'function')
        ? root.PackMasterRegistryMatcher.validateAssignments
        : null;
      if (matcherValidator) {
        matcherValidator(candidate.settings.registryAssignments);
      } else if (candidate.settings.registryAssignments.version === 2) {
        throw new Error('Registry assignment validator is required for version 2 aliases');
      }
    }

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
      const seenOrderIds = new Set();
      record.orders.forEach((order, orderIndex) => {
        if (order && typeof order.id === 'string') {
          if (seenOrderIds.has(order.id)) {
            throw new Error(`Duplicate order.id in batch ${record.batchId}: ${order.id}`);
          }
          seenOrderIds.add(order.id);
        }
        const orderPath = `batchOrders[${record.batchId}].orders[${orderIndex}]`;
        if (!isPlainObject(order) || typeof order.id !== 'string' || !order.id.trim()) {
          throw new Error(`${orderPath}.id must be a non-empty string`);
        }
        requireArray(order.parsedItems, `${orderPath}.parsedItems`);
        order.parsedItems.forEach((item, itemIndex) => {
          const itemPath = `${orderPath}.parsedItems[${itemIndex}]`;
          if (!isPlainObject(item) || typeof item.text !== 'string' || !item.text.trim()) {
            throw new Error(`${itemPath}.text must be a non-empty string`);
          }
          if (!Number.isInteger(item.qty) || item.qty < 1) {
            throw new Error(`${itemPath}.qty must be an integer >= 1`);
          }
        });
      });
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
      registryAssignments: Array.isArray(backup.settings?.registryAssignments?.entries)
        ? backup.settings.registryAssignments.entries.length
        : 0,
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
    if (!Array.isArray(listed)) throw new Error('Batch list could not be read for workspace backup');
    const batches = [];
    const batchOrders = [];

    for (const listedMeta of listed) {
      if (!isPlainObject(listedMeta) || typeof listedMeta.id !== 'string' || !listedMeta.id.trim()) {
        throw new Error('Batch list contains an invalid batch identity');
      }
      const loaded = await batchApi.loadBatch(listedMeta.id, { requireOrders: true });
      if (!isPlainObject(loaded) || !isPlainObject(loaded.meta)) {
        throw new Error(`Batch ${listedMeta.id} could not be loaded for workspace backup`);
      }
      if (loaded.meta.id !== listedMeta.id) {
        throw new Error(`Loaded batch identity does not match requested batch: ${listedMeta.id}`);
      }
      if (!Array.isArray(loaded.orders)) {
        throw new Error(`Loaded batch orders must be an array: ${listedMeta.id}`);
      }
      const meta = loaded.meta;
      const orders = loaded.orders;
      batches.push(cloneJson(meta));
      batchOrders.push({ batchId: meta.id, orders: cloneJson(orders) });
    }

    const payload = {
      appVersion: typeof appVersion === 'string' ? appVersion : '',
      settings: cloneJson(isPlainObject(settings) ? settings : {}),
      skuRules: cloneJson(Array.isArray(skuRules) ? skuRules : []),
      batches,
      batchOrders
    };
    createBackup(payload);
    return payload;
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
