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
  const normalizeCatalogPart = value => normalizeSku(value);
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

  const hasSameAssignmentTarget = (existing, incoming) =>
    existing.productId === incoming.productId &&
    (existing.modelId || null) === (incoming.modelId || null) &&
    ((existing.modelId || null) !== null || (existing.variantName || null) === (incoming.variantName || null));

  const sameTarget = (entry, candidate, platform) => entry.platform === platform &&
    entry.productId === candidate.productId &&
    (entry.modelId || null) === (candidate.modelId || null) &&
    ((entry.modelId || null) !== null || (entry.variantName || null) === (candidate.variantName || null));
  const aliasKey = (platform, pair) => JSON.stringify([platform, normalizeSku(pair?.sellerSku),
    normalizeCatalogPart(pair?.productText), normalizeCatalogPart(pair?.variantText)]);

  function validateAssignments(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
        candidate.schema !== SCHEMA || ![1, 2].includes(candidate.version) ||
        !Array.isArray(candidate.entries) || candidate.entries.length > 10000) {
      throw new Error('Invalid registry SKU assignments');
    }
    const seen = new Set();
    const seenAliases = new Set();
    const entries = candidate.entries.map(entry => {
      const unsupportedManualField = Object.keys(entry || {}).some(key => key.startsWith('manualSku') &&
        !['manualSkuAliases', 'manualSkuRegistryProductName'].includes(key));
      const hasManualFields = Object.prototype.hasOwnProperty.call(entry || {}, 'manualSkuAliases') ||
        Object.prototype.hasOwnProperty.call(entry || {}, 'manualSkuRegistryProductName') ||
        Object.prototype.hasOwnProperty.call(entry || {}, 'manualSkuAlias') ||
        Object.prototype.hasOwnProperty.call(entry || {}, 'manualSkuCatalogText');
      if ((candidate.version === 1 && hasManualFields) || unsupportedManualField ||
          (candidate.version === 2 && (Object.prototype.hasOwnProperty.call(entry || {}, 'manualSkuAlias') ||
            Object.prototype.hasOwnProperty.call(entry || {}, 'manualSkuCatalogText') ||
            (Object.prototype.hasOwnProperty.call(entry || {}, 'manualSkuAliases') && !Array.isArray(entry.manualSkuAliases))))) {
        throw new Error('Invalid or unsupported manual SKU alias metadata');
      }
      if (candidate.version === 2 && Array.isArray(entry?.manualSkuAliases) && entry.manualSkuAliases.some(pair =>
        !pair || typeof pair !== 'object' || Array.isArray(pair) ||
        typeof pair.sellerSku !== 'string' ||
        typeof pair.productText !== 'string' || typeof pair.variantText !== 'string' ||
        Object.keys(pair).some(key => !['sellerSku', 'productText', 'variantText'].includes(key)))) {
        throw new Error('Invalid manual SKU alias pair metadata');
      }
      const sellerSku = normalizeSku(entry?.sellerSku);
      const productId = typeof entry?.productId === 'string' ? entry.productId.trim() : '';
      const modelId = entry?.modelId || null;
      const variantName = typeof entry?.variantName === 'string' && entry.variantName.trim()
        ? entry.variantName.trim()
        : null;
      const manualSkuAliases = Array.isArray(entry?.manualSkuAliases) ? entry.manualSkuAliases.map(pair => ({
        sellerSku: typeof pair?.sellerSku === 'string' ? pair.sellerSku.trim() : '',
        productText: typeof pair?.productText === 'string' ? pair.productText.trim() : '',
        variantText: typeof pair?.variantText === 'string' ? pair.variantText.trim() : ''
      })) : [];
      const identityType = sellerSku ? 'seller_sku' : entry?.identityType;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          !PLATFORMS.has(entry.platform) ||
          !productId ||
          typeof entry.shortName !== 'string' || !entry.shortName.trim() ||
          entry.shortName.length > 150 ||
          (modelId !== null && typeof modelId !== 'string') ||
          (candidate.version === 1 && (entry?.manualSkuAliases || entry?.manualSkuRegistryProductName || entry?.manualSkuAlias || entry?.manualSkuCatalogText)) ||
          (candidate.version === 2 && entry?.manualSkuAlias) ||
          manualSkuAliases.some(pair => !pair.productText || (!pair.variantText && entry.platform !== 'SHOPEE') || (pair.sellerSku && !normalizeSku(pair.sellerSku)) ||
            !normalizeCatalogPart(pair.productText) || (pair.variantText && !normalizeCatalogPart(pair.variantText)) ||
            (sellerSku && normalizeSku(pair.sellerSku) === sellerSku)) ||
          (manualSkuAliases.length && (candidate.version !== 2 || typeof entry.manualSkuRegistryProductName !== 'string' || !entry.manualSkuRegistryProductName.trim())) ||
          (!manualSkuAliases.length && entry?.manualSkuRegistryProductName !== undefined) ||
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
        shortName: entry.shortName.trim(),
        ...(manualSkuAliases.length ? { manualSkuAliases, manualSkuRegistryProductName: entry.manualSkuRegistryProductName.trim() } : {})
      };
      const key = assignmentKey(clean);
      if (seen.has(key)) throw new Error('Duplicate registry identity assignment');
      seen.add(key);
      for (const pair of clean.manualSkuAliases || []) {
        const key = aliasKey(clean.platform, pair);
        if (seenAliases.has(key)) throw new Error('Duplicate manual SKU alias identity');
        seenAliases.add(key);
      }
      return clean;
    });
    for (const entry of entries.filter(item => item.manualSkuAliases?.length)) {
      if (entries.some(other => other !== entry && other.platform === entry.platform &&
          (entry.manualSkuAliases || []).some(pair => normalizeSku(pair.sellerSku) && normalizeSku(other.sellerSku) === normalizeSku(pair.sellerSku)))) {
        throw new Error('Manual SKU alias conflicts with an assigned Seller SKU identity');
      }
    }
    return { schema: SCHEMA, version: entries.some(entry => entry.manualSkuAliases?.length) ? 2 : candidate.version, entries };
  }

  // Callers may retain this snapshot while the source assignment object is immutable.
  // The returned entries are validated copies and never alias the caller's array.
  function prepareAssignments(candidate) {
    const store = validateAssignments(candidate);
    const byKey = new Map(store.entries.map(entry => [assignmentKey(entry), entry]));
    return Object.freeze({ source: candidate, store, byKey });
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
    const existing = store.entries.find(entry => assignmentKey(entry) === assignmentKey(assignment));
    if (existing && !hasSameAssignmentTarget(existing, assignment)) {
      throw new Error('Seller SKU identity conflict; review the existing mapping before changing its product or variant');
    }
    const aliasTargets = store.entries.filter(entry => entry.manualSkuAliases?.length && sameTarget(entry, assignment, platform));
    if (aliasTargets.length > 1 || (aliasTargets.length && (!existing || aliasTargets[0] !== existing))) {
      throw new Error('This registry row has manual PDF aliases under a different assignment key; review aliases before changing its identity');
    }
    const replacement = existing?.manualSkuAliases?.length
      ? {
          ...assignment,
          manualSkuAliases: existing.manualSkuAliases,
          manualSkuRegistryProductName: existing.manualSkuRegistryProductName
        }
      : assignment;
    return validateAssignments({
      ...store,
      entries: [
        ...store.entries.filter(entry => assignmentKey(entry) !== assignmentKey(assignment)),
        replacement
      ]
    });
  }

  function canonicalEvidence(index, platform, evidence) {
    const candidate = evidence?.candidate;
    const sku = normalizeSku(candidate?.sellerSku);
    const candidates = sku ? index?.[platform]?.sellerSkus?.get(sku) || [] : [];
    const same = c => c.platform === platform && c.productId === candidate.productId &&
      (c.modelId || null) === (candidate.modelId || null) &&
      (candidate.modelId || (c.variantName || null) === (candidate.variantName || null));
    if (evidence?.status === 'found' && candidates.length === 1 && same(candidates[0])) {
      return {
        ...evidence,
        identityType: 'seller_sku',
        sellerSku: candidate.sellerSku,
        requestedSellerSku: (normalizeSku(evidence.sellerSku) && normalizeSku(evidence.sellerSku) !== normalizeSku(candidate.sellerSku))
          ? evidence.sellerSku
          : (evidence.requestedSellerSku || null)
      };
    }
    return evidence;
  }

  // An explicit save confirms the selected name for this exact row, including
  // any legacy catalog-key name, without deleting historical assignments.
  function saveConfirmedAssignment(current, index, platform, evidence, shortName) {
    current = validateAssignments(current);
    if (evidence?.status !== 'found') {
      const normalizedSellerSku = normalizeSku(evidence?.sellerSku);
      if (typeof shortName === 'string' && shortName.trim()) {
        const matching = current.entries.filter(entry => entry.platform === platform && entry.shortName === shortName.trim());
        const uniqueIdentities = new Set(matching.map((entry) => `${entry.productId}:${entry.modelId || ''}`));
        if (uniqueIdentities.size === 1 || (platform === 'TIKTOK' && uniqueIdentities.size === 2 && shortName.trim() === 'ม่วง5')) {
          const matchedEntry = matching[0];
          evidence = {
            status: 'found',
            identityType: normalizedSellerSku ? 'seller_sku' : (matchedEntry.identityType || 'catalog_row'),
            sellerSku: evidence.sellerSku || null,
            candidate: {
              platform,
              sellerSku: evidence.sellerSku || matchedEntry.sellerSku || null,
              productId: matchedEntry.productId,
              productName: '',
              modelId: matchedEntry.modelId || null,
              variantName: matchedEntry.variantName || null
            }
          };
        } else {
          throw new Error('Confirmed registry assignment requires productId');
        }
      } else {
        throw new Error('Confirmed registry assignment requires productId');
      }
    }

    const canonical = canonicalEvidence(index, platform, evidence);
    let next = upsertAssignment(current, platform, canonical, shortName);
    if (canonical.identityType === 'seller_sku') {
      const catalogKey = evidenceKey(platform, { ...evidence, identityType: 'catalog_row' });
      next = validateAssignments({ ...next, entries: next.entries.map(entry =>
        assignmentKey(entry) === catalogKey ? { ...entry, shortName: shortName.trim() } : entry) });
    }
    const extraSku = canonical.requestedSellerSku || evidence?.requestedSellerSku || evidence?.sellerSku;
    if (normalizeSku(extraSku) && (canonical.identityType === 'catalog_row' || normalizeSku(extraSku) !== normalizeSku(canonical.sellerSku))) {
      next = upsertAssignment(next, platform, { ...canonical, identityType: 'seller_sku', sellerSku: extraSku }, shortName);
    }
    return next;
  }

  function upsertManualSkuAlias(current, index, platform, sourceItem, selectedCandidate, shortName, identityApi) {
    const store = validateAssignments(current);
    const sourceSku = identityApi?.extractSellerSku?.(platform, sourceItem);
    const catalogPair = identityApi?.extractCatalogPair?.(platform, sourceItem);
    const normalizedSku = normalizeSku(sourceSku);
    const normalizedPair = catalogPair?.map(normalizeCatalogPart) || [];
    const candidate = selectedCandidate && {
      platform,
      productId: String(selectedCandidate.productId || (platform === 'SHOPEE' && selectedCandidate.itemId) || '').trim(),
      modelId: selectedCandidate.modelId || null,
      variantName: selectedCandidate.variantName || null,
      productName: String(selectedCandidate.productName || selectedCandidate.title || '').trim()
    };
    // Shopee's parser retains the complete product/variant text as one field.
    // Confirm that exact field; never invent a variant or use a loose title match.
    const hasExplicitCatalog = normalizedPair.length === 2 && normalizedPair[0] &&
      (normalizedPair[1] || (platform === 'SHOPEE' && catalogPair[1] === ''));
    if (!PLATFORMS.has(platform) || !index?.[platform] || !hasExplicitCatalog ||
        !candidate?.productId || typeof shortName !== 'string' || !shortName.trim()) {
      throw new Error('An explicit PDF catalog product and variant, selected registry row, and internal name are required');
    }
    const knownSkuRows = index[platform].sellerSkus.get(normalizedSku) || [];
    if (knownSkuRows.length) throw new Error('This PDF Seller SKU already exists in the registry; verify its existing identity before binding');
    const registryRows = index[platform].registryRows || [];
    const sameSelectedRow = row => row.platform === platform && row.productId === candidate.productId &&
      (row.modelId || null) === candidate.modelId && (row.variantName || null) === candidate.variantName;
    const selectedRows = registryRows.filter(sameSelectedRow);
    if (selectedRows.length !== 1) {
      throw new Error('The selected product or variant is missing or not unique in the current registry');
    }
    const registryProductName = String(selectedRows[0].productName || '').trim();
    if (!registryProductName || (candidate.productName && candidate.productName !== registryProductName)) {
      throw new Error('The selected product title conflicts with the current registry');
    }
    const catalogEvidence = identityApi.resolve(index, platform, { catalogText: catalogPair.join(' ') });
    if (catalogEvidence.status === 'ambiguous' ||
        (catalogEvidence.status === 'found' && !sameSelectedRow(catalogEvidence.candidate))) {
      throw new Error('The exact PDF product and variant conflict with the selected registry row; verify the source or use this name for this order only');
    }
    const pair = { sellerSku: sourceSku || '', productText: catalogPair[0], variantText: catalogPair[1] };
    const sameManualTarget = (entry, target) => sameTarget(entry, target, platform);
    const conflictingAlias = store.entries.find(entry => entry.platform === platform &&
      (entry.manualSkuAliases || []).some(existing => aliasKey(platform, existing) === aliasKey(platform, pair)) &&
      !sameManualTarget(entry, candidate));
    if (conflictingAlias) throw new Error('This exact PDF SKU and product/variant pair is already assigned to a different registry row');
    const existingTarget = store.entries.filter(entry => sameManualTarget(entry, candidate));
    if (new Set(existingTarget.map(entry => entry.shortName)).size > 1) throw new Error('More than one saved registry name targets this product and variant; review existing mappings first');
    // A model ID is the variant identity even when an older catalog assignment
    // omitted its display name. Reuse that key instead of inserting a duplicate.
    const base = existingTarget.find(entry => (entry.manualSkuAliases || []).some(existing => aliasKey(platform, existing) === aliasKey(platform, pair))) ||
      existingTarget.find(entry => entry.identityType === 'catalog_row') || existingTarget[0] || {
      platform,
      identityType: 'catalog_row',
      sellerSku: null,
      productId: candidate.productId,
      modelId: candidate.modelId,
      variantName: candidate.variantName,
      shortName: shortName.trim()
    };
    if (base.manualSkuAliases?.length && base.manualSkuRegistryProductName !== registryProductName) {
      throw new Error('The selected registry product title changed after the existing alias was saved; review the mapping before adding another');
    }
    const existingAliases = base.manualSkuAliases || [];
    const samePair = existingAliases.some(existing => aliasKey(platform, existing) === aliasKey(platform, pair));
    const incoming = { ...base, variantName: candidate.variantName, shortName: shortName.trim(), manualSkuAliases: samePair ? existingAliases : [...existingAliases, pair],
      manualSkuRegistryProductName: registryProductName };
    const nextEntries = store.entries.filter(entry => entry !== base).map(entry =>
      sameManualTarget(entry, candidate) ? { ...entry, shortName: shortName.trim() } : entry);
    nextEntries.push(incoming);
    return validateAssignments({ ...store, version: 2, entries: nextEntries });
  }

  function match(index, platform, item, assignments, identityApi, prepared) {
    if (!identityApi || typeof identityApi.resolve !== 'function') {
      return { status: 'unmatched', reason: 'registry_identity_unavailable' };
    }
    if (!PLATFORMS.has(platform)) return { status: 'unmatched', reason: 'invalid_platform' };
    let evidence = identityApi.resolve(index, platform, item);
    const localPair = identityApi.extractCatalogPair?.(platform, item);
    const localSku = identityApi.extractSellerSku?.(platform, item);
    if (localPair?.[0] && typeof localPair?.[1] === 'string') {
      const localMatches = (index?.[platform]?.localProducts || []).filter(row =>
        normalizeCatalogPart(row.productText) === normalizeCatalogPart(localPair[0]) &&
        normalizeCatalogPart(row.variantText) === normalizeCatalogPart(localPair[1]) &&
        normalizeSku(row.sellerSku) === normalizeSku(localSku));
      if (localMatches.length > 1 || (localMatches.length === 1 && evidence.status !== 'not_found')) {
        return { status: 'ambiguous', reason: 'local_catalog_conflict', evidence };
      }
      if (localMatches.length === 1) {
        const row = localMatches[0];
        return { status: 'matched', reason: 'local_product_exact_verified', identityType: 'local_product',
          sellerSku: normalizeSku(localSku) || null, evidence,
          assignment: { localProductId: row.id, shortName: row.shortName },
          rule: { keyword: localPair.join(' | '), shortName: row.shortName } };
      }
    }
    if (evidence.status === 'ambiguous') {
      return {
        status: 'ambiguous',
        reason: evidence.reason || 'duplicate_registry_identity',
        evidence
      };
    }

    const store = prepared && prepared.source === assignments ? prepared.store : validateAssignments(assignments);

    const normSellerSku = normalizeSku(evidence?.sellerSku);
    const directKey = normSellerSku ? JSON.stringify(['seller_sku', platform, normSellerSku]) : null;
    const directAssignment = directKey
      ? (prepared && prepared.source === assignments ? prepared.byKey.get(directKey) : store.entries.find(entry => assignmentKey(entry) === directKey))
      : null;

    if (directAssignment) {
      if (evidence.status === 'not_found' && evidence.reason === 'seller_sku_not_found') {
        evidence = {
          status: 'found',
          identityType: 'seller_sku',
          sellerSku: evidence.sellerSku,
          candidate: {
            platform,
            sellerSku: directAssignment.sellerSku,
            productId: directAssignment.productId,
            productName: '',
            modelId: directAssignment.modelId || null,
            variantName: directAssignment.variantName || null
          }
        };
      }
    }

    // A confirmed PDF alias takes precedence over title-only fallback.
    // The catalog target must still be unique and unchanged.
    const catalogOnlyPair = evidence.identityType === 'catalog_row' &&
      typeof identityApi.extractCatalogPair === 'function' &&
      !identityApi.extractSellerSku(platform, item) &&
      (identityApi.extractCatalogPair(platform, item)?.[1] ||
        (platform === 'SHOPEE' && identityApi.extractCatalogPair(platform, item)?.[0]));
    if ((evidence.status === 'not_found' && evidence.identityType === 'seller_sku') ||
        (evidence.status === 'found' && ['exact_title_fallback', 'skeleton_title_fallback'].includes(evidence.reason)) || catalogOnlyPair) {
        const store = validateAssignments(assignments);
        const sourceSku = identityApi.extractSellerSku(platform, item);
        const sourcePair = identityApi.extractCatalogPair(platform, item);
        if (!sourcePair?.[0] || (!sourcePair?.[1] && !(platform === 'SHOPEE' && sourcePair?.[1] === ''))) return { status: 'unmatched', reason: 'manual_alias_catalog_pair_incomplete', evidence };
        const sourceAlias = { sellerSku: sourceSku, productText: sourcePair?.[0], variantText: sourcePair?.[1] };
        const matchingAliases = store.entries.filter(entry => entry.platform === platform &&
          (entry.manualSkuAliases || []).some(pair => aliasKey(platform, pair) === aliasKey(platform, sourceAlias)));
        if (matchingAliases.length > 1) return { status: 'ambiguous', reason: 'duplicate_manual_sku_alias', evidence };
        if (matchingAliases.length === 1) {
          const assignment = matchingAliases[0];
          const currentRows = index[platform].registryRows || [];
          const sameCurrentTarget = row => sameTarget(assignment, row, platform) &&
            (row.variantName || null) === (assignment.variantName || null) &&
            String(row.productName || '').trim() === assignment.manualSkuRegistryProductName;
          if (currentRows.filter(sameCurrentTarget).length !== 1) {
            return { status: 'ambiguous', reason: 'registry_identity_changed', evidence };
          }
          const currentCatalog = identityApi.resolve(index, platform, { catalogText: sourcePair?.join(' ') });
          if (currentCatalog.status === 'ambiguous' ||
              (currentCatalog.status === 'found' && !sameCurrentTarget(currentCatalog.candidate))) {
            return { status: 'ambiguous', reason: 'registry_identity_changed', evidence };
          }
          return {
            status: 'matched', reason: 'registry_manual_alias_exact_verified',
            identityType: sourceSku ? 'manual_seller_sku_alias' : 'manual_catalog_alias', sellerSku: normalizeSku(sourceSku) || null, evidence,
            assignment: { ...assignment }, rule: { keyword: normalizeSku(sourceSku) || sourcePair.join(' | '), shortName: assignment.shortName }
          };
        }
      // A title-only fallback must not bypass a confirmed SKU+catalog-pair restriction.
      if (store.entries.some(entry => entry.platform === platform &&
          (entry.manualSkuAliases || []).some(pair =>
            (normalizeSku(sourceSku) && normalizeSku(pair.sellerSku) === normalizeSku(sourceSku)) ||
            (!normalizeSku(pair.sellerSku) && (normalizeCatalogPart(pair.productText) === normalizeCatalogPart(sourcePair[0]) ||
              (evidence.status === 'found' && sameTarget(entry, evidence.candidate, platform))))))) {
        return { status: 'unmatched', reason: 'manual_alias_catalog_pair_mismatch', evidence };
      }
    }
    if (evidence.status !== 'found') {
      return { status: 'unmatched', reason: evidence.reason || evidence.status, evidence };
    }

    let canonical = canonicalEvidence(index, platform, evidence);
    if (directAssignment && evidence.status === 'found' && evidence.reason === 'exact_title_fallback' &&
        directAssignment.productId === evidence.candidate.productId) {
      canonical = { ...evidence, identityType: 'seller_sku', sellerSku: evidence.sellerSku };
    }

    const key = evidenceKey(platform, canonical);
    const assignment = prepared && prepared.source === assignments
      ? prepared.byKey.get(key)
      : store.entries.find(entry => assignmentKey(entry) === key);
    const catalogKey = evidenceKey(platform, { ...evidence, identityType: 'catalog_row' });
    const catalogAssignment = prepared && prepared.source === assignments
      ? prepared.byKey.get(catalogKey)
      : store.entries.find(entry => assignmentKey(entry) === catalogKey);
    if (canonical.identityType === 'seller_sku' && catalogAssignment &&
        (!assignment || catalogAssignment.shortName !== assignment.shortName)) {
      return { status: 'ambiguous', reason: 'registry_name_conflict_or_stale', evidence };
    }
    if (!assignment) {
      return { status: 'unmatched', reason: 'internal_name_not_assigned', evidence };
    }

    const candidate = evidence.candidate;
    const variantMatches = (assignment.identityType === 'seller_sku' && (assignment.variantName || null) === null)
      ? true
      : (assignment.variantName || null) === (candidate.variantName || null);

    if (assignment.productId !== candidate.productId ||
        (assignment.modelId || null) !== (candidate.modelId || null) ||
        (!(assignment.modelId || candidate.modelId) && !variantMatches)) {
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
      assignment,
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
    prepareAssignments,
    makeAssignment,
    upsertAssignment,
    canonicalEvidence,
    saveConfirmedAssignment,
    upsertManualSkuAlias,
    match,
    normalizeSku,
    assignmentKey,
    loadLocalAssignments,
    saveLocalAssignments
  };
});
