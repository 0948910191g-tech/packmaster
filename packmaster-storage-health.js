(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterStorageHealth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const estimateStorage = async (navigatorLike) => {
    const nav = navigatorLike || (typeof navigator !== 'undefined' ? navigator : null);
    if (!nav || !nav.storage || typeof nav.storage.estimate !== 'function') {
      return { supported: false, usage: null, quota: null, percent: null };
    }
    try {
      const result = await nav.storage.estimate();
      const usage = Number.isFinite(Number(result && result.usage)) ? Number(result.usage) : 0;
      const quota = Number.isFinite(Number(result && result.quota)) ? Number(result.quota) : 0;
      const percent = quota > 0 ? Math.min(100, Math.round((usage / quota) * 1000) / 10) : null;
      return { supported: true, usage, quota, percent };
    } catch (error) {
      return { supported: false, usage: null, quota: null, percent: null };
    }
  };

  const stripReprintPayload = (order) => {
    if (!order || typeof order !== 'object') return order;
    const { pdfImage, ...rest } = order;
    return rest;
  };

  const cleanupArchivedReprintImages = async (batchApi, batchIds, isArchived) => {
    if (!batchApi || typeof batchApi.loadBatch !== 'function' || typeof batchApi.saveBatch !== 'function') {
      throw new Error('Local Batch API is required');
    }
    if (typeof isArchived !== 'function') {
      throw new Error('Archive state predicate is required for safe cleanup');
    }

    const ids = [...new Set((Array.isArray(batchIds) ? batchIds : []).filter(Boolean))];
    let cleanedBatches = 0;
    let cleanedOrders = 0;
    let skippedBatches = 0;

    for (const batchId of ids) {
      const loaded = await batchApi.loadBatch(batchId);
      if (!loaded || !loaded.meta || !isArchived(loaded.meta)) {
        skippedBatches += 1;
        continue;
      }

      const sourceOrders = Array.isArray(loaded.orders) ? loaded.orders : [];
      const nextOrders = sourceOrders.map(stripReprintPayload);
      const removedCount = sourceOrders.reduce((count, order) => (
        count + (order && Object.prototype.hasOwnProperty.call(order, 'pdfImage') ? 1 : 0)
      ), 0);

      if (removedCount === 0) {
        skippedBatches += 1;
        continue;
      }

      await batchApi.saveBatch(loaded.meta, nextOrders);
      cleanedBatches += 1;
      cleanedOrders += removedCount;
    }

    return { cleanedBatches, cleanedOrders, skippedBatches };
  };

  const formatBytes = (bytes) => {
    const value = Math.max(0, Number(bytes) || 0);
    if (value === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    const amount = value / Math.pow(1024, index);
    return `${amount >= 10 || index === 0 ? Math.round(amount) : Math.round(amount * 10) / 10} ${units[index]}`;
  };

  return { estimateStorage, stripReprintPayload, cleanupArchivedReprintImages, formatBytes };
});
