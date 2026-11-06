(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterLocalRegistryBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REGISTRY_URL = './data/packmaster-marketplace-registry.json';
  const ASSIGNMENTS_URL = './data/packmaster-registry-assignments.json';

  const timestamp = value => {
    const time = Date.parse(value || '');
    return Number.isNaN(time) ? 0 : time;
  };

  const trimName = value => String(value || '').trim().slice(0, 150);

  function mergeRegistryBaseline(currentCandidate, baselineCandidate, registryApi) {
    if (!registryApi) throw new Error('Marketplace registry API is required');
    let current = registryApi.validateStore(currentCandidate);
    const baseline = registryApi.validateStore(baselineCandidate);

    for (const platform of registryApi.PLATFORMS) {
      const incoming = baseline.platforms[platform];
      if (!incoming) continue;
      const existing = current.platforms[platform];
      if (existing && timestamp(existing.source?.captureDate) > timestamp(incoming.source?.captureDate)) continue;
      current = registryApi.replacePlatformRegistry(current, incoming, new Date(baseline.updatedAt));
    }
    return registryApi.validateStore(current);
  }

  function mergeAssignmentBaseline(localCandidate, baselineCandidate, matcherApi) {
    if (!matcherApi) throw new Error('Registry matcher API is required');
    const local = matcherApi.validateAssignments(localCandidate);
    const baseline = matcherApi.validateAssignments(baselineCandidate);
    const localKeys = new Set(local.entries.map(entry => matcherApi.assignmentKey(entry)));
    return matcherApi.validateAssignments({
      schema: baseline.schema,
      version: baseline.version,
      entries: [
        ...baseline.entries.filter(entry => !localKeys.has(matcherApi.assignmentKey(entry))),
        ...local.entries
      ]
    });
  }

  function getRowEvidence(platform, row, index, matcherApi) {
    const productId = trimName(row?.productId || row?.itemId);
    if (!productId) return null;

    const sellerSku = trimName(row?.sellerSku);
    const productName = trimName(row?.productName || row?.title);
    const variantName = trimName(row?.variantName);
    const candidate = {
      platform,
      sellerSku: sellerSku || null,
      productId,
      productName,
      modelId: row?.modelId || null,
      variantName: variantName || null
    };

    const normalizedSku = matcherApi.normalizeSku(sellerSku);
    const sellerCandidates = normalizedSku
      ? (index?.[platform]?.sellerSkus?.get(normalizedSku) || [])
      : [];
    const sellerUnique = sellerCandidates.length === 1 &&
      sellerCandidates[0].productId === candidate.productId &&
      (sellerCandidates[0].modelId || null) === (candidate.modelId || null) &&
      (candidate.modelId
        ? true
        : (sellerCandidates[0].variantName || null) === (candidate.variantName || null));

    return {
      status: 'found',
      identityType: sellerUnique ? 'seller_sku' : 'catalog_row',
      sellerSku: sellerUnique ? sellerSku : null,
      candidate
    };
  }

  function defaultInternalName(row, evidence) {
    const sellerSku = trimName(row?.sellerSku);
    const productName = trimName(row?.productName || row?.title);
    const variantName = trimName(row?.variantName);

    if (evidence?.identityType === 'seller_sku' && sellerSku) return sellerSku;
    if (sellerSku && variantName) {
      if (sellerSku.toUpperCase() === variantName.toUpperCase()) return sellerSku;
      return trimName(sellerSku + ' • ' + variantName);
    }
    if (variantName && variantName.length >= 8) return variantName;
    if (variantName && productName) return trimName(productName + ' • ' + variantName);
    return sellerSku || variantName || productName;
  }

  function ensureRegistryAssignments(registryCandidate, assignmentsCandidate, registryApi, matcherApi, identityApi) {
    if (!registryApi || !matcherApi || !identityApi) {
      throw new Error('Registry APIs are required');
    }
    const registry = registryApi.validateStore(registryCandidate);
    let assignments = matcherApi.validateAssignments(assignmentsCandidate);
    const index = identityApi.buildIndex(registry, registryApi);

    for (const platform of registryApi.PLATFORMS) {
      for (const row of registry.platforms[platform]?.skuRows || []) {
        const evidence = getRowEvidence(platform, row, index, matcherApi);
        if (!evidence) continue;

        const probe = matcherApi.makeAssignment(platform, evidence, 'probe');
        const key = matcherApi.assignmentKey(probe);
        if (assignments.entries.some(entry => matcherApi.assignmentKey(entry) === key)) continue;

        const shortName = defaultInternalName(row, evidence);
        if (!shortName) continue;
        assignments = matcherApi.upsertAssignment(assignments, platform, evidence, shortName);
      }
    }
    return matcherApi.validateAssignments(assignments);
  }

  async function loadJson(fetchImpl, url) {
    const response = await fetchImpl(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load local registry baseline: HTTP ' + response.status);
    return response.json();
  }

  async function loadBaselines(fetchImpl = fetch) {
    const [registry, assignments] = await Promise.all([
      loadJson(fetchImpl, REGISTRY_URL),
      loadJson(fetchImpl, ASSIGNMENTS_URL)
    ]);
    return { registry, assignments };
  }

  return {
    REGISTRY_URL,
    ASSIGNMENTS_URL,
    mergeRegistryBaseline,
    mergeAssignmentBaseline,
    getRowEvidence,
    defaultInternalName,
    ensureRegistryAssignments,
    loadBaselines
  };
});
