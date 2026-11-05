(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterCloudClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VALID_DOCS = new Set([
    'skuMappingRules', 'archiveState', 'duplicateFingerprints',
    'sourceFiles', 'reprintSnapshots', 'settings'
  ]);
  function createClient({ baseUrl, token, session = false, fetchImpl = fetch, batchHelpers = null }) {
    const address = new URL(String(baseUrl || ''));
    if (address.protocol !== 'https:' || address.username || address.password ||
        address.pathname !== '/' || address.search || address.hash) {
      throw new Error('Cloud Workspace requires a clean HTTPS origin');
    }
    if (!session && (typeof token !== 'string' || token.length < 32)) {
      throw new Error('Cloud Workspace access token is required');
    }
    if (session && typeof window !== 'undefined' && address.origin !== window.location.origin) {
      throw new Error('Cloud sessions require a same-origin application');
    }
    if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
    const revisions = new Map();
    const batchFingerprints = new Map();
    const loadedBatches = new Set();
    const staleBatches = new Set();
    function cleanMeta(meta) {
      const clean = { ...meta };
      delete clean.cloudRevision;
      return clean;
    }
    function fingerprint(meta, orders) {
      const stable = cleanMeta(meta);
      delete stable.updatedAt;
      return JSON.stringify({ meta: stable, orders });
    }
    const documentRevisions = new Map();
    const registryRevisions = new Map();
    let registryAssignmentsRevision = null;
    const inFlight = new Set();
    const apiRoot = address.origin + '/api/workspace';
    let sessionCsrf = null;
    async function ensureSession() {
      if (!session || sessionCsrf) return;
      const response = await fetchImpl(apiRoot + '/session', {
        method: 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store'
      });
      const info = await response.json();
      if (!response.ok || !info?.authenticated || typeof info.csrf !== 'string') {
        throw new Error('Cloud Workspace session is not authenticated');
      }
      sessionCsrf = info.csrf;
    }
    async function request(path, method = 'GET', body) {
      if (session && method !== 'GET') await ensureSession();
      const options = {
        method, redirect: 'error', cache: 'no-store',
        credentials: session ? 'same-origin' : 'omit',
        headers: session ? {} : { Authorization: 'Bearer ' + token }
      };
      if (session && method !== 'GET') options.headers['X-PM-CSRF'] = sessionCsrf;
      if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
      const response = await fetchImpl(apiRoot + path, options);
      let payload;
      try { payload = await response.json(); }
      catch {
        const error = new Error(`Cloud Workspace returned an invalid response (HTTP ${response.status})`);
        error.status = response.status;
        throw error;
      }
      if (!response.ok) {
        if (session && response.status === 401) sessionCsrf = null;
        const error = new Error(payload.error || 'Cloud Workspace request failed');
        error.status = response.status;
        error.currentRevision = payload.currentRevision;
        throw error;
      }
      return payload;
    }
    async function guard(name, task) {
      if (inFlight.has(name)) throw new Error('Cloud write already in progress for this item');
      inFlight.add(name);
      try { return await task(); }
      finally { inFlight.delete(name); }
    }

    const LARGE_BATCH_THRESHOLD = 2 * 1024 * 1024;
    const MAX_UPLOAD_PART_BYTES = 1_200_000;
    const MAX_UPLOAD_PART_COUNT = 64;
    const byteCount = source => new TextEncoder().encode(source).byteLength;
    async function hashPart(serialized) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    async function stageLargeBatch(id, expectedRevision, orders) {
      const parts = [];
      let current = [];
      let currentBytes = 2;
      for (const order of orders) {
        const size = byteCount(JSON.stringify(order));
        if (size + 2 > MAX_UPLOAD_PART_BYTES) {
          throw new Error('ใบปะหน้าใบเดียวมีข้อมูลใหญ่เกิน 1.2 MB กรุณาลดขนาด PDF ก่อนนำเข้า');
        }
        if (current.length && currentBytes + size + 1 > MAX_UPLOAD_PART_BYTES) {
          parts.push(current);
          current = [];
          currentBytes = 2;
        }
        current.push(order);
        currentBytes += size + (current.length > 1 ? 1 : 0);
      }
      if (current.length) parts.push(current);
      if (parts.length > MAX_UPLOAD_PART_COUNT) {
        throw new Error('Batch ใหญ่เกินขีดจำกัด Cloud Free (64 ชุด) กรุณาแบ่งเป็นหลาย Batch');
      }
      const hashes = [];
      for (const ordersPart of parts) {
        const serialized = JSON.stringify(ordersPart);
        const hash = await hashPart(serialized);
        const result = await request('/batches/' + encodeURIComponent(id) + '/parts/' + hash, 'PUT', {
          expectedRevision, orders: ordersPart
        });
        if (result.hash !== hash || result.count !== ordersPart.length) {
          throw new Error('Cloud ยืนยันชุดออเดอร์ไม่ตรงกับข้อมูลที่ส่ง');
        }
        hashes.push(hash);
      }
      return hashes;
    }
    async function loadPart(id, hash) {
      const result = await request('/batches/' + encodeURIComponent(id) + '/parts/' + hash);
      if (result.hash !== hash || !Array.isArray(result.orders) ||
          !result.orders.length || await hashPart(JSON.stringify(result.orders)) !== hash) {
        throw new Error('Cloud Batch part checksum mismatch');
      }
      return result.orders;
    }
    async function listBatches() {
      const response = await request('/batches');
      if (!Array.isArray(response.batches)) throw new Error('Invalid cloud batch list');
      return response.batches.map(entry => {
        if (!entry?.meta?.id || !Number.isSafeInteger(entry.revision)) {
          throw new Error('Invalid cloud batch metadata');
        }
        const knownRevision = revisions.get(entry.meta.id);
        if (loadedBatches.has(entry.meta.id) && knownRevision !== entry.revision) {
          staleBatches.add(entry.meta.id);
        } else if (!loadedBatches.has(entry.meta.id)) {
          revisions.set(entry.meta.id, entry.revision);
        }
        return { ...entry.meta, cloudRevision: entry.revision };
      });
    }
    async function loadBatch(id) {
      if (typeof id !== 'string' || !id) throw new Error('Batch ID is required');
      const response = await request('/batches/' + encodeURIComponent(id));
      if (response.meta?.id !== id || !Number.isSafeInteger(response.revision)) {
        throw new Error('Cloud batch response does not match the requested Batch');
      }
      let orders = response.orders;
      if (!Array.isArray(orders) && response.ordersFormat === 'packmaster-order-parts-v1') {
        if (!Array.isArray(response.ordersParts) || response.ordersParts.length > MAX_UPLOAD_PART_COUNT ||
            response.ordersParts.length === 0 || !Number.isSafeInteger(response.totalOrders) ||
            response.totalOrders < 1 || response.totalOrders > 5000) {
          throw new Error('Invalid Cloud multipart Batch manifest');
        }
        orders = [];
        const seen = new Set();
        for (const hash of response.ordersParts) {
          if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || seen.has(hash)) {
            throw new Error('Invalid Cloud Batch part identifier');
          }
          seen.add(hash);
          orders.push(...await loadPart(id, hash));
        }
        if (orders.length !== response.totalOrders || new Set(orders.map(order => order.id)).size !== orders.length) {
          throw new Error('Cloud Batch order count or identities are inconsistent');
        }
      }
      if (!Array.isArray(orders)) throw new Error('Cloud Batch contains no valid orders');
      revisions.set(id, response.revision);
      loadedBatches.add(id);
      staleBatches.delete(id);
      batchFingerprints.set(id, fingerprint(response.meta, orders));
      return {
        meta: { ...response.meta, cloudRevision: response.revision },
        orders
      };
    }
    async function saveBatch(meta, orders) {
      if (!meta?.id || !Array.isArray(orders)) throw new Error('Batch and orders are required');
      return guard('batch:' + meta.id, async () => {
        if (staleBatches.has(meta.id)) throw new Error('Cloud Batch was modified on another device. Reload before saving.');
        if (revisions.has(meta.id) && !loadedBatches.has(meta.id)) {
          throw new Error('Open the Cloud Batch before editing it');
        }
        const expectedRevision = revisions.get(meta.id) || 0;
        const nextFingerprint = fingerprint(meta, orders);
        if (expectedRevision > 0 && batchFingerprints.get(meta.id) === nextFingerprint) {
          return { ...meta, cloudRevision: expectedRevision };
        }
        const serialized = JSON.stringify({ expectedRevision, meta: cleanMeta(meta), orders });
        const path = '/batches/' + encodeURIComponent(meta.id);
        let result;
        if (byteCount(serialized) > LARGE_BATCH_THRESHOLD) {
          const hashes = await stageLargeBatch(meta.id, expectedRevision, orders);
          result = await request(path, 'PUT', {
            expectedRevision, meta: cleanMeta(meta),
            partHashes: hashes, orderCount: orders.length
          });
        } else {
          result = await request(path, 'PUT', {
            expectedRevision, meta: cleanMeta(meta), orders
          });
        }
        if (!Number.isSafeInteger(result.revision)) throw new Error('Invalid revision from Cloud Workspace');
        revisions.set(meta.id, result.revision);
        loadedBatches.add(meta.id);
        batchFingerprints.set(meta.id, fingerprint(result.meta, orders));
        return { ...result.meta, cloudRevision: result.revision };
      });
    }
    async function deleteBatch(id) {
      if (!id) throw new Error('Batch ID is required');
      return guard('batch:' + id, async () => {
        const expectedRevision = revisions.get(id);
        if (!Number.isSafeInteger(expectedRevision)) {
          throw new Error('Open the Cloud Batch before deleting it');
        }
        const response = await request('/batches/' + encodeURIComponent(id), 'DELETE', { expectedRevision });
        revisions.delete(id);
        loadedBatches.delete(id);
        batchFingerprints.delete(id);
        staleBatches.delete(id);
        return response;
      });
    }
    async function getRegistry(platform) {
      if (!['TIKTOK', 'SHOPEE'].includes(platform)) throw new Error('Invalid registry platform');
      const result = await request('/registry/' + platform);
      if (result.platform !== platform || !Number.isSafeInteger(result.revision)) {
        throw new Error('Invalid Cloud registry metadata');
      }
      registryRevisions.set(platform, result.revision);
      return result;
    }
    async function saveRegistry(platform, registry) {
      if (!['TIKTOK', 'SHOPEE'].includes(platform) || registry?.platform !== platform) {
        throw new Error('Invalid registry platform');
      }
      return guard('registry:' + platform, async () => {
        if (!registryRevisions.has(platform)) throw new Error('Load the Cloud registry before updating');
        const expectedRevision = registryRevisions.get(platform);
        const response = await request('/registry/' + platform, 'PUT', { expectedRevision, registry });
        if (response.platform !== platform || !Number.isSafeInteger(response.revision)) {
          throw new Error('Invalid registry save response');
        }
        // Both marketplaces share one D1 revision. Advance known snapshots only
        // after our own write; remote writers still trigger HTTP 409.
        for (const knownPlatform of registryRevisions.keys()) {
          registryRevisions.set(knownPlatform, response.revision);
        }
        return response;
      });
    }
    async function getRegistryAssignments() {
      const document = await request('/registry-assignments');
      if (!Number.isSafeInteger(document.revision) || document.revision < 0) {
        throw new Error('Invalid Registry SKU assignment revision');
      }
      registryAssignmentsRevision = document.revision;
      return { value: document.value, revision: document.revision };
    }
    async function saveRegistryAssignments(value) {
      return guard('registry:assignments', async () => {
        if (!Number.isSafeInteger(registryAssignmentsRevision)) {
          throw new Error('Load Registry SKU assignments before saving');
        }
        const response = await request('/registry-assignments', 'PUT', {
          expectedRevision: registryAssignmentsRevision, value
        });
        if (!Number.isSafeInteger(response.revision)) {
          throw new Error('Invalid Registry SKU assignment save response');
        }
        registryAssignmentsRevision = response.revision;
        return response;
      });
    }
    async function getDocument(key) {
      if (!VALID_DOCS.has(key)) throw new Error('Unknown Cloud document type');
      const document = await request('/documents/' + key);
      if (document.key !== key || !Number.isSafeInteger(document.revision)) {
        throw new Error('Invalid document metadata');
      }
      documentRevisions.set(key, document.revision);
      return { value: document.value, revision: document.revision };
    }
    async function saveDocument(key, value) {
      if (!VALID_DOCS.has(key)) throw new Error('Unknown Cloud document type');
      return guard('doc:' + key, async () => {
        if (!documentRevisions.has(key)) {
          throw new Error('Load the Cloud document before editing it');
        }
        const revision = documentRevisions.get(key);
        const response = await request('/documents/' + key, 'PUT', {
          expectedRevision: revision, value
        });
        documentRevisions.set(key, response.revision);
        return response.revision;
      });
    }
    async function logout() {
      if (!session) throw new Error('Logout requires a browser session');
      await ensureSession();
      const result = await request('/session', 'DELETE');
      sessionCsrf = null;
      return result;
    }
    const cloudBatchApi = {
      listBatches, loadBatch, saveBatch, deleteBatch,
      createBatchMeta(...args) {
        if (!batchHelpers?.createBatchMeta) throw new Error('PackMaster Batch helpers are unavailable');
        return batchHelpers.createBatchMeta(...args);
      },
      buildBatchMeta(...args) {
        if (!batchHelpers?.buildBatchMeta) throw new Error('PackMaster Batch helpers are unavailable');
        return batchHelpers.buildBatchMeta(...args);
      }
    };
    return { request, cloudBatchApi, listBatches, loadBatch, saveBatch, deleteBatch,
      getDocument, saveDocument, getRegistry, saveRegistry,
      getRegistryAssignments, saveRegistryAssignments, logout };
  }
  return { createClient };
});
