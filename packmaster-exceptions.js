(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterExceptions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const includesText = (items, needle) => (Array.isArray(items) ? items : [])
    .some((item) => String(item || '').includes(needle));

  const getExceptionFlags = (mappedOrder) => {
    const order = mappedOrder || {};
    const parserWarning = Boolean(order.parserWarning);
    const reviewQty = Boolean(order.qtyWarning) || includesText(order.displayItems, 'ตรวจสอบ Qty');
    const reviewSku = parserWarning || includesText(order.displayItems, 'ตรวจสอบ SKU');
    const unmapped = includesText(order.displayItems, 'ยังไม่ตั้งชื่อ');
    return {
      reviewQty,
      reviewSku,
      parserWarning,
      unmapped,
      ready: !reviewQty && !reviewSku && !unmapped
    };
  };

  const getPrimaryStatus = (flags) => {
    const value = flags || {};
    if (value.reviewQty) return 'REVIEW_QTY';
    if (value.reviewSku || value.parserWarning) return 'REVIEW_SKU';
    if (value.unmapped) return 'UNMAPPED';
    return 'READY';
  };

  const getExceptionTypes = (flags) => {
    const types = [];
    if (flags.reviewQty) types.push('REVIEW_QTY');
    if (flags.reviewSku) types.push('REVIEW_SKU');
    if (flags.parserWarning) types.push('PARSER_WARNING');
    if (flags.unmapped) types.push('UNMAPPED');
    return types;
  };

  const buildExceptionRows = (mappedOrders) => (Array.isArray(mappedOrders) ? mappedOrders : [])
    .map((order, index) => {
      const flags = getExceptionFlags(order);
      return {
        order,
        index,
        flags,
        primaryStatus: getPrimaryStatus(flags),
        types: getExceptionTypes(flags)
      };
    })
    .filter((row) => row.types.length > 0);

  const filterExceptionRows = (rows, type = 'ALL', search = '') => {
    const needle = String(search || '').trim().toLowerCase();
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (type && type !== 'ALL' && !row.types.includes(type)) return false;
      if (!needle) return true;
      const order = row.order || {};
      const haystack = [
        order.tracking,
        order.orderId,
        order.platform,
        ...(Array.isArray(order.displayItems) ? order.displayItems : []),
        ...(Array.isArray(order.parsedItems) ? order.parsedItems.map((item) => item && item.text) : [])
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  };

  return {
    getExceptionFlags,
    getPrimaryStatus,
    getExceptionTypes,
    buildExceptionRows,
    filterExceptionRows
  };
});
