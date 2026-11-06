(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports
    ? require('./packmaster-sku-normalization.js')
    : root.PackMasterSkuNormalization);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterRegistryMatcher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (skuNormalization) {
  'use strict';

  if (!skuNormalization) throw new Error('Seller SKU normalization module is required');
  const PLATFORMS = new Set(['TIKTOK', 'SHOPEE']);
  const SCHEMA = 'packmaster-registry-sku-assignments';
  const LOCAL_ASSIGNMENTS_KEY = 'packmasterRegistrySkuAssignmentsV1';
  const normalizeSku = skuNormalization.normalizeSellerSku;
  const newAssignments = () => ({ schema: SCHEMA, version: 1, entries: [] });
  const entryKey = entry => JSON.stringify([entry.platform, normalizeSku(entry.sellerSku)]);

  function validateAssignments(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
        candidate.schema !== SCHEMA || candidate.version !== 1 ||
        !Array.isArray(candidate.entries) || candidate.entries.length > 10000) {
      throw new Error('Invalid registry SKU assignments');
    }
    const seen = new Set();
    const entries = candidate.entries.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          !PLATFORMS.has(entry.platform) ||
          !normalizeSku(entry.sellerSku) ||
          typeof entry.productId !== 'string' || !entry.productId.trim() ||
          typeof entry.shortName !== 'string' || !entry.shortName.trim() ||
          entry.shortName.length > 150 ||
          (entry.modelId !== null && entry.modelId !== undefined && typeof entry.modelId !== 'string')) {
        throw new Error('Invalid registry SKU assignment entry');
      }
      const key = entryKey(entry);
      if (seen.has(key)) throw new Error('Duplicate platform Seller SKU assignment');
      seen.add(key);
      return {
        platform: entry.platform,
        sellerSku: normalizeSku(entry.sellerSku),
        productId: entry.productId.trim(),
        modelId: entry.modelId || null,
        shortName: entry.shortName.trim()
      };
    });
    return { schema: SCHEMA, version: 1, entries };
  }

  function makeAssignment(platform, evidence, shortName) {
    if (!PLATFORMS.has(platform) || evidence?.status !== 'found' || !evidence.candidate ||
        evidence.candidate.platform !== platform ||
        !normalizeSku(evidence.sellerSku) || typeof shortName !== 'string' || !shortName.trim()) {
      throw new Error('An exact unique Seller SKU and internal name are required');
    }
    return validateAssignments({
      ...newAssignments(),
      entries: [{
        platform, sellerSku: evidence.sellerSku,
        productId: evidence.candidate.productId,
        modelId: evidence.candidate.modelId || null,
        shortName
      }]
    }).entries[0];
  }

  function upsertAssignment(current, platform, evidence, shortName) {
    const store = validateAssignments(current);
    const assignment = makeAssignment(platform, evidence, shortName);
    return validateAssignments({
      ...store,
      entries: [
        ...store.entries.filter(entry => entryKey(entry) !== entryKey(assignment)),
        assignment
      ]
    });
  }

  function match(index, platform, item, assignments, identityApi) {
    if (!identityApi || typeof identityApi.resolve !== 'function') {
      return { status: 'unmatched', reason: 'registry_identity_unavailable' };
    }
    if (!PLATFORMS.has(platform)) return { status: 'unmatched', reason: 'invalid_platform' };
    const evidence = identityApi.resolve(index, platform, item);
    if (evidence.status === 'ambiguous') {
      return { status: 'ambiguous', reason: 'duplicate_seller_sku', evidence };
    }
    if (evidence.status !== 'found') {
      return { status: 'unmatched', reason: evidence.reason || evidence.status, evidence };
    }
    const store = validateAssignments(assignments);
    const key = JSON.stringify([platform, normalizeSku(evidence.sellerSku)]);
    const assignment = store.entries.find(entry => entryKey(entry) === key);
    if (!assignment) {
      return { status: 'unmatched', reason: 'internal_name_not_assigned', evidence };
    }
    const candidate = evidence.candidate;
    if (assignment.productId !== candidate.productId ||
        (assignment.modelId || null) !== (candidate.modelId || null)) {
      return { status: 'ambiguous', reason: 'registry_identity_changed', evidence };
    }
    return {
      status: 'matched',
      reason: 'registry_exact_verified',
      sellerSku: normalizeSku(evidence.sellerSku),
      evidence,
      rule: { keyword: normalizeSku(evidence.sellerSku), shortName: assignment.shortName }
    };
  }
  function loadLocalAssignments(storage) {
    const raw = storage.getItem(LOCAL_ASSIGNMENTS_KEY);
    return raw === null ? newAssignments() : validateAssignments(JSON.parse(raw));
  }
  function saveLocalAssignments(storage, candidate) {
    const clean = validateAssignments(candidate);
    storage.setItem(LOCAL_ASSIGNMENTS_KEY, JSON.stringify(clean));
    return clean;
  }
  return { SCHEMA, LOCAL_ASSIGNMENTS_KEY, newAssignments, validateAssignments, makeAssignment, upsertAssignment, match, normalizeSku, loadLocalAssignments, saveLocalAssignments };
});
