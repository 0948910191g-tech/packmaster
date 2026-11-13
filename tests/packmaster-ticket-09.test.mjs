import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const bootstrap = require('../packmaster-local-registry-bootstrap.js');
const matcher = require('../packmaster-registry-matcher.js');
const identity = require('../packmaster-registry-identity.js');
const registryApi = require('../packmaster-marketplace-registry.js');
const crossTab = require('../packmaster-cross-tab.js');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function createTestRegistry(platform, products) {
  const skuRows = products.flatMap(p => {
    if (!p.variants || !p.variants.length) {
      return [{
        platform, productId: p.productId, productName: p.productName,
        sellerSku: p.sellerSku || null, sellerSkuStatus: p.sellerSku ? 'present' : 'not_displayed',
        modelId: null, variantName: null, sourceRowType: 'product_sku'
      }];
    }
    return p.variants.map((v, i) => ({
      platform, productId: p.productId, productName: p.productName,
      sellerSku: v.sellerSku || p.sellerSku || null,
      sellerSkuStatus: (v.sellerSku || p.sellerSku) ? 'present' : 'not_displayed',
      modelId: v.modelId || null, variantName: v.variantName || null,
      sourceRowType: 'variant', variantOrdinal: i + 1
    }));
  });

  const productsWithoutAnySellerSku = products
    .filter(p => !p.sellerSku && (!p.variants || !p.variants.some(v => v.sellerSku)))
    .map(p => ({ productId: p.productId, productName: p.productName }));

  const store = registryApi.replacePlatformRegistry(
    registryApi.createEmptyStore(),
    {
      schemaVersion: 1,
      registryType: 'marketplace_product_sku_source_registry',
      platform,
      source: { shop: 'test', captureDate: '2026-11-13' },
      products: products.map(p => ({
        platform,
        productId: p.productId,
        productName: p.productName,
        sellerSku: p.sellerSku || null,
        variants: p.variants || []
      })),
      skuRows,
      productsWithoutAnySellerSku,
      pages: [{ products: products.length }],
      summary: {
        listedProductCount: products.length,
        uniqueProductIdCount: products.length,
        skuModelRowCount: skuRows.length,
        sellerSkuPresentRowCount: skuRows.filter(r => r.sellerSkuStatus === 'present').length,
        sellerSkuMissingInRowsCount: skuRows.filter(r => r.sellerSkuStatus !== 'present').length,
        productsWithoutAnySellerSkuCount: productsWithoutAnySellerSku.length
      }
    }
  );
  return store;
}

