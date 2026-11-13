(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterLocalRegistryBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REGISTRY_URL = './data/packmaster-marketplace-registry.json';
  const ASSIGNMENTS_URL = './data/packmaster-registry-assignments.json';

  const REGISTRY_BRAND_CATEGORIES = [
    { id: 'HOYA_BABY', label: 'HOYA Baby' },
    { id: 'HAKU_BABY', label: 'HAKU Baby' },
    { id: 'EXCARE', label: 'EXCARE' },
    { id: 'NONO', label: 'NONO' },
    { id: 'HOYA_OTHER', label: 'HOYA อื่นๆ' },
    { id: 'OTHER', label: 'สินค้าอื่นๆ' }
  ];

  function getRegistryBrandCategory(row) {
    const text = [row?.sellerSku, row?.productName, row?.title, row?.variantName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (text.includes('nono') || text.includes('โนโน่')) return 'NONO';
    if (text.includes('excare') || text.includes('เอ็กซ์แคร์')) return 'EXCARE';
    if (text.includes('haku') || text.includes('ฮากุ')) return 'HAKU_BABY';
    if (text.includes('hoya') || text.includes('โฮญ่า')) {
      const babyKeys = ['baby', 'เบบี้', 'bb', 'value pack', 'ม่วง', 'ชมพู', '80แผ่น', '400 แผ่น', 'สูตรมีกลิ่น', 'สูตรไม่มีกลิ่น'];
      if (babyKeys.some(k => text.includes(k))) return 'HOYA_BABY';
      return 'HOYA_OTHER';
    }
    return 'OTHER';
  }

  const timestamp = value => {
    const time = Date.parse(value || '');
    return Number.isNaN(time) ? 0 : time;
  };

  const trimName = value => String(value || '').trim().slice(0, 150);

  const SYNTHETIC_MARKETING_PATTERN = /\(\s*ราคาส่ง|ราคาส่งยกลัง|ผ้าเช็ดทำความสะอาด|Official Jersey|เสื้อเบสบอล|Everyday Care 24\/7/i;

  function isSyntheticAssignmentEntry(entry, rowInfo) {
    const name = String(entry?.shortName || '');
    if (name.length > 40 || SYNTHETIC_MARKETING_PATTERN.test(name)) return true;
    if (!rowInfo) return false;
    return name === rowInfo.defaultName || Boolean(rowInfo.productName && name === rowInfo.productName);
  }

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
      version: Math.max(local.version, baseline.version),
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

  function ensureRegistryAssignments(registryCandidate, assignmentsCandidate, registryApi, matcherApi, identityApi, baselineCandidate, options = {}) {
    if (!registryApi || !matcherApi || !identityApi) {
      throw new Error('Registry APIs are required');
    }
    const registry = registryApi.validateStore(registryCandidate);
    let assignments = matcherApi.validateAssignments(assignmentsCandidate);
    const index = identityApi.buildIndex(registry, registryApi);

    // Collect catalog row records and build rowMap in a single pass
    const catalogRowRecords = [];
    const rowMap = new Map();

    for (const platform of registryApi.PLATFORMS) {
      const platformRegistry = registry.platforms[platform];
      const rows = typeof registryApi.getNameableRows === 'function'
        ? registryApi.getNameableRows(platformRegistry, platform)
        : (platformRegistry?.skuRows || []);
      for (const row of rows) {
        const evidence = getRowEvidence(platform, row, index, matcherApi);
        if (!evidence) continue;

        const probe = matcherApi.makeAssignment(platform, evidence, 'probe');
        const rowKey = matcherApi.assignmentKey(probe);
        const catalogKey = matcherApi.assignmentKey({
          platform,
          identityType: 'catalog_row',
          sellerSku: null,
          productId: evidence.candidate.productId,
          modelId: evidence.candidate.modelId || null,
          variantName: evidence.candidate.variantName || null
        });

        const info = {
          defaultName: defaultInternalName(row, evidence),
          productName: trimName(row?.productName || row?.title),
          catalogKey
        };
        rowMap.set(rowKey, info);
        if (catalogKey && !rowMap.has(catalogKey)) {
          rowMap.set(catalogKey, info);
        }

        catalogRowRecords.push({
          platform,
          row,
          evidence,
          rowKey,
          catalogKey,
          info
        });
      }
    }

    // Build a set of baseline assignmentKeys if baselineCandidate?.entries is provided
    const baselineKeys = new Set(
      Array.isArray(baselineCandidate?.entries)
        ? baselineCandidate.entries.map(e => matcherApi.assignmentKey(e))
        : []
    );

    // Identify verified catalog_row entries
    const verifiedCatalogKeys = new Set();
    if (Array.isArray(baselineCandidate?.entries)) {
      for (const entry of baselineCandidate.entries) {
        if (entry.identityType === 'catalog_row') {
          verifiedCatalogKeys.add(matcherApi.assignmentKey(entry));
        }
      }
    } else {
      for (const entry of assignments.entries) {
        if (entry.identityType === 'catalog_row') {
          const entryKey = matcherApi.assignmentKey(entry);
          const info = rowMap.get(entryKey);
          if (options?.preserveUserEntries || !isSyntheticAssignmentEntry(entry, info)) {
            verifiedCatalogKeys.add(entryKey);
          }
        }
      }
    }

    // Identify keys promoted from verified catalog_row entries
    const promotedKeys = new Set();
    for (const record of catalogRowRecords) {
      if (record.evidence.identityType !== 'seller_sku') continue;
      if (verifiedCatalogKeys.has(record.catalogKey)) {
        promotedKeys.add(record.rowKey);
      }
    }

    // Filter assignments.entries to purge legacy synthetic auto-generated entries
    const filteredEntries = assignments.entries.filter(entry => {
      if (options?.preserveUserEntries) return true;
      if (Array.isArray(entry.manualSkuAliases) && entry.manualSkuAliases.length > 0) return true;
      const key = matcherApi.assignmentKey(entry);
      if (baselineKeys.has(key)) return true;
      if (promotedKeys.has(key)) return true;

      const rowInfo = rowMap.get(key);
      return !isSyntheticAssignmentEntry(entry, rowInfo);
    });

    assignments = matcherApi.validateAssignments({
      ...assignments,
      entries: filteredEntries
    });

    // Iterate over catalog row records: promote existingCatalog.shortName to seller_sku when applicable
    for (const record of catalogRowRecords) {
      if (assignments.entries.some(entry => matcherApi.assignmentKey(entry) === record.rowKey)) continue;

      let shortName = '';
      if (record.evidence.identityType === 'seller_sku') {
        const existingCatalog = assignments.entries.find(entry => matcherApi.assignmentKey(entry) === record.catalogKey);
        if (existingCatalog && existingCatalog.shortName) {
          shortName = existingCatalog.shortName;
        }
      }
      if (!shortName) continue;
      assignments = matcherApi.upsertAssignment(assignments, record.platform, record.evidence, shortName, { resolveConflict: true });
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

  function loadLocalStartupSnapshot(storage, { registryApi, matcherApi, sanitizeSkuRule }) {
    if (!storage || !registryApi || !matcherApi || typeof sanitizeSkuRule !== 'function') {
      return {
        marketplaceRegistry: { store: null, error: 'Local storage modules are unavailable; existing data was not changed' },
        registryAssignments: null,
        registryAssignmentsError: 'โมดูลตรวจข้อมูลชื่อภายในไม่พร้อม ข้อมูลเดิมยังไม่ถูกแก้ไข',
        skuRules: null,
        skuRulesError: 'โมดูลตรวจข้อมูล Local ไม่พร้อม ข้อมูลเดิมยังไม่ถูกแก้ไข',
        canPersistSkuRules: false
      };
    }

    const marketplaceRegistry = registryApi.loadStore(storage);
    let registryAssignments = null;
    let registryAssignmentsError = '';
    try {
      registryAssignments = matcherApi.loadLocalAssignments(storage);
    } catch (error) {
      registryAssignmentsError = 'ข้อมูลชื่อภายในตามทะเบียนอ่านไม่ได้ กรุณากู้ข้อมูลจาก Backup';
    }

    let skuRules = null;
    let skuRulesError = '';
    try {
      const raw = storage.getItem('skuMappingRules');
      if (raw === null) {
        skuRules = [];
      } else {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('Saved SKU rules must be an array');
        const cleaned = parsed.map((rule, index) => sanitizeSkuRule(rule, `saved-${index}`));
        if (cleaned.some(rule => !rule)) throw new Error('Saved SKU rules contain invalid entries');
        skuRules = cleaned;
      }
    } catch (error) {
      skuRulesError = 'ข้อมูลกฎ SKU ในเครื่องอ่านไม่ได้ กรุณาสำรองและกู้คืนข้อมูลก่อนแก้ไข';
    }

    return {
      marketplaceRegistry,
      registryAssignments,
      registryAssignmentsError,
      skuRules,
      skuRulesError,
      canPersistSkuRules: !skuRulesError
    };
  }

  function getRegistryBrand(row) {
    const text = `${row?.productName || ''} ${row?.title || ''}`.toLowerCase();
    if (/\bhoya\b/i.test(text)) return 'HOYA';
    if (/\bhaku\b/i.test(text)) return 'HAKU';
    if (/\bexcare\b/i.test(text)) return 'Excare';
    if (/\bnono\b/i.test(text)) return 'nono';
    return 'other';
  }

  function filterRegistryNameRows(rows, { platform, query = '', brand = 'all', status = 'all', statusMatch = () => true } = {}) {
    const normalizedQuery = String(query).trim().toLowerCase();
    return (Array.isArray(rows) ? rows : []).filter(row => {
      if (platform && row.platform !== platform) return false;
      if (brand !== 'all' && getRegistryBrand(row) !== brand) return false;
      if (normalizedQuery && ![row.sellerSku, row.productName, row.title, row.variantName,
        row.productId, row.itemId, row.modelId].some(value =>
        String(value || '').toLowerCase().includes(normalizedQuery))) return false;
      return status === 'all' || statusMatch(row, status);
    });
  }

  function paginateRegistryRows(rows, requestedPage = 1, pageSize = 50) {
    const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 50;
    const pageCount = Math.max(1, Math.ceil(rows.length / safePageSize));
    const page = Math.min(pageCount, Math.max(1, Number.isInteger(requestedPage) ? requestedPage : 1));
    return {
      page,
      pageCount,
      rows: rows.slice((page - 1) * safePageSize, page * safePageSize)
    };
  }

  return {
    REGISTRY_URL,
    ASSIGNMENTS_URL,
    REGISTRY_BRAND_CATEGORIES,
    SYNTHETIC_MARKETING_PATTERN,
    isSyntheticAssignmentEntry,
    getRegistryBrandCategory,
    mergeRegistryBaseline,
    mergeAssignmentBaseline,
    getRowEvidence,
    defaultInternalName,
    ensureRegistryAssignments,
    loadBaselines,
    loadLocalStartupSnapshot,
    getRegistryBrand,
    filterRegistryNameRows,
    paginateRegistryRows
  };
});
