(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterArchive = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'packmasterBatchArchiveV1';
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const isValidIso = (value) => typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value));
  const resolveStorage = (storageLike) => storageLike || (root && root.localStorage) || null;

  const sanitizeRecord = (record) => {
    if (!isPlainObject(record)) return null;
    const archivedAt = record.archivedAt === null ? null : (isValidIso(record.archivedAt) ? record.archivedAt : undefined);
    if (archivedAt === undefined) return null;
    const touchedAt = isValidIso(record.touchedAt) ? record.touchedAt : null;
    if (!touchedAt) return null;
    return { archivedAt, touchedAt };
  };

  const validateArchiveStore = (candidate) => {
    if (!isPlainObject(candidate)) throw new Error('Archive sidecar must be an object');
    const clean = {};
    for (const [batchId, record] of Object.entries(candidate)) {
      if (!batchId) throw new Error('Archive sidecar contains an empty batch id');
      const sanitized = sanitizeRecord(record);
      if (!sanitized) throw new Error(`Invalid archive record for batch: ${batchId}`);
      clean[batchId] = sanitized;
    }
    return clean;
  };

  const readArchiveStore = (storageLike) => {
    const storage = resolveStorage(storageLike);
    if (!storage || typeof storage.getItem !== 'function') return {};
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return validateArchiveStore(JSON.parse(raw));
    } catch (error) {
      console.warn('PackMaster archive sidecar is unreadable; using empty store', error);
      return {};
    }
  };

  const writeArchiveStore = (store, storageLike) => {
    const storage = resolveStorage(storageLike);
    if (!storage || typeof storage.setItem !== 'function') {
      throw new Error('LocalStorage is not available for Batch archive state');
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  };

  const getArchiveRecord = (batchId, storageLike) => {
    if (!batchId) return null;
    const store = readArchiveStore(storageLike);
    const record = store[batchId];
    return record ? { ...record } : null;
  };

  const getArchivedAt = (batchId, legacyArchivedAt = null, storageLike) => {
    const record = getArchiveRecord(batchId, storageLike);
    if (record) return record.archivedAt;
    return isValidIso(legacyArchivedAt) ? legacyArchivedAt : null;
  };

  const isArchived = (batchId, legacyArchivedAt = null, storageLike) => Boolean(getArchivedAt(batchId, legacyArchivedAt, storageLike));

  const writeRecord = (batchId, archivedAt, now, storageLike) => {
    if (!batchId) throw new Error('Batch id is required for archive state');
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid archive timestamp');
    const touchedAt = date.toISOString();
    const record = { archivedAt, touchedAt };
    const store = readArchiveStore(storageLike);
    store[batchId] = record;
    writeArchiveStore(store, storageLike);
    return { ...record };
  };

  const archiveBatch = (batchId, now = new Date(), storageLike) => {
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid archive timestamp');
    return writeRecord(batchId, date.toISOString(), date, storageLike);
  };

  const restoreBatch = (batchId, now = new Date(), storageLike) => writeRecord(batchId, null, now, storageLike);

  const clearBatchArchive = (batchId, storageLike) => {
    if (!batchId) return false;
    const store = readArchiveStore(storageLike);
    if (!Object.prototype.hasOwnProperty.call(store, batchId)) return false;
    delete store[batchId];
    writeArchiveStore(store, storageLike);
    return true;
  };

  const exportArchiveStore = (storageLike) => JSON.parse(JSON.stringify(readArchiveStore(storageLike)));

  const replaceArchiveStore = (candidate, storageLike) => {
    const clean = validateArchiveStore(candidate);
    writeArchiveStore(clean, storageLike);
    return JSON.parse(JSON.stringify(clean));
  };

  return {
    STORAGE_KEY,
    getArchiveRecord,
    getArchivedAt,
    isArchived,
    archiveBatch,
    restoreBatch,
    clearBatchArchive,
    exportArchiveStore,
    validateArchiveStore,
    replaceArchiveStore
  };
});
