(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterReprintSnapshot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'packmasterResolvedSnapshotsV1';
  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const resolveStorage = (storageLike) => storageLike || (root && root.localStorage) || null;

  const sanitizeAudit = (entry) => {
    if (!isObject(entry)) return null;
    const sourceText = String(entry.sourceText || '').trim();
    const resolution = String(entry.resolution || '').trim();
    const shortName = String(entry.shortName || '').trim();
    const effectiveQty = Number(entry.effectiveQty);
    if (!sourceText || !['rule', 'manual'].includes(resolution) || !shortName || !Number.isFinite(effectiveQty) || effectiveQty < 1) return null;
    return {
      sourceText,
      effectiveQty,
      resolution,
      keyword: String(entry.keyword || '').trim(),
      shortName
    };
  };
  const sanitizeOrderSnapshot = (order) => {
    if (!isObject(order) || typeof order.id !== 'string' || !order.id.trim()) return null;
    const displayItems = Array.isArray(order.displayItems)
      ? order.displayItems.map(item => String(item || '').trim()).filter(Boolean)
      : null;
    const resolvedAudit = Array.isArray(order.resolvedAudit)
      ? order.resolvedAudit.map(sanitizeAudit)
      : null;
    if (!displayItems || !resolvedAudit || resolvedAudit.some(entry => !entry)) return null;
    const originalQty = Number(order.originalQty);
    if (!Number.isFinite(originalQty) || originalQty < 0) return null;
    return {
      id: order.id,
      displayItems,
      originalQty,
      qtyWarning: Boolean(order.qtyWarning),
      unresolvedSku: Boolean(order.unresolvedSku),
      resolvedAudit
    };
  };

  const validateSnapshot = (snapshot) => {
    if (!isObject(snapshot)) throw new Error('Resolved snapshot must be an object');
    if (typeof snapshot.batchId !== 'string' || !snapshot.batchId.trim()) throw new Error('Resolved snapshot batchId is required');
    if (typeof snapshot.completedAt !== 'string' || Number.isNaN(Date.parse(snapshot.completedAt))) throw new Error('Resolved snapshot completedAt is invalid');
    if (!Array.isArray(snapshot.orders)) throw new Error('Resolved snapshot orders must be an array');
    const seen = new Set();
    const orders = snapshot.orders.map((order, index) => {
      const clean = sanitizeOrderSnapshot(order);
      if (!clean) throw new Error(`Invalid resolved snapshot order at index ${index}`);
      if (seen.has(clean.id)) throw new Error(`Duplicate resolved snapshot order id: ${clean.id}`);
      seen.add(clean.id);
      return clean;
    });
    return { batchId: snapshot.batchId, completedAt: snapshot.completedAt, orders };
  };

  const readStore = (storageLike) => {
    const storage = resolveStorage(storageLike);
    if (!storage || typeof storage.getItem !== 'function') return {};
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) throw new Error('Resolved snapshot store must be an object');
    const clean = {};
    for (const [batchId, snapshot] of Object.entries(parsed)) {
      const validated = validateSnapshot(snapshot);
      if (validated.batchId !== batchId) throw new Error(`Resolved snapshot key mismatch: ${batchId}`);
      clean[batchId] = validated;
    }
    return clean;
  };

  const writeStore = (store, storageLike) => {
    const storage = resolveStorage(storageLike);
    if (!storage || typeof storage.setItem !== 'function') throw new Error('LocalStorage is not available for resolved snapshots');
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  };
  const saveBatchSnapshot = (batchId, mappedOrders, completedAt, isReady, storageLike) => {
    if (!batchId) throw new Error('Batch id is required for resolved snapshot');
    if (!Array.isArray(mappedOrders)) throw new Error('Mapped orders are required for resolved snapshot');
    if (typeof isReady !== 'function') throw new Error('Ready predicate is required for resolved snapshot');
    if (!mappedOrders.every(order => isReady(order))) throw new Error('Resolved snapshot can only capture ready orders');
    const snapshot = validateSnapshot({ batchId, completedAt, orders: mappedOrders });
    const store = readStore(storageLike);
    store[batchId] = snapshot;
    writeStore(store, storageLike);
    return clone(snapshot);
  };

  const getBatchSnapshot = (batchId, storageLike) => {
    if (!batchId) return null;
    const store = readStore(storageLike);
    return store[batchId] ? clone(store[batchId]) : null;
  };

  const clearBatchSnapshot = (batchId, storageLike) => {
    if (!batchId) return false;
    const store = readStore(storageLike);
    if (!Object.prototype.hasOwnProperty.call(store, batchId)) return false;
    delete store[batchId];
    writeStore(store, storageLike);
    return true;
  };
  const applyBatchSnapshot = (liveMappedOrders, snapshot) => {
    if (!Array.isArray(liveMappedOrders)) return { ok: false, reason: 'invalid-live-orders', orders: [] };
    let clean;
    try { clean = validateSnapshot(snapshot); }
    catch (error) { return { ok: false, reason: 'invalid-snapshot', error, orders: liveMappedOrders }; }
    if (liveMappedOrders.length !== clean.orders.length) return { ok: false, reason: 'order-count-mismatch', orders: liveMappedOrders };
    const byId = new Map(clean.orders.map(order => [order.id, order]));
    const resolved = [];
    for (const live of liveMappedOrders) {
      const historical = live && byId.get(live.id);
      if (!historical) return { ok: false, reason: 'order-id-mismatch', orders: liveMappedOrders };
      resolved.push({ ...live, ...clone(historical), historicalSnapshot: true });
    }
    return { ok: true, orders: resolved, completedAt: clean.completedAt };
  };

  return {
    STORAGE_KEY,
    validateSnapshot,
    saveBatchSnapshot,
    getBatchSnapshot,
    clearBatchSnapshot,
    applyBatchSnapshot
  };
});