(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterSkuIntegrity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const defaultNormalize = (value) => String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');

  const nextUniqueId = (usedIds, prefix = 'rule') => {
    const used = usedIds instanceof Set ? usedIds : new Set();
    let index = 1;
    let candidate = `${prefix}-${index}`;
    while (used.has(candidate)) candidate = `${prefix}-${++index}`;
    return candidate;
  };

  const prepareRules = (input, options = {}) => {
    const normalize = typeof options.normalize === 'function' ? options.normalize : defaultNormalize;
    const idPrefix = String(options.idPrefix || 'rule');
    const rows = Array.isArray(input) ? input.map(rule => ({ ...rule })) : [];
    const report = { invalid: [], duplicateIds: [], sameOutputDuplicates: [], conflicts: [], rekeyed: [] };
    const usedIds = new Set();
    const firstById = new Map();
    rows.forEach((rule, index) => {
      const keyword = typeof rule.keyword === 'string' ? rule.keyword.trim() : '';
      const shortName = typeof rule.shortName === 'string' ? rule.shortName.trim() : '';
      if (!keyword || !shortName) report.invalid.push({ index, rule });
      rule.keyword = keyword;
      rule.shortName = shortName;

      let idKey = rule.id == null ? '' : String(rule.id);
      if (!idKey || usedIds.has(idKey)) {
        if (idKey) report.duplicateIds.push({ id: rule.id, firstIndex: firstById.get(idKey), duplicateIndex: index });
        const replacement = nextUniqueId(usedIds, idPrefix);
        report.rekeyed.push({ index, from: rule.id ?? null, to: replacement });
        rule.id = replacement;
        idKey = replacement;
      }
      usedIds.add(idKey);
      if (!firstById.has(idKey)) firstById.set(idKey, index);
    });

    const groups = new Map();
    rows.forEach((rule, index) => {
      const key = normalize(rule.keyword);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ index, rule, outputKey: normalize(rule.shortName) });
    });
    groups.forEach((entries, normalizedKeyword) => {
      if (entries.length < 2) return;
      const outputs = new Set(entries.map(entry => entry.outputKey));
      const detail = {
        normalizedKeyword,
        indexes: entries.map(entry => entry.index),
        rules: entries.map(entry => ({ ...entry.rule }))
      };
      if (outputs.size === 1) report.sameOutputDuplicates.push(detail);
      else report.conflicts.push({ ...detail, outputs: Array.from(outputs) });
    });

    return {
      ok: report.invalid.length === 0 && report.conflicts.length === 0,
      rules: rows,
      report
    };
  };

  return {
    nextUniqueId,
    prepareRules
  };
});
