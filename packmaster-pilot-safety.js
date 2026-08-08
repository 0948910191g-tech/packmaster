(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterPilotSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const toCount = (value) => Math.max(0, parseInt(value, 10) || 0);

  const hasBlockingExceptions = (exceptionRows) => (Array.isArray(exceptionRows) ? exceptionRows : [])
    .some((row) => Array.isArray(row && row.types) && row.types.length > 0);

  const getEffectiveBatchStatus = (batch) => {
    const value = batch || {};
    const total = toCount(value.totalOrders);
    const reviewSku = toCount(value.reviewSkuCount);
    const reviewQty = toCount(value.reviewQtyCount);
    const unmapped = toCount(value.unmappedCount);

    if (total === 0) return 'WAITING';
    if (reviewSku > 0 || reviewQty > 0 || unmapped > 0) return 'REVIEW';
    if (value.printedAt || value.status === 'COMPLETED') return 'COMPLETED';
    if (value.status === 'REVIEW') return 'REVIEW';
    return 'READY';
  };

  const getSkuFixSeed = (row) => {
    const value = row || {};
    const types = Array.isArray(value.types) ? value.types : [];
    const skuFixable = types.includes('UNMAPPED') || types.includes('REVIEW_SKU') || types.includes('PARSER_WARNING');
    if (!skuFixable) return '';

    const items = Array.isArray(value.order && value.order.parsedItems) ? value.order.parsedItems : [];
    const candidates = items.filter((item) => item && String(item.text || '').trim());
    if (candidates.length === 0) return '';

    const prioritized = candidates.find((item) => {
      const status = String(item.matchStatus || '').toUpperCase();
      return status === 'UNMAPPED' || status === 'REVIEW_SKU' || item.matched === false;
    });

    return String((prioritized || candidates[0]).text || '').trim();
  };

  return {
    hasBlockingExceptions,
    getEffectiveBatchStatus,
    getSkuFixSeed
  };
});
