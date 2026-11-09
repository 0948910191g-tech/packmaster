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

  const catalogVariantKey = entry =>
    entry?.modelId ? null : (String(entry?.variantName || '').trim() || null);

  const assignmentKey = entry => {
    const sellerSku = normalizeSku(entry?.sellerSku);
    if (sellerSku) return JSON.stringify(['seller_sku', entry.platform, sellerSku]);
    return JSON.stringify([
      'catalog_row',
      entry?.platform,
      String(entry?.productId || '').trim(),
      entry?.modelId || null,
      catalogVariantKey(entry)
    ]);
  };

  function validateAssignments(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
        candidate.schema !== SCHEMA || candidate.version !== 1 ||
        !Array.isArray(candidate.entries) || candidate.entries.length > 10000) {
      throw new Error('Invalid registry SKU assignments');
    }
    const seen = new Set();
    const entries = candidate.entries.map(entry => {
      const sellerSku = normalizeSku(entry?.sellerSku);
      const productId = typeof entry?.productId === 'string' ? entry.productId.trim() : '';
      const modelId = entry?.modelId || null;
      const variantName = typeof entry?.variantName === 'string' && entry.variantName.trim()
        ? entry.variantName.trim()
        : null;
      const identityType = sellerSku ? 'seller_sku' : entry?.identityType;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          !PLATFORMS.has(entry.platform) ||
          !productId ||
          typeof entry.shortName !== 'string' || !entry.shortName.trim() ||
          entry.shortName.length > 150 ||
          (modelId !== null && typeof modelId !== 'string') ||
          (!sellerSku && identityType !== 'catalog_row')) {
        throw new Error('Invalid registry SKU assignment entry');
      }
      const clean = {
        platform: entry.platform,
        identityType,
        sellerSku: sellerSku || null,
        productId,
        modelId,
        variantName,
        shortName: entry.shortName.trim()
      };
      const key = assignmentKey(clean);
      if (seen.has(key)) throw new Error('Duplicate registry identity assignment');
      seen.add(key);
      return clean;
    });
    return { schema: SCHEMA, version: 1, entries };
  }

  const evidenceKey = (platform, evidence) => {
    // Duplicated SKUs can be resolved by an exact catalog row. Preserve that
    // identity even when the evidence carries the original Seller SKU.
    if (evidence?.identityType === 'catalog_row') {
      if (!evidence.candidate) return '';
      return assignmentKey({
        platform,
        identityType: 'catalog_row',
        sellerSku: null,
        productId: evidence.candidate.productId,
        modelId: evidence.candidate.modelId || null,
        variantName: evidence.candidate.variantName || null,
        shortName: 'catalog-row-key'
      });
    }
    const sellerSku = normalizeSku(evidence?.sellerSku);
    if (sellerSku && (!evidence.identityType || evidence.identityType === 'seller_sku')) {
      return JSON.stringify(['seller_sku', platform, sellerSku]);
    }
    return '';
  };

  function makeAssignment(platform, evidence, shortName) {
    const candidate = evidence?.candidate;
    const key = evidenceKey(platform, evidence);
    if (!PLATFORMS.has(platform) || evidence?.status !== 'found' || !candidate ||
        candidate.platform !== platform || !key ||
        typeof shortName !== 'string' || !shortName.trim()) {
      throw new Error('An exact unique registry identity and internal name are required');
    }
    return validateAssignments({
      ...newAssignments(),
      entries: [{
        platform,
        identityType: evidence.identityType || (normalizeSku(evidence.sellerSku) ? 'seller_sku' : 'catalog_row'),
        sellerSku: evidence.identityType === 'catalog_row' ? null : (evidence.sellerSku || null),
        productId: candidate.productId,
        modelId: candidate.modelId || null,
        variantName: candidate.variantName || null,
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
        ...store.entries.filter(entry => assignmentKey(entry) !== assignmentKey(assignment)),
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
      return {
        status: 'ambiguous',
        reason: evidence.reason || 'duplicate_registry_identity',
        evidence
      };
    }
    if (evidence.status !== 'found') {
      return { status: 'unmatched', reason: evidence.reason || evidence.status, evidence };
    }

    const store = validateAssignments(assignments);
    const key = evidenceKey(platform, evidence);
    const assignment = store.entries.find(entry => assignmentKey(entry) === key);
    if (!assignment) {
      return { status: 'unmatched', reason: 'internal_name_not_assigned', evidence };
    }

    const candidate = evidence.candidate;
    const catalogVariantChanged = assignment.identityType === 'catalog_row' &&
      !assignment.modelId &&
      (assignment.variantName || null) !== (candidate.variantName || null);
    if (assignment.productId !== candidate.productId ||
        (assignment.modelId || null) !== (candidate.modelId || null) ||
        catalogVariantChanged) {
      return { status: 'ambiguous', reason: 'registry_identity_changed', evidence };
    }

    const keyword = normalizeSku(evidence.sellerSku) ||
      String(candidate.variantName || candidate.productName || evidence.catalogKey || '').trim();
    return {
      status: 'matched',
      reason: evidence.identityType === 'catalog_row'
        ? 'registry_catalog_exact_verified'
        : 'registry_exact_verified',
      identityType: evidence.identityType,
      sellerSku: normalizeSku(evidence.sellerSku) || null,
      evidence,
      rule: { keyword, shortName: assignment.shortName }
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

  return {
    SCHEMA,
    LOCAL_ASSIGNMENTS_KEY,
    newAssignments,
    validateAssignments,
    makeAssignment,
    upsertAssignment,
    match,
    normalizeSku,
    assignmentKey,
    loadLocalAssignments,
    saveLocalAssignments
  };
});
