(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterDuplicate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const STORAGE_KEY = 'packmasterDuplicateFingerprintsV1';
  const normalize = (value) => String(value == null ? '' : value).trim().toUpperCase();
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const bytesToHex = (bytes) => Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const hashArrayBuffer = async (arrayBuffer, cryptoLike) => {
    const cryptoApi = cryptoLike || (root && root.crypto);
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== 'function') {
      throw new Error('Web Crypto SHA-256 is not available in this browser');
    }
    const digest = await cryptoApi.subtle.digest('SHA-256', arrayBuffer);
    return bytesToHex(new Uint8Array(digest));
  };

  const hashFile = async (file, cryptoLike) => {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('File is required');
    return hashArrayBuffer(await file.arrayBuffer(), cryptoLike);
  };

  const findExactFileDuplicate = (fileHash, sourceFiles) => {
    const wanted = normalize(fileHash);
    if (!wanted) return null;
    return (Array.isArray(sourceFiles) ? sourceFiles : []).find((entry) => normalize(entry && entry.hash) === wanted) || null;
  };

  const getOrderIdentity = (order) => {
    if (!order) return null;
    const platform = normalize(order.platform || 'UNKNOWN');
    const orderId = normalize(order.orderId);
    if (orderId && !/^PAGE[-_ ]?\d+$/i.test(orderId)) return `ORDER|${platform}|${orderId}`;
    const tracking = normalize(order.tracking);
    if (tracking && !/^PAGE[-_ ]?\d+$/i.test(tracking)) return `TRACKING|${platform}|${tracking}`;
    return null;
  };

  const findOrderDuplicateSignals = (newOrders, existingOrders) => {
    const existing = new Map();
    (Array.isArray(existingOrders) ? existingOrders : []).forEach((order) => {
      const key = getOrderIdentity(order);
      if (key && !existing.has(key)) existing.set(key, order);
    });

    const collisions = [];
    const currentUpload = new Map();
    (Array.isArray(newOrders) ? newOrders : []).forEach((order) => {
      const key = getOrderIdentity(order);
      if (!key) return;
      if (currentUpload.has(key)) {
        collisions.push({ key, incoming: order, existing: currentUpload.get(key), source: 'current-upload' });
      } else if (existing.has(key)) {
        collisions.push({ key, incoming: order, existing: existing.get(key), source: 'existing-history' });
      }
      if (!currentUpload.has(key)) currentUpload.set(key, order);
    });
    return collisions;
  };

  const resolveStorage = (storageLike) => storageLike || (root && root.localStorage) || null;

  const sanitizeFingerprint = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const hash = String(entry.hash == null ? '' : entry.hash).trim();
    if (!hash) return null;
    const size = Math.max(0, Number.parseInt(entry.size, 10) || 0);
    const addedAt = typeof entry.addedAt === 'string' ? entry.addedAt : '';
    return { hash, size, addedAt };
  };

  const parseFingerprintStore = (raw) => {
    if (!raw) return { status: 'empty', data: {} };
    const parsed = JSON.parse(raw);
    return { status: 'ok', data: validateFingerprintStore(parsed) };
  };

  const inspectFingerprintStore = (storageLike) => {
    const storage = resolveStorage(storageLike);
    if (!storage || typeof storage.getItem !== 'function') return { status: 'unavailable', data: {} };
    try {
      return parseFingerprintStore(storage.getItem(STORAGE_KEY));
    } catch (error) {
      return { status: 'corrupt', data: {}, error };
    }
  };

  const getStoreHealth = (storageLike) => {
    const inspected = inspectFingerprintStore(storageLike);
    return { key: STORAGE_KEY, kind: 'duplicate', status: inspected.status };
  };

  const readFingerprintStore = (storageLike) => {
    const inspected = inspectFingerprintStore(storageLike);
    if (inspected.status === 'corrupt') console.warn('PackMaster duplicate sidecar is unreadable; preserving raw data', inspected.error);
    return inspected.data;
  };

  const readFingerprintStoreForWrite = (storageLike) => {
    const inspected = inspectFingerprintStore(storageLike);
    if (inspected.status === 'corrupt') throw new Error('Duplicate fingerprint sidecar is corrupt/unreadable; reset or restore it before writing');
    return inspected.data;
  };

  const resetStore = (storageLike) => {
    const storage = resolveStorage(storageLike);
    if (!storage || typeof storage.removeItem !== 'function') throw new Error('LocalStorage is not available for duplicate fingerprint reset');
    storage.removeItem(STORAGE_KEY);
    return true;
  };

  const writeFingerprintStore = (store, storageLike) => {
    const storage = resolveStorage(storageLike);
    if (!storage || typeof storage.setItem !== 'function') {
      throw new Error('LocalStorage is not available for duplicate fingerprint history');
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  };

  const getBatchFingerprints = (batchId, storageLike) => {
    if (!batchId) return [];
    const store = readFingerprintStore(storageLike);
    return (store[batchId] || []).map((entry) => ({ ...entry }));
  };

  const getKnownFingerprints = (batchId, legacySourceFiles, storageLike) => {
    const combined = [
      ...(Array.isArray(legacySourceFiles) ? legacySourceFiles : []),
      ...getBatchFingerprints(batchId, storageLike)
    ];
    const result = [];
    const seen = new Set();
    combined.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const key = normalize(entry.hash);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push({ ...entry });
    });
    return result;
  };

  const appendBatchFingerprints = (batchId, entries, storageLike) => {
    if (!batchId) throw new Error('Batch id is required for duplicate fingerprint history');
    if (!Array.isArray(entries)) throw new Error('Fingerprint entries must be an array');
    const store = readFingerprintStoreForWrite(storageLike);
    const current = Array.isArray(store[batchId]) ? [...store[batchId]] : [];
    const seen = new Set(current.map((entry) => normalize(entry.hash)).filter(Boolean));

    entries.forEach((entry) => {
      const fingerprint = sanitizeFingerprint(entry);
      const key = fingerprint ? normalize(fingerprint.hash) : '';
      if (!fingerprint || !key || seen.has(key)) return;
      seen.add(key);
      current.push(fingerprint);
    });

    if (current.length > 0) store[batchId] = current;
    else delete store[batchId];
    writeFingerprintStore(store, storageLike);
    return current.map((entry) => ({ ...entry }));
  };

  const clearBatchFingerprints = (batchId, storageLike) => {
    if (!batchId) return false;
    const store = readFingerprintStoreForWrite(storageLike);
    const existed = Object.prototype.hasOwnProperty.call(store, batchId);
    if (!existed) return false;
    delete store[batchId];
    writeFingerprintStore(store, storageLike);
    return true;
  };

  const exportFingerprintStore = (storageLike) => JSON.parse(JSON.stringify(readFingerprintStoreForWrite(storageLike)));

  const validateFingerprintStore = (candidate) => {
    if (!isPlainObject(candidate)) throw new Error('Duplicate fingerprint store must be an object');
    const clean = {};

    for (const [batchId, entries] of Object.entries(candidate)) {
      if (!batchId || !Array.isArray(entries)) {
        throw new Error(`Invalid duplicate fingerprint batch entry: ${batchId || '(empty)'}`);
      }
      const rows = [];
      const seen = new Set();
      for (const entry of entries) {
        const fingerprint = sanitizeFingerprint(entry);
        const key = fingerprint ? normalize(fingerprint.hash) : '';
        if (!fingerprint || !key) throw new Error(`Invalid duplicate fingerprint for batch: ${batchId}`);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(fingerprint);
      }
      if (rows.length > 0) clean[batchId] = rows;
    }

    return clean;
  };

  const replaceFingerprintStore = (candidate, storageLike) => {
    const clean = validateFingerprintStore(candidate);
    writeFingerprintStore(clean, storageLike);
    return JSON.parse(JSON.stringify(clean));
  };

  return {
    STORAGE_KEY,
    hashArrayBuffer,
    hashFile,
    findExactFileDuplicate,
    getOrderIdentity,
    findOrderDuplicateSignals,
    getStoreHealth,
    resetStore,
    getBatchFingerprints,
    getKnownFingerprints,
    appendBatchFingerprints,
    clearBatchFingerprints,
    exportFingerprintStore,
    validateFingerprintStore,
    replaceFingerprintStore
  };
});
