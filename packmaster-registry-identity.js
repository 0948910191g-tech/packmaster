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

  const buildIndex = (storeCandidate, registryApi) => {
    if (!registryApi || typeof registryApi.validateStore !== 'function') {
      throw new Error('Registry validation API is required');
    }
    const store = registryApi.validateStore(storeCandidate);
    const index = {};
    for (const platform of PLATFORMS) {
      const data = store.platforms[platform] || null;
      const sellerSkus = new Map();
      for (const row of data?.skuRows || []) {
        const key = normalizeSellerSku(row.sellerSku);
        if (!key) continue;
        if (!sellerSkus.has(key)) sellerSkus.set(key, []);
        sellerSkus.get(key).push({
          platform,
          sellerSku: row.sellerSku,
          productId: platform === 'TIKTOK' ? row.productId : row.itemId,
          productName: platform === 'TIKTOK' ? row.productName : row.title,
          modelId: row.modelId || null,
          variantName: row.variantName || null
        });
      }
      index[platform] = { sellerSkus, captureDate: data?.source?.captureDate || null };
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
    // Only accept an explicit Seller SKU field or TikTok's known
    // "Product | Variant | Seller SKU" parser format, never fuzzy product names.
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

  const resolve = (index, platform, item) => {
    if (!PLATFORMS.includes(platform) || !index?.[platform]) {
      return { status: 'unavailable', reason: 'platform_or_registry_unavailable' };
    }
    const skuText = extractSellerSku(platform, item);
    const skuKey = normalizeSellerSku(skuText);
    if (!skuKey) return { status: 'no_identity', reason: 'seller_sku_not_explicit' };
    const candidates = index[platform].sellerSkus.get(skuKey) || [];
    if (candidates.length === 0) {
      return { status: 'not_found', sellerSku: skuText };
    }
    if (candidates.length > 1) {
      return { status: 'ambiguous', sellerSku: skuText, candidateCount: candidates.length };
    }
    return {
      status: 'found',
      sellerSku: skuText,
      candidate: { ...candidates[0] },
      captureDate: index[platform].captureDate
    };
  };

  return { buildIndex, normalizeSellerSku, extractSellerSku, resolve };
});
