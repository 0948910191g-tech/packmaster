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
  const normalizeSellerSku = skuNormalization.normalizeSellerSku;
  const normalizeCatalogText = skuNormalization.normalizeCatalogText ||
    (value => normalizeSellerSku(value).replace(/\s+/g, ''));

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
      for (const row of data?.skuRows || []) {
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
      }
      index[platform] = {
        sellerSkus,
        catalogTexts,
        captureDate: data?.source?.captureDate || null
      };
    }
    return index;
  };

  const extractSellerSku = (platform, item) => {
    if (!PLATFORMS.includes(platform) || !item) return null;
    if (typeof item.sellerSku === 'string' && item.sellerSku.trim()) {
      return skuNormalization.cleanPdfSellerSku(item.sellerSku) || null;
    }
    const text = typeof item === 'string' ? item : item.text;
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
    if (typeof item.catalogText === 'string' && item.catalogText.trim()) return item.catalogText.trim();
    const text = typeof item === 'string' ? item : item.text;
    if (typeof text !== 'string' || !text.trim()) return null;
    if (platform === 'TIKTOK') {
      const pieces = text.split('|').map(piece => piece.trim()).filter(Boolean);
      if (pieces.length >= 2) return [pieces[0], pieces[1]].join(' ');
      return null;
    }
    return text.trim();
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
        return { status: 'not_found', reason: 'seller_sku_not_found', identityType: 'seller_sku', sellerSku: skuText };
      }
      if (candidates.length === 1) {
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

    const canUseCatalog = platform === 'SHOPEE' ||
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
    resolve
  };
});