// 1. ensureRegistryAssignments with { preserveUserEntries: true } preserves user custom names and aliases
test('ensureRegistryAssignments with preserveUserEntries: true preserves user custom names and aliases', () => {
  const store = createTestRegistry('TIKTOK', [
    {
      productId: 'p-user',
      productName: 'ผ้าเช็ดทำความสะอาด ราคาส่ง 80 แผ่นพรีเมียมพิเศษสำหรับเด็ก',
      variants: [
        { modelId: 'v1', variantName: 'Red', sellerSku: 'SKU-SAME' },
        { modelId: 'v2', variantName: 'Blue', sellerSku: 'SKU-LONG' },
        { modelId: 'v3', variantName: 'Green', sellerSku: 'SKU-WORDS' },
        { modelId: 'v4', variantName: 'Yellow', sellerSku: 'SKU-ALIAS' }
      ]
    }
  ]);

  const index = identity.buildIndex(store, registryApi);
  const row4 = store.platforms.TIKTOK.skuRows[3];
  const base = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), index, 'TIKTOK',
    { text: 'ผ้าเช็ดทำความสะอาด ราคาส่ง 80 แผ่นพรีเมียมพิเศษสำหรับเด็ก | Yellow | SKU-ALIAS', sellerSku: 'SKU-ALIAS' },
    row4, 'ชื่อ มี Alias', identity, { confirmedExplicitTarget: true }
  );

  const userAssignments = matcher.validateAssignments({
    ...base,
    entries: [
      ...base.entries,
      // Entry 1: shortName matches sellerSku (defaultName)
      {
        platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'SKU-SAME',
        productId: 'p-user', modelId: 'v1', variantName: 'Red', shortName: 'SKU-SAME'
      },
      // Entry 2: shortName.length > 40 (45 chars)
      {
        platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'SKU-LONG',
        productId: 'p-user', modelId: 'v2', variantName: 'Blue',
        shortName: 'ชื่อยาวมากเป็นพิเศษเกินสี่สิบตัวอักษรแน่นอนหนึ่งสองสาม'
      },
      // Entry 3: shortName contains SYNTHETIC_MARKETING_PATTERN words
      {
        platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'SKU-WORDS',
        productId: 'p-user', modelId: 'v3', variantName: 'Green',
        shortName: 'ผ้าเช็ดทำความสะอาด ราคาส่ง'
      }
    ]
  });

  assert.equal(userAssignments.entries.length, 4, 'must have 4 initial user entries');

  // Calling ensureRegistryAssignments with preserveUserEntries: true must retain all 4 entries
  const preserved = bootstrap.ensureRegistryAssignments(
    store, userAssignments, registryApi, matcher, identity, null, { preserveUserEntries: true }
  );

  // All 4 user entries must be present
  assert.ok(preserved.entries.some(e => e.shortName === 'SKU-SAME'), 'user SKU-SAME must survive');
  assert.ok(preserved.entries.some(e => e.shortName === 'ชื่อยาวมากเป็นพิเศษเกินสี่สิบตัวอักษรแน่นอนหนึ่งสองสาม'), 'user length>40 must survive');
  assert.ok(preserved.entries.some(e => e.shortName === 'ผ้าเช็ดทำความสะอาด ราคาส่ง'), 'user marketing words must survive');
  assert.ok(preserved.entries.some(e => e.shortName === 'ชื่อ มี Alias' && e.manualSkuAliases?.length > 0), 'user alias must survive');
  // Plus catalog_row promoted to seller_sku
  assert.ok(preserved.entries.some(e => e.shortName === 'ชื่อ มี Alias' && e.identityType === 'seller_sku'), 'promoted seller_sku exists');

  // Default mode without preserveUserEntries purges synthetic but still preserves manualSkuAliases
  const defaultMode = bootstrap.ensureRegistryAssignments(
    store, userAssignments, registryApi, matcher, identity, null
  );
  assert.ok(defaultMode.entries.some(e => e.shortName === 'ชื่อ มี Alias' && e.manualSkuAliases?.length > 0),
    'default mode must still preserve entries with manualSkuAliases');
});

// 2. index.html static check: handleMarketplaceRegistryImport uses preserveUserEntries and atomic rollback
test('index.html handleMarketplaceRegistryImport uses preserveUserEntries and snapshots keys before write', () => {
  const importSlice = html.slice(html.indexOf('const handleMarketplaceRegistryImport'), html.indexOf('const handleWorkspaceBackup'));
  assert.match(importSlice, /preserveUserEntries:\s*true/);
  assert.match(importSlice, /marketplaceRegistryApi\.STORAGE_KEY/);
  assert.match(importSlice, /registryMatcherApi\.LOCAL_ASSIGNMENTS_KEY/);
});

// Helper to create VM context for handleMarketplaceRegistryImport
function createImportVmContext(overrides = {}) {
  const memory = new Map();
  const storage = {
    getItem: k => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: k => memory.delete(k)
  };

  const context = {
    cloudMode: false,
    cloudRegistryLoaded: true,
    registryAssignmentsError: '',
    marketplaceRegistryApi: registryApi,
    registryMatcherApi: matcher,
    registryIdentityApi: identity,
    localRegistryBootstrapApi: bootstrap,
    crossTabApi: crossTab,
    marketplaceRegistry: null,
    marketplaceRegistryLoadError: '',
    marketplaceRegistryBusy: false,
    setMarketplaceRegistryBusy: () => {},
    registryAssignmentsLoaded: true,
    setRegistryAssignmentsLoaded: () => {},
    registryAssignments: null,
    setRegistryAssignments: (next) => { context.registryAssignments = next; },
    setMarketplaceRegistry: (next) => { context.marketplaceRegistry = next; },
    setMarketplaceRegistryLoadError: () => {},
    setMarketplaceRegistrySearch: () => {},
    setMarketplaceRegistryPage: () => {},
    showToast: () => {},
    baselineAssignmentsRef: { current: null },
    window: {
      localStorage: storage,
      confirm: () => true
    },
    console,
    ...overrides
  };
  vm.createContext(context);
  return { context, storage, memory };
}

