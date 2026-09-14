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
        const current = logicalReadiness.has(orderId) ? logicalReadiness.get(orderId) : true;
        logicalReadiness.set(orderId, current && isReady(order));
      });
      return rows.filter((order) => {
        const orderId = order && order.orderId != null ? String(order.orderId).trim() : '';
        return orderId ? logicalReadiness.get(orderId) === true : isReady(order);
      });
    }
    throw new Error(`Unknown print scope: ${mode}`);
  };

  return { selectPrintOrders };
});
