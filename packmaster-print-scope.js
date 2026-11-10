(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterPrintScope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const selectPrintOrders = (orders, mode, isReady) => {
    const rows = Array.isArray(orders) ? orders : [];
    if (mode === 'FULL_BATCH') return [...rows];
    if (mode === 'READY_ONLY') {
      if (typeof isReady !== 'function') return [];
      const logicalReadiness = new Map();
      rows.forEach((order) => {
        const orderId = order && order.orderId != null ? String(order.orderId).trim() : '';
        if (!orderId) return;
        const platform = String(order && order.platform || '').trim().toUpperCase();
        const key = JSON.stringify([platform, orderId]);
        const current = logicalReadiness.has(key) ? logicalReadiness.get(key) : true;
        logicalReadiness.set(key, current && isReady(order));
      });
      return rows.filter((order) => {
        const orderId = order && order.orderId != null ? String(order.orderId).trim() : '';
        const platform = String(order && order.platform || '').trim().toUpperCase();
        return orderId ? logicalReadiness.get(JSON.stringify([platform, orderId])) === true : isReady(order);
      });
    }
    throw new Error(`Unknown print scope: ${mode}`);
  };

  return { selectPrintOrders };
});
