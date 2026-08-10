(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterBatchSourceFiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const summarizeBatchSourceFiles = (orders, visibleLimit = 2) => {
    const limit = Math.max(1, parseInt(visibleLimit, 10) || 2);
    const seen = new Set();
    const allNames = [];

    (Array.isArray(orders) ? orders : []).forEach((order) => {
      const name = String(order && order.sourceFileName || '').trim();
      if (!name) return;
      const key = name.toLocaleLowerCase('en-US');
      if (seen.has(key)) return;
      seen.add(key);
      allNames.push(name);
    });

    if (allNames.length === 0) {
      return { names: [], total: 0, hiddenCount: 0, label: 'ยังไม่มีไฟล์' };
    }

    const names = allNames.slice(0, limit);
    const hiddenCount = Math.max(0, allNames.length - names.length);
    const label = hiddenCount > 0
      ? `${names.join(' • ')} • +${hiddenCount} ไฟล์`
      : names.join(' • ');

    return {
      names,
      total: allNames.length,
      hiddenCount,
      label
    };
  };

  return { summarizeBatchSourceFiles };
});
