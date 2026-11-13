(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterUploadSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Busy gate for PDF upload. Taken synchronously before the first await so a second
  // file (picked or dropped) cannot start while the first is still processing.
  function createUploadGate() {
    let active = false;
    return {
      tryStart() {
        if (active) return false;
        active = true;
        return true;
      },
      finish() {
        active = false;
      },
      isActive() {
        return active;
      }
    };
  }

  // Runs fn only if the gate is free, and always releases the gate afterwards, even when fn throws.
  // A refused call never runs fn and is not queued.
  async function runExclusive(gate, fn) {
    if (!gate || typeof gate.tryStart !== 'function' || !gate.tryStart()) {
      return { ran: false, value: undefined };
    }
    try {
      const value = await fn();
      return { ran: true, value };
    } finally {
      gate.finish();
    }
  }

  // A file counts as already imported only after the batch save really succeeded.
  function fingerprintsToRemember({ saved, entries } = {}) {
    if (saved !== true || !Array.isArray(entries)) return [];
    return entries;
  }

  // Calls save(). Only a save that resolves to true is treated as persisted, and only then is
  // remember() called with the accepted files. A rejected or unpersisted save remembers nothing.
  async function saveThenRemember({ save, remember, entries } = {}) {
    let persisted = false;
    let error = null;
    try {
      persisted = (await save()) === true;
    } catch (saveError) {
      error = saveError;
    }
    if (persisted) remember(fingerprintsToRemember({ saved: true, entries }));
    return { saved: persisted, error };
  }

  // Orders committed by an upload are appended to the LATEST orders at commit time,
  // never to the snapshot taken when the upload started. Inputs are not mutated.
  function mergeUploadedOrders(latestOrders, addedOrders) {
    const latest = Array.isArray(latestOrders) ? latestOrders : [];
    const added = Array.isArray(addedOrders) ? addedOrders : [];
    return [...latest, ...added];
  }

  // The upload was read for a specific Batch. Save only if that is still the live Batch.
  function isSameBatch(uploadBatchId, liveBatchId) {
    return Boolean(uploadBatchId) && uploadBatchId === liveBatchId;
  }

  return {
    createUploadGate,
    runExclusive,
    fingerprintsToRemember,
    saveThenRemember,
    mergeUploadedOrders,
    isSameBatch
  };
});
