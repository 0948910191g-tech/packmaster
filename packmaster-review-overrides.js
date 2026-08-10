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
    getUniqueInternalNames
  };
});
