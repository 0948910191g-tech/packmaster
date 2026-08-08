(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterDiagnostics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const safeNumber = (value) => Math.max(0, Number(value) || 0);
  const sanitizeCounters = (counters) => Object.fromEntries(
    Object.entries(counters && typeof counters === 'object' ? counters : {})
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([key, value]) => [key, safeNumber(value)])
  );

  const sanitizeErrors = (errors) => (Array.isArray(errors) ? errors : []).slice(-20).map((error) => ({
    type: String(error && error.type || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'unknown',
    at: error && error.at ? String(error.at) : null
  }));

  const sanitizeBatch = (batch) => ({
    status: String(batch && batch.status || 'UNKNOWN'),
    archived: Boolean(batch && batch.archivedAt),
    totalOrders: safeNumber(batch && batch.totalOrders),
    readyCount: safeNumber(batch && batch.readyCount),
    reviewSkuCount: safeNumber(batch && batch.reviewSkuCount),
    reviewQtyCount: safeNumber(batch && batch.reviewQtyCount),
    unmappedCount: safeNumber(batch && batch.unmappedCount)
  });

  const buildDiagnosticReport = ({ appVersion = 'unknown', batches = [], storage = null, counters = {}, errors = [], capabilities = {}, now = new Date() } = {}) => {
    const date = now instanceof Date ? now : new Date(now);
    return {
      schema: 'packmaster-local-diagnostics',
      version: 1,
      createdAt: date.toISOString(),
      appVersion: String(appVersion || 'unknown').slice(0, 80),
      storage: storage ? {
        supported: Boolean(storage.supported),
        usage: storage.usage == null ? null : safeNumber(storage.usage),
        quota: storage.quota == null ? null : safeNumber(storage.quota),
        percent: storage.percent == null ? null : safeNumber(storage.percent)
      } : null,
      capabilities: Object.fromEntries(Object.entries(capabilities || {}).map(([key, value]) => [key, Boolean(value)])),
      counters: sanitizeCounters(counters),
      batches: (Array.isArray(batches) ? batches : []).map(sanitizeBatch),
      errors: sanitizeErrors(errors)
    };
  };

  const csvEscape = (value) => {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const toDiagnosticCsv = (report) => {
    const rows = [['metric', 'value']];
    const counters = report && report.counters || {};
    Object.entries(counters).forEach(([key, value]) => rows.push([key, value]));
    const batches = Array.isArray(report && report.batches) ? report.batches : [];
    rows.push(['batchCount', batches.length]);
    rows.push(['archivedBatchCount', batches.filter((batch) => batch.archived).length]);
    if (report && report.storage) {
      rows.push(['storagePercent', report.storage.percent == null ? '' : report.storage.percent]);
    }
    return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  };

  return { buildDiagnosticReport, toDiagnosticCsv };
});
