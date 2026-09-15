(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterBatchSourceFiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'packmasterBatchSourceFilesV1';

  const extractSourceFileNames = (orders) => {
    const seen = new Set();
    const names = [];

    (Array.isArray(orders) ? orders : []).forEach((order) => {
      const name = String(order && order.sourceFileName || '').trim();
      if (!name) return;
      const key = name.toLocaleLowerCase('en-US');
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });

    return names;
  };

  const summarizeBatchSourceFiles = (orders, visibleLimit = 2) => {
    const limit = Math.max(1, parseInt(visibleLimit, 10) || 2);
    const allNames = extractSourceFileNames(orders);

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

  const getStorage = (storageLike) => {
    if (storageLike) return storageLike;
    try { return root && root.localStorage ? root.localStorage : null; }
    catch (error) { return null; }
  };

  const validateSidecar = (candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Source-file sidecar must be an object');
    const clean = {};
    for (const [batchId, names] of Object.entries(candidate)) {
      if (!batchId || !Array.isArray(names)) throw new Error(`Invalid source-file sidecar entry: ${batchId || '(empty)'}`);
      clean[batchId] = names.map(name => String(name || '').trim()).filter(Boolean);
    }
    return clean;
  };

  const inspectSidecar = (storageLike) => {
    const storage = getStorage(storageLike);
    if (!storage || typeof storage.getItem !== 'function') return { status: 'unavailable', data: {} };
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return { status: 'empty', data: {} };
      return { status: 'ok', data: validateSidecar(JSON.parse(raw)) };
    } catch (error) { return { status: 'corrupt', data: {}, error }; }
  };

  const getStoreHealth = (storageLike) => {
    const inspected = inspectSidecar(storageLike);
    return { key: STORAGE_KEY, kind: 'sourceFiles', status: inspected.status };
  };

  const readSidecar = (storageLike) => {
    const inspected = inspectSidecar(storageLike);
    if (inspected.status === 'corrupt') console.warn('PackMaster source-file sidecar is unreadable; preserving raw data', inspected.error);
    return inspected.data;
  };

  const readSidecarForWrite = (storageLike) => {
    const inspected = inspectSidecar(storageLike);
    if (inspected.status === 'corrupt') throw new Error('Source-file sidecar is corrupt/unreadable; reset it before writing');
    return inspected.data;
  };

  const writeSidecar = (value, storageLike) => {
    const storage = getStorage(storageLike);
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  };

  const resetStore = (storageLike) => {
    const storage = getStorage(storageLike);
    if (!storage || typeof storage.removeItem !== 'function') throw new Error('LocalStorage is not available for source-file reset');
    storage.removeItem(STORAGE_KEY);
    return true;
  };

  const getBatchSourceFileNames = (batchId, storageLike) => {
    const id = String(batchId || '').trim();
    if (!id) return null;
    const sidecar = readSidecar(storageLike);
    if (!Object.prototype.hasOwnProperty.call(sidecar, id)) return null;
    const names = sidecar[id];
    return Array.isArray(names)
      ? names.map(name => String(name || '').trim()).filter(Boolean)
      : null;
  };

  const rememberBatchSourceFiles = (batchId, orders, storageLike) => {
    const id = String(batchId || '').trim();
    if (!id) return [];
    const names = extractSourceFileNames(orders);
    const sidecar = readSidecarForWrite(storageLike);
    sidecar[id] = names;
    writeSidecar(sidecar, storageLike);
    return names;
  };

  const forgetBatchSourceFiles = (batchId, storageLike) => {
    const id = String(batchId || '').trim();
    if (!id) return false;
    const sidecar = readSidecarForWrite(storageLike);
    if (!Object.prototype.hasOwnProperty.call(sidecar, id)) return true;
    delete sidecar[id];
    return writeSidecar(sidecar, storageLike);
  };

  return {
    STORAGE_KEY,
    getStoreHealth,
    resetStore,
    extractSourceFileNames,
    summarizeBatchSourceFiles,
    getBatchSourceFileNames,
    rememberBatchSourceFiles,
    forgetBatchSourceFiles
  };
});