function runImportSlice(context, event, platform) {
  const script = html.slice(html.indexOf('const rereadLocalNamingState ='), html.indexOf('const persistRegistryAssignmentEvidence =')) +
    '\n' +
    html.slice(html.indexOf('const handleMarketplaceRegistryImport ='), html.indexOf('const handleWorkspaceBackup =')) +
    `\nreturn handleMarketplaceRegistryImport(event, ${JSON.stringify(platform)});`;
  const fn = new vm.Script(`(async (event) => {\n${script}\n})`);
  return fn.runInContext(context)(event);
}

// 3. VM runtime test: handleMarketplaceRegistryImport preserves custom names and aliases into localStorage
test('VM: handleMarketplaceRegistryImport preserves custom names and aliases in localStorage', async () => {
  const store = createTestRegistry('TIKTOK', [
    {
      productId: 'p-1', productName: 'สินค้าทดสอบ',
      variants: [{ modelId: 'v1', sellerSku: 'SKU-CUSTOM', variantName: 'Red' }]
    }
  ]);
  const index = identity.buildIndex(store, registryApi);
  const row = store.platforms.TIKTOK.skuRows[0];
  const initial = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), index, 'TIKTOK',
    { text: 'สินค้าทดสอบ | Red | SKU-CUSTOM', sellerSku: 'SKU-CUSTOM' },
    row, 'ชื่อกำหนดเองพิเศษ', identity, { confirmedExplicitTarget: true }
  );

  const { context, storage } = createImportVmContext({
    marketplaceRegistry: store,
    registryAssignments: initial
  });
  matcher.saveLocalAssignments(storage, initial);
  registryApi.saveStore(storage, store);

  // New registry file with an additional variant
  const updatedStore = createTestRegistry('TIKTOK', [
    {
      productId: 'p-1', productName: 'สินค้าทดสอบ',
      variants: [
        { modelId: 'v1', sellerSku: 'SKU-CUSTOM', variantName: 'Red' },
        { modelId: 'v2', sellerSku: 'SKU-NEW', variantName: 'Blue' }
      ]
    }
  ]);
  const rawFileJson = JSON.stringify(updatedStore.platforms.TIKTOK);
  const event = {
    target: {
      files: [{ name: 'tiktok.json', text: async () => rawFileJson }],
      value: 'tiktok.json'
    }
  };

  await runImportSlice(context, event, 'TIKTOK');

  const reloadedAssignments = matcher.loadLocalAssignments(storage);
  assert.ok(reloadedAssignments.entries.some(e => e.shortName === 'ชื่อกำหนดเองพิเศษ'),
    'user custom short name must survive import and be saved to storage');
  const { store: reloadedStore } = registryApi.loadStore(storage);
  assert.equal(reloadedStore.platforms.TIKTOK.skuRows.length, 2, 'registry store must have 2 rows');
});

