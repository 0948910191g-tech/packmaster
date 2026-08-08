(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterDuplicate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const normalize = (value) => String(value == null ? '' : value).trim().toUpperCase();

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
    (Array.isArray(newOrders) ? newOrders : []).forEach((order) => {
      const key = getOrderIdentity(order);
      if (!key || !existing.has(key)) return;
      collisions.push({ key, incoming: order, existing: existing.get(key) });
    });
    return collisions;
  };

  return {
    hashArrayBuffer,
    hashFile,
    findExactFileDuplicate,
    getOrderIdentity,
    findOrderDuplicateSignals
  };
});
