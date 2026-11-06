(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterMarketplaceRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'packmaster-marketplace-registry';
  const VERSION = 1;
  const STORAGE_KEY = 'packmasterMarketplaceRegistryV1';
  const SOURCE_REGISTRY_TYPE = 'marketplace_product_sku_source_registry';
  const PLATFORMS = Object.freeze(['TIKTOK', 'SHOPEE']);

  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const cloneJson = (value) => JSON.parse(JSON.stringify(value));
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
  const isValidDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
  const idFieldFor = (platform) => platform === 'TIKTOK' ? 'productId' : 'itemId';
  const nameFieldFor = (platform) => platform === 'TIKTOK' ? 'productName' : 'title';

  const createEmptyStore = (now = new Date()) => {
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid marketplace registry date');
    return {
      schema: SCHEMA,
      version: VERSION,
      updatedAt: date.toISOString(),
      platforms: {}
    };
  };

  const validatePlatformRegistry = (candidate, expectedPlatform = null) => {
    if (!isPlainObject(candidate)) throw new Error('Marketplace registry file must be an object');
    if (candidate.registryType !== SOURCE_REGISTRY_TYPE) throw new Error('Unsupported marketplace registry type');
    if (candidate.schemaVersion !== 1) throw new Error('Unsupported marketplace registry version');
    if (!PLATFORMS.includes(candidate.platform)) throw new Error('Marketplace registry platform must be TIKTOK or SHOPEE');
    if (expectedPlatform && candidate.platform !== expectedPlatform) {
      throw new Error(`Expected ${expectedPlatform} registry but received ${candidate.platform}`);
    }
    if (!isPlainObject(candidate.source) || !hasText(candidate.source.shop) || !isValidDate(candidate.source.captureDate)) {
      throw new Error('Marketplace registry source must contain a shop and valid captureDate');
    }
    if (!Array.isArray(candidate.products) || !Array.isArray(candidate.skuRows) || !Array.isArray(candidate.productsWithoutAnySellerSku)) {
      throw new Error('Marketplace registry products, skuRows, and productsWithoutAnySellerSku must be arrays');
    }
    if (!isPlainObject(candidate.summary)) throw new Error('Marketplace registry summary is required');

    const platform = candidate.platform;
    const idField = idFieldFor(platform);
    const nameField = nameFieldFor(platform);
    const productsById = new Map();

    candidate.products.forEach((product, index) => {
      if (!isPlainObject(product)) throw new Error(`products[${index}] must be an object`);
      if (product.platform !== platform) throw new Error(`products[${index}].platform does not match registry platform`);
      const id = product[idField];
      if (!hasText(id)) throw new Error(`products[${index}].${idField} is required`);
      if (!hasText(product[nameField])) throw new Error(`products[${index}].${nameField} is required`);
      if (!Array.isArray(product.variants)) throw new Error(`products[${index}].variants must be an array`);
      if (productsById.has(id)) throw new Error(`Duplicate ${idField}: ${id}`);
      productsById.set(id, product);
    });

    const rowKeys = new Set();
    const modelIds = new Set();
    let sellerSkuPresentRowCount = 0;
    let sellerSkuMissingInRowsCount = 0;
    candidate.skuRows.forEach((row, index) => {
      if (!isPlainObject(row)) throw new Error(`skuRows[${index}] must be an object`);
      if (row.platform !== platform) throw new Error(`skuRows[${index}].platform does not match registry platform`);
      const productId = row[idField];
      if (!hasText(productId) || !productsById.has(productId)) {
        throw new Error(`skuRows[${index}] references an unknown ${idField}`);
      }
      if (row.sellerSku != null && typeof row.sellerSku !== 'string') {
        throw new Error(`skuRows[${index}].sellerSku must be a string or null`);
      }
      const hasSku = hasText(row.sellerSku);
      if (row.sellerSkuStatus !== (hasSku ? 'present' : 'not_displayed')) {
        throw new Error(`skuRows[${index}].sellerSkuStatus conflicts with sellerSku`);
      }

      let rowKey;
      if (platform === 'SHOPEE') {
        if (row.sourceRowType !== 'variant' || !hasText(row.modelId)) {
          throw new Error(`skuRows[${index}] must include a Shopee modelId`);
        }
        if (modelIds.has(row.modelId)) throw new Error(`Duplicate Shopee modelId: ${row.modelId}`);
        modelIds.add(row.modelId);
        rowKey = `SHOPEE:${row.modelId}`;
      } else if (row.sourceRowType === 'variant') {
        if (!Number.isInteger(row.variantOrdinal) || row.variantOrdinal < 1) {
          throw new Error(`skuRows[${index}] TikTok variantOrdinal must be a positive integer`);
        }
        rowKey = `TIKTOK:${productId}:variant:${row.variantOrdinal}`;
      } else if (row.sourceRowType === 'product_sku') {
        rowKey = `TIKTOK:${productId}:product_sku`;
      } else {
        throw new Error(`skuRows[${index}] has an unsupported sourceRowType`);
      }
      if (rowKeys.has(rowKey)) throw new Error(`Duplicate marketplace SKU row: ${rowKey}`);
      rowKeys.add(rowKey);
      if (hasSku) sellerSkuPresentRowCount += 1;
      else sellerSkuMissingInRowsCount += 1;
    });

    const productsWithoutSkuIds = new Set(candidate.productsWithoutAnySellerSku.map((product, index) => {
      if (!isPlainObject(product) || !hasText(product[idField])) {
        throw new Error(`productsWithoutAnySellerSku[${index}].${idField} is required`);
      }
      return product[idField];
    }));
    const computedWithoutSkuIds = new Set(candidate.products
      .filter(product => !hasText(product.sellerSku) && !product.variants.some(variant => hasText(variant.sellerSku)))
      .map(product => product[idField]));
    if (productsWithoutSkuIds.size !== candidate.productsWithoutAnySellerSku.length) {
      throw new Error('productsWithoutAnySellerSku contains duplicate product IDs');
    }
    if (productsWithoutSkuIds.size !== computedWithoutSkuIds.size ||
        Array.from(productsWithoutSkuIds).some(id => !computedWithoutSkuIds.has(id))) {
      throw new Error('productsWithoutAnySellerSku does not match product details');
    }

    const summary = candidate.summary;
    const productCount = candidate.products.length;
    if (summary.listedProductCount !== productCount ||
        summary.uniqueProductIdCount !== productsById.size ||
        summary.skuModelRowCount !== candidate.skuRows.length ||
        summary.sellerSkuPresentRowCount !== sellerSkuPresentRowCount ||
        summary.sellerSkuMissingInRowsCount !== sellerSkuMissingInRowsCount ||
        summary.productsWithoutAnySellerSkuCount !== productsWithoutSkuIds.size) {
      throw new Error('Marketplace registry summary does not match its rows');
    }
    if (!Array.isArray(candidate.pages) ||
        candidate.pages.reduce((sum, page) => sum + (isPlainObject(page) && Number.isInteger(page.products) ? page.products : 0), 0) !== productCount) {
      throw new Error('Marketplace registry page totals do not match product count');
    }

    return cloneJson(candidate);
  };

  const validateStore = (candidate) => {
    if (!isPlainObject(candidate)) throw new Error('Marketplace registry store must be an object');
    if (candidate.schema !== SCHEMA) throw new Error(`Unsupported marketplace registry store schema: expected ${SCHEMA}`);
    if (candidate.version !== VERSION) throw new Error(`Unsupported marketplace registry store version: expected ${VERSION}`);
    if (!isValidDate(candidate.updatedAt)) throw new Error('Marketplace registry store updatedAt must be a valid date');
    if (!isPlainObject(candidate.platforms)) throw new Error('Marketplace registry store platforms must be an object');
    for (const platform of Object.keys(candidate.platforms)) {
      if (!PLATFORMS.includes(platform)) throw new Error(`Unsupported marketplace registry platform: ${platform}`);
      const registry = validatePlatformRegistry(candidate.platforms[platform], platform);
      if (registry.platform !== platform) throw new Error('Marketplace registry platform key mismatch');
    }
    return cloneJson(candidate);
  };

  const replacePlatformRegistry = (currentStore, sourceRegistry, now = new Date()) => {
    const store = currentStore == null ? createEmptyStore(now) : validateStore(currentStore);
    const registry = validatePlatformRegistry(sourceRegistry);
    const existing = store.platforms[registry.platform];
    if (existing && new Date(existing.source.captureDate).getTime() > new Date(registry.source.captureDate).getTime()) {
      throw new Error(`Refusing to replace newer ${registry.platform} registry data with an older snapshot`);
    }
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid marketplace registry update date');
    return validateStore({
      ...store,
      updatedAt: date.toISOString(),
      platforms: { ...store.platforms, [registry.platform]: registry }
    });
  };

  const loadStore = (storage, key = STORAGE_KEY) => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return { store: createEmptyStore(), error: null };
      return { store: validateStore(JSON.parse(raw)), error: null };
    } catch (error) {
      return { store: createEmptyStore(), error: error && error.message ? error.message : 'Marketplace registry could not be read' };
    }
  };

  const saveStore = (storage, candidate, key = STORAGE_KEY) => {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Browser storage is unavailable');
    const store = validateStore(candidate);
    storage.setItem(key, JSON.stringify(store));
    return store;
  };

  const getSummary = (storeCandidate) => {
    const store = validateStore(storeCandidate);
    return PLATFORMS.reduce((summary, platform) => {
      const registry = store.platforms[platform];
      summary[platform] = registry ? {
        productCount: registry.summary.listedProductCount,
        skuRowCount: registry.summary.skuModelRowCount,
        sellerSkuPresentCount: registry.summary.sellerSkuPresentRowCount,
        sellerSkuMissingCount: registry.summary.sellerSkuMissingInRowsCount,
        productsWithoutAnySellerSkuCount: registry.summary.productsWithoutAnySellerSkuCount,
        captureDate: registry.source.captureDate,
        shop: registry.source.shop
      } : {
        productCount: 0,
        skuRowCount: 0,
        sellerSkuPresentCount: 0,
        sellerSkuMissingCount: 0,
        productsWithoutAnySellerSkuCount: 0,
        captureDate: null,
        shop: null
      };
      return summary;
    }, {});
  };

  return {
    SCHEMA,
    VERSION,
    STORAGE_KEY,
    PLATFORMS,
    createEmptyStore,
    validatePlatformRegistry,
    validateStore,
    replacePlatformRegistry,
    loadStore,
    saveStore,
    getSummary
  };
});
