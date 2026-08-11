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

  const getStorage = () => {
    try {
      return root && root.localStorage ? root.localStorage : null;
    } catch (error) {
      return null;
    }
  };

  const readSidecar = () => {
    const storage = getStorage();
    if (!storage) return {};
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  };

  const writeSidecar = (value) => {
    const storage = getStorage();
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  };

  const getBatchSourceFileNames = (batchId) => {
    const id = String(batchId || '').trim();
    if (!id) return null;
    const sidecar = readSidecar();
    if (!Object.prototype.hasOwnProperty.call(sidecar, id)) return null;
    const names = sidecar[id];
    return Array.isArray(names)
      ? names.map(name => String(name || '').trim()).filter(Boolean)
      : null;
  };

  const rememberBatchSourceFiles = (batchId, orders) => {
    const id = String(batchId || '').trim();
    if (!id) return [];
    const names = extractSourceFileNames(orders);
    const sidecar = readSidecar();
    sidecar[id] = names;
    writeSidecar(sidecar);
    return names;
  };

  const forgetBatchSourceFiles = (batchId) => {
    const id = String(batchId || '').trim();
    if (!id) return false;
    const sidecar = readSidecar();
    if (!Object.prototype.hasOwnProperty.call(sidecar, id)) return true;
    delete sidecar[id];
    return writeSidecar(sidecar);
  };

  return {
    STORAGE_KEY,
    extractSourceFileNames,
    summarizeBatchSourceFiles,
    getBatchSourceFileNames,
    rememberBatchSourceFiles,
    forgetBatchSourceFiles
  };
});
