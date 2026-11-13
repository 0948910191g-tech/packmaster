(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports
    ? require('./packmaster-sku-normalization.js')
    : root.PackMasterSkuNormalization);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterRegistryIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (skuNormalization) {
  'use strict';

  if (!skuNormalization) throw new Error('Seller SKU normalization module is required');
  const PLATFORMS = ['TIKTOK', 'SHOPEE'];
  // One text rule for every comparison; see packmaster-sku-normalization.js.
  const normalizeSellerSku = skuNormalization.normalizeSellerSku;
  const normalizeMatchKey = skuNormalization.normalizeMatchKey;
  const normalizeCatalogText = normalizeMatchKey;
  const stripInvisible = skuNormalization.stripInvisible;
  const normalizeThaiSkeleton = skuNormalization.normalizeThaiSkeleton;

  const candidateKey = candidate =>
    JSON.stringify([
      candidate.platform,
      candidate.productId,
      candidate.modelId || null,
      candidate.modelId ? null : (String(candidate.variantName || '').trim() || null)
    ]);

  const addCandidate = (map, key, candidate) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const entries = map.get(key);
    if (!entries.some(entry => candidateKey(entry) === candidateKey(candidate))) entries.push(candidate);
  };

  const buildIndex = (storeCandidate, registryApi) => {
    if (!registryApi || typeof registryApi.validateStore !== 'function') {
      throw new Error('Registry validation API is required');
    }
    const store = registryApi.validateStore(storeCandidate);
    const index = {};
    for (const platform of PLATFORMS) {
      const data = store.platforms[platform] || null;
      const sellerSkus = new Map();
      const catalogTexts = new Map();
      const catalogSkeletons = new Map();
      const catalogRows = typeof registryApi.getNameableRows === 'function'
        ? registryApi.getNameableRows(data, platform)
        : (data?.skuRows || []);
      for (const row of catalogRows) {
        const productName = platform === 'TIKTOK' ? row.productName : row.title;
        const candidate = {
          platform,
          sellerSku: row.sellerSku || null,
          productId: platform === 'TIKTOK' ? row.productId : row.itemId,
          productName,
          modelId: row.modelId || null,
          variantName: row.variantName || null
        };
        addCandidate(sellerSkus, normalizeSellerSku(row.sellerSku), candidate);
        addCandidate(catalogTexts, normalizeCatalogText(productName), candidate);
        addCandidate(
          catalogTexts,
          normalizeCatalogText([productName, row.variantName].filter(Boolean).join(' ')),
          candidate
        );
        addCandidate(catalogSkeletons, normalizeThaiSkeleton(productName), candidate);
        addCandidate(
          catalogSkeletons,
          normalizeThaiSkeleton([productName, row.variantName].filter(Boolean).join(' ')),
          candidate
        );
      }
      index[platform] = {
        sellerSkus,
        catalogTexts,
        catalogSkeletons,
        catalogRowsList: catalogRows.map(r => ({
          candidate: {
            platform,
            sellerSku: r.sellerSku || null,
            productId: platform === 'TIKTOK' ? r.productId : r.itemId,
            productName: platform === 'TIKTOK' ? r.productName : r.title,
            modelId: r.modelId || null,
            variantName: r.variantName || null
          },
          titleSkeleton: normalizeThaiSkeleton(platform === 'TIKTOK' ? r.productName : r.title),
          fullSkeleton: normalizeThaiSkeleton([platform === 'TIKTOK' ? r.productName : r.title, r.variantName].filter(Boolean).join(' '))
        })),
        registryRows: catalogRows.map(row => ({
          platform,
          sellerSku: row.sellerSku || null,
          productId: platform === 'TIKTOK' ? row.productId : row.itemId,
          productName: platform === 'TIKTOK' ? row.productName : row.title,
          modelId: row.modelId || null,
          variantName: row.variantName || null
        })),
        captureDate: data?.source?.captureDate || null,
        localProducts: (store.localProducts || []).filter(row => row.platform === platform)
      };
    }
    return index;
  };

  const extractSellerSku = (platform, item) => {
    if (!PLATFORMS.includes(platform) || !item) return null;
    if (typeof item.sellerSku === 'string' && item.sellerSku.trim()) {
      return skuNormalization.cleanPdfSellerSku(stripInvisible(item.sellerSku)) || null;
    }
    const text = typeof item === 'string' ? stripInvisible(item) : stripInvisible(item.text);
    if (typeof text !== 'string') return null;
    const explicit = text.match(/(?:^|[|\n])\s*Seller\s*SKU\s*[:：]\s*([^|\n]+)/i);
    if (explicit?.[1]?.trim()) return skuNormalization.cleanPdfSellerSku(explicit[1]) || null;
    if (platform === 'TIKTOK') {
      const pieces = text.split('|');
      if (pieces.length === 3 && pieces.every(piece => piece.trim())) {
        return skuNormalization.cleanPdfSellerSku(pieces[2]) || null;
      }
    }
    return null;
  };

  const extractCatalogText = (platform, item) => {
    if (!PLATFORMS.includes(platform) || !item) return null;
    if (typeof item.catalogText === 'string' && stripInvisible(item.catalogText).trim()) return stripInvisible(item.catalogText).trim();
    const text = typeof item === 'string' ? stripInvisible(item) : stripInvisible(item.text);
    if (typeof text !== 'string' || !text.trim()) return null;
    if (platform === 'TIKTOK') {
      const pieces = text.split('|').map(piece => piece.trim()).filter(Boolean);
      if (pieces.length >= 2) return [pieces[0], pieces[1]].join(' ');
      return null;
    }
    return text.trim();
  };

  const extractCatalogPair = (platform, item) => {
    if (!PLATFORMS.includes(platform) || !item) return null;
    if (Array.isArray(item.catalogPair) && item.catalogPair.length === 2 && item.catalogPair.every(value => typeof value === 'string' && stripInvisible(value).trim())) {
      return item.catalogPair.map(value => stripInvisible(value).trim());
    }
    const text = typeof item === 'string' ? stripInvisible(item) : stripInvisible(item.text);
    if (platform === 'TIKTOK' && typeof text === 'string') {
      const pieces = text.split('|').map(piece => piece.trim());
      if ((pieces.length === 2 || pieces.length === 3) && pieces[0] && pieces[1]) return pieces.slice(0, 2);
    }
    const catalogText = extractCatalogText(platform, item);
    return catalogText ? [catalogText.trim(), ''] : null;
  };

  const resolveCatalog = (index, platform, item) => {
    const rawText = extractCatalogText(platform, item);
    const catalogKey = normalizeCatalogText(rawText);
    if (!catalogKey) return { status: 'no_identity', reason: 'catalog_text_not_explicit' };
    const candidates = index[platform].catalogTexts.get(catalogKey) || [];
    if (candidates.length > 1) {
      return {
        status: 'ambiguous',
        reason: 'duplicate_catalog_text',
        identityType: 'catalog_row',
        catalogKey,
        candidateCount: candidates.length
      };
    }
    if (candidates.length === 1) {
      return {
        status: 'found',
        identityType: 'catalog_row',
        sellerSku: null,
        catalogKey,
        candidate: { ...candidates[0] },
        captureDate: index[platform].captureDate
      };
    }

    // Secondary fallback: normalized Thai skeleton match (handles PUA glyphs, displaced karan, tone reordering)
    const skeletonKey = normalizeThaiSkeleton(rawText);
    if (skeletonKey && index[platform].catalogSkeletons) {
      const skeletonCandidates = index[platform].catalogSkeletons.get(skeletonKey) || [];
      if (skeletonCandidates.length === 1) {
        return {
          status: 'found',
          identityType: 'catalog_row',
          sellerSku: null,
          catalogKey,
          candidate: { ...skeletonCandidates[0] },
          captureDate: index[platform].captureDate,
          reason: 'skeleton_catalog_match'
        };
      }
      if (skeletonCandidates.length > 1) {
        return {
          status: 'ambiguous',
          reason: 'duplicate_catalog_skeleton',
          identityType: 'catalog_row',
          catalogKey,
          candidateCount: skeletonCandidates.length
        };
      }
    }

    // Tertiary fallback: prefix and ellipsis matching for Flash/Shopee labels where title was truncated
    // Length gate ignores whitespace runs so that line breaks do not change which path runs.
    if (Array.isArray(index[platform].catalogRowsList) && rawText.replace(/\s+/g, ' ').length >= 20) {
      const parts = rawText.split(/\.{3,}|\u2026/).map(normalizeThaiSkeleton).filter(p => p.length >= 6);
      if (parts.length > 0) {
        const ellipsisCandidates = index[platform].catalogRowsList.filter(row => {
          return parts.every((p, idx) => {
            if (idx === 0) return row.fullSkeleton.startsWith(p) || row.titleSkeleton.startsWith(p);
            return row.fullSkeleton.includes(p);
          });
        });
        if (ellipsisCandidates.length === 1) {
          return {
            status: 'found',
            identityType: 'catalog_row',
            sellerSku: null,
            catalogKey,
            candidate: { ...ellipsisCandidates[0].candidate },
            captureDate: index[platform].captureDate,
            reason: 'ellipsis_catalog_match'
          };
        }
        if (ellipsisCandidates.length > 1) {
          return {
            status: 'ambiguous',
            reason: 'duplicate_ellipsis_catalog_match',
            identityType: 'catalog_row',
            catalogKey,
            candidateCount: ellipsisCandidates.length
          };
        }
      }
    }

    return {
      status: 'not_found',
      reason: 'catalog_text_not_found',
      identityType: 'catalog_row',
      catalogKey
    };
  };

  const resolve = (index, platform, item) => {
    if (!PLATFORMS.includes(platform) || !index?.[platform]) {
      return { status: 'unavailable', reason: 'platform_or_registry_unavailable' };
    }

    const skuText = extractSellerSku(platform, item);
    const skuKey = normalizeSellerSku(skuText);
    if (skuKey) {
      const candidates = index[platform].sellerSkus.get(skuKey) || [];
      if (candidates.length === 0) {
        const rawText = typeof item === 'string' ? stripInvisible(item) : (typeof item?.text === 'string' ? stripInvisible(item.text) : null);
        let productTitle = null;
        if (rawText && rawText.includes('|')) {
          const pieces = rawText.split('|').map(piece => piece.trim()).filter(Boolean);
          if (pieces.length > 0) productTitle = pieces[0];
        }
        if (!productTitle && item && typeof item === 'object') {
          if (typeof item.productName === 'string' && item.productName.trim()) {
            productTitle = item.productName.trim();
          } else if (typeof item.title === 'string' && item.title.trim()) {
            productTitle = item.title.trim();
          }
        }

        if (productTitle) {
          const titleKey = normalizeCatalogText(productTitle);
          if (titleKey) {
            const titleCandidates = index[platform].catalogTexts.get(titleKey) || [];
            if (titleCandidates.length === 1) {
              const candidate = titleCandidates[0];
              return {
                status: 'found',
                identityType: 'catalog_row',
                sellerSku: skuText,
                catalogKey: titleKey,
                candidate: { ...candidate },
                captureDate: index[platform].captureDate,
                reason: 'exact_title_fallback'
              };
            }
          }

          // Secondary title fallback: normalized Thai skeleton
          const titleSkeletonKey = normalizeThaiSkeleton(productTitle);
          if (titleSkeletonKey && index[platform].catalogSkeletons) {
            const skelCandidates = index[platform].catalogSkeletons.get(titleSkeletonKey) || [];
            if (skelCandidates.length === 1) {
              const candidate = skelCandidates[0];
              return {
                status: 'found',
                identityType: 'catalog_row',
                sellerSku: skuText,
                catalogKey: titleKey || titleSkeletonKey,
                candidate: { ...candidate },
                captureDate: index[platform].captureDate,
                reason: 'skeleton_title_fallback'
              };
            }
          }
        }
        return { status: 'not_found', reason: 'seller_sku_not_found', identityType: 'seller_sku', sellerSku: skuText };
      }
      if (candidates.length === 1) {
        const catalogEvidence = resolveCatalog(index, platform, item);
        if (catalogEvidence.status === 'found' &&
            candidateKey(catalogEvidence.candidate) !== candidateKey(candidates[0])) {
          return {
            status: 'ambiguous',
            reason: 'seller_sku_catalog_identity_conflict',
            identityType: 'seller_sku',
            sellerSku: skuText,
            candidateCount: 1
          };
        }
        return {
          status: 'found',
          identityType: 'seller_sku',
          sellerSku: skuText,
          candidate: { ...candidates[0] },
          captureDate: index[platform].captureDate
        };
      }

      const catalogEvidence = resolveCatalog(index, platform, item);
      if (catalogEvidence.status === 'found' &&
          candidates.some(candidate => candidateKey(candidate) === candidateKey(catalogEvidence.candidate))) {
        return {
          ...catalogEvidence,
          sellerSku: skuText,
          reason: 'duplicate_seller_sku_disambiguated_by_catalog'
        };
      }
      return {
        status: 'ambiguous',
        reason: 'duplicate_seller_sku',
        identityType: 'seller_sku',
        sellerSku: skuText,
        candidateCount: candidates.length
      };
    }

    const explicitCatalogText = typeof item === 'object' && typeof item?.catalogText === 'string' &&
      Boolean(item.catalogText.trim());
    const canUseCatalog = platform === 'SHOPEE' || explicitCatalogText ||
      (platform === 'TIKTOK' && typeof (typeof item === 'string' ? item : item?.text) === 'string' &&
        String(typeof item === 'string' ? item : item?.text).includes('|'));
    if (canUseCatalog) return resolveCatalog(index, platform, item);

    return { status: 'no_identity', reason: 'seller_sku_not_explicit' };
  };

  return {
    buildIndex,
    normalizeSellerSku,
    normalizeCatalogText,
    extractSellerSku,
    extractCatalogText,
    extractCatalogPair,
    resolve
  };
});
