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
      return rows.filter((order) => isReady(order));
    }
    throw new Error(`Unknown print scope: ${mode}`);
  };

  return { selectPrintOrders };
});
