(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterManualItems = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STALE_MESSAGE = 'ออเดอร์นี้ถูกแก้ไขแล้ว กรุณาโหลดหน้าใหม่';
  const QTY_MISMATCH_MESSAGE = 'จำนวนรวมไม่ตรงกับยอดรวมในใบ — ติ๊กยืนยันก่อนบันทึก';

  // An order is unreadable when the parser produced no line items for it.
  // Continuation pages never own items; they belong to their parent order.
  const isUnreadableOrder = (order) => Boolean(
    order &&
    !order.isContinuation &&
    (!Array.isArray(order.parsedItems) || order.parsedItems.length === 0)
  );

  const hasManualItems = (order) => Array.isArray(order && order.parsedItems) &&
    order.parsedItems.some((item) => Boolean(item && item.manualEntry === true));

  // Collapse invisible spaces (zero-width, BOM, NBSP) and runs of whitespace into single spaces.
  const normalizeText = (value) => String(value == null ? '' : value)
    .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parseQty = (value) => {
    const text = normalizeText(value);
    if (!/^\d{1,6}$/.test(text)) return NaN;
    return Number(text);
  };

  // Validates the rows typed in the Review dialog. Blank shortName is allowed: the item stays
  // unnamed and goes through the normal naming flow, so the order is not ready until it is named.
  // Failures name the offending row and field so the UI can focus it.
  const buildManualItems = (rows) => {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
      return { ok: false, error: 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ', rowIndex: -1, field: '' };
    }
    const items = [];
    let total = 0;
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index] || {};
      const text = normalizeText(row.text);
      if (!text) {
        return { ok: false, error: `รายการที่ ${index + 1}: กรุณากรอกชื่อสินค้าตามใบ`, rowIndex: index, field: 'text' };
      }
      const qty = parseQty(row.qty);
      if (!Number.isSafeInteger(qty) || qty < 1) {
        return { ok: false, error: `รายการที่ ${index + 1}: Qty ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป`, rowIndex: index, field: 'qty' };
      }
      items.push({ text, qty, shortName: normalizeText(row.shortName) });
      total += qty;
    }
    return { ok: true, items, total };
  };

  // Compares the typed quantity total with the total declared on the PDF. The mismatch is only
  // reported once every row has a valid quantity, so a half-typed row does not raise a false alarm.
  const summarizeManualQty = (rows, declaredTotalQty) => {
    const list = Array.isArray(rows) ? rows : [];
    const declared = Number.isFinite(declaredTotalQty) ? declaredTotalQty : null;
    let total = 0;
    let complete = true;
    list.forEach((row) => {
      const qty = parseQty(row && row.qty);
      if (Number.isSafeInteger(qty) && qty >= 1) total += qty;
      else complete = false;
    });
    return {
      total,
      declaredTotalQty: declared,
      complete,
      mismatch: declared !== null && complete && total !== declared
    };
  };

  // Returns a new order with manual items filled in. Only parsedItems, the per-row manual name
  // overrides and an audit timestamp change; source/customer fields are copied unchanged.
  const applyManualItems = (order, rows, nowValue) => {
    // Fail safe: an order that already has items (e.g. filled in another tab) is returned unchanged.
    if (!isUnreadableOrder(order)) return order;
    const built = buildManualItems(rows);
    if (!built.ok) throw new Error(built.error);
    const date = nowValue == null ? new Date() : new Date(nowValue);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid manual item timestamp');

    const parsedItems = built.items.map((item) => ({ text: item.text, qty: item.qty, manualEntry: true }));
    const manualSkuOverrides = built.items
      .map((item, index) => (item.shortName
        ? { itemKey: `row:${index}`, sourceText: item.text, shortName: item.shortName }
        : null))
      .filter(Boolean);

    return {
      ...order,
      parsedItems,
      manualSkuOverrides,
      manualItemsAddedAt: date.toISOString()
    };
  };

  // Decides a save against the latest stored order. Returns a result object instead of throwing so
  // the UI can show the right message and focus the right field. Nothing is written unless ok is true.
  //   reason 'stale'         the order was deleted, filled elsewhere, or is no longer unreadable
  //   reason 'invalid'       a row is missing text or has a bad qty (rowIndex and field say where)
  //   reason 'qty_mismatch'  typed total differs from the declared total and was not confirmed
  const planManualItemsSave = (latestOrder, rows, options) => {
    const opts = options || {};
    if (!isUnreadableOrder(latestOrder)) return { ok: false, reason: 'stale', error: STALE_MESSAGE };
    const built = buildManualItems(rows);
    if (!built.ok) {
      return { ok: false, reason: 'invalid', error: built.error, rowIndex: built.rowIndex, field: built.field };
    }
    const summary = summarizeManualQty(rows, latestOrder.declaredTotalQty);
    if (summary.mismatch && opts.qtyMismatchConfirmed !== true) {
      return {
        ok: false,
        reason: 'qty_mismatch',
        error: QTY_MISMATCH_MESSAGE,
        total: summary.total,
        declaredTotalQty: summary.declaredTotalQty
      };
    }
    const order = applyManualItems(latestOrder, rows, opts.now);
    return {
      ok: true,
      order,
      total: summary.total,
      declaredTotalQty: summary.declaredTotalQty,
      qtyMismatchConfirmed: summary.mismatch
    };
  };

  return {
    STALE_MESSAGE,
    QTY_MISMATCH_MESSAGE,
    isUnreadableOrder,
    hasManualItems,
    buildManualItems,
    summarizeManualQty,
    applyManualItems,
    planManualItemsSave
  };
});
