(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterReviewOverrides = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const normalizeOverrideKey = (value) => String(value == null ? '' : value)
    .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const normalizeReviewType = (value) => {
    const type = String(value == null ? '' : value).trim().toLowerCase();
    return type === 'sku' || type === 'qty' ? type : '';
  };

  const getManualSkuOverride = (order, sourceText) => {
    const key = normalizeOverrideKey(sourceText);
    if (!key) return null;
    const overrides = Array.isArray(order && order.manualSkuOverrides) ? order.manualSkuOverrides : [];
    const match = overrides.find((row) => normalizeOverrideKey(row && row.sourceText) === key);
    if (!match || !String(match.shortName || '').trim()) return null;
    return {
      sourceText: String(match.sourceText || '').trim(),
      shortName: String(match.shortName || '').trim()
    };
  };

  const upsertManualSkuOverride = (order, sourceText, shortName) => {
    const source = String(sourceText == null ? '' : sourceText).trim();
    const name = String(shortName == null ? '' : shortName).trim();
    const key = normalizeOverrideKey(source);
    if (!order || !key || !name) return order;

    const existing = Array.isArray(order.manualSkuOverrides) ? order.manualSkuOverrides : [];
    const nextOverrides = existing
      .filter((row) => normalizeOverrideKey(row && row.sourceText) !== key)
      .map((row) => ({ ...row }));
    nextOverrides.push({ sourceText: source, shortName: name });

    return { ...order, manualSkuOverrides: nextOverrides };
  };

  const getReviewAcknowledgement = (order, type) => {
    const key = normalizeReviewType(type);
    if (!key) return false;
    const acknowledgement = order && order.reviewAcknowledgements && order.reviewAcknowledgements[key];
    return Boolean(acknowledgement && acknowledgement.confirmed === true);
  };

  const confirmReview = (order, type, nowValue) => {
    const key = normalizeReviewType(type);
    if (!order || !key) return order;
    const existing = order.reviewAcknowledgements && typeof order.reviewAcknowledgements === 'object'
      ? order.reviewAcknowledgements
      : {};
    const date = nowValue == null ? new Date() : new Date(nowValue);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid confirmation timestamp');
    return {
      ...order,
      reviewAcknowledgements: {
        ...existing,
        [key]: {
          confirmed: true,
          confirmedAt: date.toISOString()
        }
      }
    };
  };

  const clearReviewConfirmation = (order, type) => {
    const key = normalizeReviewType(type);
    if (!order || !key) return order;
    const existing = order.reviewAcknowledgements && typeof order.reviewAcknowledgements === 'object'
      ? order.reviewAcknowledgements
      : {};
    const next = { ...existing };
    delete next[key];
    return { ...order, reviewAcknowledgements: next };
  };

  const getQtyOverride = (order, sourceText) => {
    const key = normalizeOverrideKey(sourceText);
    if (!key) return null;
    const overrides = Array.isArray(order && order.reviewQtyOverrides) ? order.reviewQtyOverrides : [];
    const match = overrides.find((row) => normalizeOverrideKey(row && row.sourceText) === key);
    const qty = Number(match && match.qty);
    if (!match || !Number.isInteger(qty) || qty < 1) return null;
    return {
      sourceText: String(match.sourceText || '').trim(),
      qty
    };
  };

  const upsertQtyOverride = (order, sourceText, qtyValue) => {
    const source = String(sourceText == null ? '' : sourceText).trim();
    const key = normalizeOverrideKey(source);
    const qty = Number(qtyValue);
    if (!order || !key) return order;
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Qty override must be a positive integer');

    const existing = Array.isArray(order.reviewQtyOverrides) ? order.reviewQtyOverrides : [];
    const nextOverrides = existing
      .filter((row) => normalizeOverrideKey(row && row.sourceText) !== key)
      .map((row) => ({ ...row }));
    nextOverrides.push({ sourceText: source, qty });

    return { ...order, reviewQtyOverrides: nextOverrides };
  };

  const getEffectiveItemQty = (order, item) => {
    const override = getQtyOverride(order, item && item.text);
    if (override) return override.qty;
    const qty = Number(item && item.qty);
    return Number.isFinite(qty) ? qty : 0;
  };

  const getUniqueInternalNames = (rules) => {
    const seen = new Set();
    const names = [];
    (Array.isArray(rules) ? rules : []).forEach((rule) => {
      const name = String(rule && rule.shortName || '').trim();
      if (!name) return;
      const key = name.toLocaleLowerCase('th-TH');
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
    return names;
  };

  return {
    normalizeOverrideKey,
    getManualSkuOverride,
    upsertManualSkuOverride,
    getReviewAcknowledgement,
    confirmReview,
    clearReviewConfirmation,
    getQtyOverride,
    upsertQtyOverride,
    getEffectiveItemQty,
    getUniqueInternalNames
  };
});
