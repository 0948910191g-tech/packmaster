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

  const getItemKey = (indexValue) => {
    const index = Number(indexValue);
    return Number.isInteger(index) && index >= 0 ? `row:${index}` : '';
  };

  const resolveItemIndex = (order, item, indexValue) => {
    const explicit = Number(indexValue);
    if (Number.isInteger(explicit) && explicit >= 0) return explicit;
    const items = Array.isArray(order && order.parsedItems) ? order.parsedItems : [];
    return item ? items.indexOf(item) : -1;
  };

  const countSourceMatches = (order, sourceText) => {
    const key = normalizeOverrideKey(sourceText);
    if (!key) return 0;
    const items = Array.isArray(order && order.parsedItems) ? order.parsedItems : [];
    return items.filter((item) => normalizeOverrideKey(item && item.text) === key).length;
  };

  const hasAmbiguousLegacyQtyOverride = (order) => {
    const overrides = Array.isArray(order && order.reviewQtyOverrides) ? order.reviewQtyOverrides : [];
    return overrides.some((row) => !String(row && row.itemKey || '').trim() && countSourceMatches(order, row && row.sourceText) > 1);
  };

  const getQtyOverride = (order, itemOrText, indexValue) => {
    const sourceText = itemOrText && typeof itemOrText === 'object' ? itemOrText.text : itemOrText;
    const sourceKey = normalizeOverrideKey(sourceText);
    if (!sourceKey) return null;
    const itemIndex = resolveItemIndex(order, itemOrText && typeof itemOrText === 'object' ? itemOrText : null, indexValue);
    const itemKey = getItemKey(itemIndex);
    const overrides = Array.isArray(order && order.reviewQtyOverrides) ? order.reviewQtyOverrides : [];
    let match = itemKey ? overrides.find((row) => String(row && row.itemKey || '') === itemKey && normalizeOverrideKey(row && row.sourceText) === sourceKey) : null;
    if (!match && countSourceMatches(order, sourceText) === 1) {
      match = overrides.find((row) => !String(row && row.itemKey || '').trim() && normalizeOverrideKey(row && row.sourceText) === sourceKey);
    }
    const qty = Number(match && match.qty);
    if (!match || !Number.isInteger(qty) || qty < 1) return null;
    const result = { sourceText: String(match.sourceText || '').trim(), qty };
    if (String(match.itemKey || '').trim()) result.itemKey = String(match.itemKey).trim();
    return result;
  };

  const upsertQtyOverride = (order, itemOrText, indexOrQty, qtyValue) => {
    const item = itemOrText && typeof itemOrText === 'object' ? itemOrText : null;
    const source = String(item ? item.text : itemOrText == null ? '' : itemOrText).trim();
    const key = normalizeOverrideKey(source);
    const itemIndex = item ? resolveItemIndex(order, item, indexOrQty) : -1;
    const itemKey = getItemKey(itemIndex);
    const qty = Number(item ? qtyValue : indexOrQty);
    if (!order || !key) return order;
    if (!Number.isInteger(qty) || qty < 1) throw new Error('Qty override must be a positive integer');

    const existing = Array.isArray(order.reviewQtyOverrides) ? order.reviewQtyOverrides : [];
    const nextOverrides = existing.filter((row) => itemKey
      ? String(row && row.itemKey || '') !== itemKey && !( !String(row && row.itemKey || '').trim() && normalizeOverrideKey(row && row.sourceText) === key )
      : normalizeOverrideKey(row && row.sourceText) !== key).map((row) => ({ ...row }));
    nextOverrides.push(itemKey ? { itemKey, sourceText: source, qty } : { sourceText: source, qty });
    return { ...order, reviewQtyOverrides: nextOverrides };
  };

  const getEffectiveItemQty = (order, item, indexValue) => {
    const override = getQtyOverride(order, item, indexValue);
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
    getItemKey,
    hasAmbiguousLegacyQtyOverride,
    getQtyOverride,
    upsertQtyOverride,
    getEffectiveItemQty,
    getUniqueInternalNames
  };
});