// 4. VM runtime test: atomic rollback on write failure
test('VM: handleMarketplaceRegistryImport rolls back localStorage if storage write fails', async () => {
  const prevRegistry = createTestRegistry('TIKTOK', [
    { productId: 'p-old', productName: 'Old Product', variants: [{ modelId: 'v1', sellerSku: 'OLD-SKU' }] }
  ]);
  const prevAssignments = matcher.validateAssignments({
    ...matcher.newAssignments(),
    entries: [{
      platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'OLD-SKU',
      productId: 'p-old', modelId: 'v1', variantName: null, shortName: 'ชื่อเดิม'
    }]
  });

  const { context, storage, memory } = createImportVmContext({
    marketplaceRegistry: prevRegistry,
    registryAssignments: prevAssignments
  });
  registryApi.saveStore(storage, prevRegistry);
  matcher.saveLocalAssignments(storage, prevAssignments);

  const prevRawRegistry = memory.get(registryApi.STORAGE_KEY);
  const prevRawAssignments = memory.get(matcher.LOCAL_ASSIGNMENTS_KEY);

  // Simulate QuotaExceededError when saveLocalAssignments is called
  const originalSetItem = storage.setItem;
  storage.setItem = (k, v) => {
    if (k === matcher.LOCAL_ASSIGNMENTS_KEY) {
      throw new Error('QuotaExceededError: LocalStorage quota exceeded');
    }
    originalSetItem(k, v);
  };

  const newRegistry = createTestRegistry('TIKTOK', [
    { productId: 'p-new', productName: 'New Product', variants: [{ modelId: 'v2', sellerSku: 'NEW-SKU' }] }
  ]);
  const event = {
    target: {
      files: [{ name: 'tiktok.json', text: async () => JSON.stringify(newRegistry.platforms.TIKTOK) }],
      value: 'tiktok.json'
    }
  };

  await runImportSlice(context, event, 'TIKTOK');

  // Both localStorage keys must be rolled back to their exact previous state
  assert.equal(memory.get(registryApi.STORAGE_KEY), prevRawRegistry, 'registry storage must be rolled back');
  assert.equal(memory.get(matcher.LOCAL_ASSIGNMENTS_KEY), prevRawAssignments, 'assignments storage must be rolled back');
  // React state for assignments should not have been updated to partial state
  assert.deepEqual(context.registryAssignments, prevAssignments, 'React state should not be mutated');
});

// 5. VM runtime test: corrupt local assignments or corrupt registry aborts import safely
test('VM: handleMarketplaceRegistryImport aborts on corrupt local assignments or cancel rebuild', async () => {
  // Case A: registryAssignmentsError is set -> refuses to import
  {
    const prevStore = createTestRegistry('TIKTOK', [
      { productId: 'p-1', productName: 'Prod 1', variants: [{ modelId: 'v1', sellerSku: 'SKU-1' }] }
    ]);
    const { context, storage, memory } = createImportVmContext({
      marketplaceRegistry: prevStore,
      registryAssignmentsError: 'ข้อมูลชื่อทะเบียนเสียหาย'
    });
    registryApi.saveStore(storage, prevStore);
    const prevRawStore = memory.get(registryApi.STORAGE_KEY);

    const event = {
      target: {
        files: [{ name: 'tiktok.json', text: async () => JSON.stringify(prevStore.platforms.TIKTOK) }],
        value: 'tiktok.json'
      }
    };

    let toastMsg = '';
    context.showToast = (msg, type) => { if (type === 'error') toastMsg = msg; };

    await runImportSlice(context, event, 'TIKTOK');

    assert.match(toastMsg, /ข้อมูลชื่อทะเบียน Local อ่านไม่ครบ/);
    assert.equal(memory.get(registryApi.STORAGE_KEY), prevRawStore, 'storage must be untouched');
  }

  // Case B: marketplaceRegistryLoadError is set and user cancels rebuild prompt -> writes nothing
  {
    let confirmPrompted = false;
    const { context, memory } = createImportVmContext({
      marketplaceRegistryLoadError: 'ทะเบียนเดิมเสียหาย',
      window: {
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        confirm: (msg) => { confirmPrompted = true; return false; } // User clicks Cancel
      }
    });

    const dummyRegistry = createTestRegistry('TIKTOK', [
      { productId: 'p-1', productName: 'Prod 1', variants: [{ modelId: 'v1', sellerSku: 'SKU-1' }] }
    ]);
    const event = {
      target: {
        files: [{ name: 'tiktok.json', text: async () => JSON.stringify(dummyRegistry.platforms.TIKTOK) }],
        value: 'tiktok.json'
      }
    };

    await runImportSlice(context, event, 'TIKTOK');

    assert.equal(confirmPrompted, true, 'must prompt user for rebuild confirmation');
    assert.equal(memory.size, 0, 'must not write anything when rebuild is cancelled');
  }
});
