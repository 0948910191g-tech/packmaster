import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
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
  return identity.buildIndex(store, registryApi);
}

// 1. Confirming the 2nd variant of a duplicate Seller SKU in saveConfirmedAssignment
test('saveConfirmedAssignment does not write conflicting seller_sku entry when confirming variant of duplicate SKU', () => {
  const catalog = createTestRegistry('TIKTOK', [
    {
      productId: 'prod-shared',
      productName: 'HOYA Baby Wipes Shared',
      variants: [
        { modelId: 'm1', variantName: '1 ห่อ 80 แผ่น', sellerSku: 'SHARED-DUP-SKU' },
        { modelId: 'm2', variantName: '2 ห่อ 160 แผ่น', sellerSku: 'SHARED-DUP-SKU' }
      ]
    }
  ]);

  const candidate1 = {
    platform: 'TIKTOK',
    productId: 'prod-shared',
    productName: 'HOYA Baby Wipes Shared',
    modelId: 'm1',
    variantName: '1 ห่อ 80 แผ่น',
    sellerSku: 'SHARED-DUP-SKU'
  };

  const evidence1 = {
    status: 'found',
    identityType: 'catalog_row',
    sellerSku: 'SHARED-DUP-SKU',
    candidate: candidate1
  };

  let assignments = matcher.newAssignments();
  assignments = matcher.saveConfirmedAssignment(assignments, catalog, 'TIKTOK', evidence1, 'HOYA 1 ห่อ');

  const candidate2 = {
    platform: 'TIKTOK',
    productId: 'prod-shared',
    productName: 'HOYA Baby Wipes Shared',
    modelId: 'm2',
    variantName: '2 ห่อ 160 แผ่น',
    sellerSku: 'SHARED-DUP-SKU'
  };

  const evidence2 = {
    status: 'found',
    identityType: 'catalog_row',
    sellerSku: 'SHARED-DUP-SKU',
    candidate: candidate2
  };

  // Confirming 2nd variant of the duplicate SKU must succeed and not throw duplicate registry identity assignment
  assert.doesNotThrow(() => {
    assignments = matcher.saveConfirmedAssignment(assignments, catalog, 'TIKTOK', evidence2, 'HOYA 2 ห่อ');
  });

  const entry1 = assignments.entries.find(e => e.modelId === 'm1');
  const entry2 = assignments.entries.find(e => e.modelId === 'm2');
  assert.equal(entry1.shortName, 'HOYA 1 ห่อ');
  assert.equal(entry2.shortName, 'HOYA 2 ห่อ');
});

// 2. validateAssignments allows manualSkuAliases to share sellerSku with seller_sku entries
test('validateAssignments allows manualSkuAliases whose sellerSku matches an existing seller_sku assignment', () => {
  const valid = {
    schema: matcher.SCHEMA,
    version: 2,
    entries: [
      {
        platform: 'TIKTOK',
        identityType: 'seller_sku',
        sellerSku: 'COMMON-SKU',
        productId: 'prod-1',
        modelId: 'm1',
        variantName: 'Variant 1',
        shortName: 'Common Name'
      },
      {
        platform: 'TIKTOK',
        identityType: 'catalog_row',
        sellerSku: null,
        productId: 'prod-1',
        modelId: 'm2',
        variantName: 'Variant 2',
        shortName: 'Variant 2 Custom Name',
        manualSkuAliases: [
          { sellerSku: 'COMMON-SKU', productText: 'HOYA Wipe', variantText: 'Variant 2' }
        ],
        manualSkuRegistryProductName: 'HOYA Wipe Title'
      }
    ]
  };

  assert.doesNotThrow(() => {
    const verified = matcher.validateAssignments(valid);
    assert.equal(verified.entries.length, 2);
  });
});

// 3. upsertManualSkuAlias allows binding ambiguous / conflicting / duplicate-SKU items when confirmedExplicitTarget is true
test('upsertManualSkuAlias allows duplicate SKU and ambiguous items only when confirmedExplicitTarget is true', () => {
  const catalog = createTestRegistry('TIKTOK', [
    {
      productId: 'prod-dup',
      productName: 'HOYA Duplicate Prod',
      variants: [
        { modelId: 'm1', variantName: '3 ห่อ', sellerSku: 'DUP-SKU-99' },
        { modelId: 'm2', variantName: '6 ห่อ', sellerSku: 'DUP-SKU-99' }
      ]
    }
  ]);

  const sourceItem = {
    text: 'Other PDF Title | 6 ห่อ | DUP-SKU-99',
    sellerSku: 'DUP-SKU-99'
  };

  const selectedCandidate = {
    platform: 'TIKTOK',
    productId: 'prod-dup',
    modelId: 'm2',
    variantName: '6 ห่อ',
    productName: 'HOYA Duplicate Prod'
  };

  // Without confirmedExplicitTarget -> must throw
  assert.throws(
    () => matcher.upsertManualSkuAlias(matcher.newAssignments(), catalog, 'TIKTOK', sourceItem, selectedCandidate, 'HOYA 6 ห่อ', identity),
    /already exists in the registry|known Seller SKU/i
  );

  // With confirmedExplicitTarget: true -> must succeed
  let assignments;
  assert.doesNotThrow(() => {
    assignments = matcher.upsertManualSkuAlias(
      matcher.newAssignments(), catalog, 'TIKTOK', sourceItem, selectedCandidate, 'HOYA 6 ห่อ', identity,
      { confirmedExplicitTarget: true }
    );
  });
  assert.ok(assignments);
  assert.equal(assignments.entries.length, 1);
  assert.equal(assignments.entries[0].shortName, 'HOYA 6 ห่อ');
});

// 4. match() prioritizes explicit manualSkuAliases over ambiguous evidence
test('match() resolves duplicate/ambiguous Seller SKU item when explicit manualSkuAlias is saved', () => {
  const catalog = createTestRegistry('TIKTOK', [
    {
      productId: 'prod-dup',
      productName: 'HOYA Duplicate Prod',
      variants: [
        { modelId: 'm1', variantName: '3 ห่อ', sellerSku: 'DUP-SKU-99' },
        { modelId: 'm2', variantName: '6 ห่อ', sellerSku: 'DUP-SKU-99' }
      ]
    }
  ]);

  const sourceItem = {
    text: 'Other PDF Title | 6 ห่อ | DUP-SKU-99',
    sellerSku: 'DUP-SKU-99'
  };

  const selectedCandidate = {
    platform: 'TIKTOK',
    productId: 'prod-dup',
    modelId: 'm2',
    variantName: '6 ห่อ',
    productName: 'HOYA Duplicate Prod'
  };

  // Initially, before alias is saved, identity.resolve says ambiguous
  const unresolvedMatch = matcher.match(catalog, 'TIKTOK', sourceItem, matcher.newAssignments(), identity);
  assert.equal(unresolvedMatch.status, 'ambiguous');

  // Save manual alias
  const assignments = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), catalog, 'TIKTOK', sourceItem, selectedCandidate, 'HOYA 6 ห่อ', identity,
    { confirmedExplicitTarget: true }
  );

  // Now match() must return matched with registry_manual_alias_exact_verified!
  const matched = matcher.match(catalog, 'TIKTOK', sourceItem, assignments, identity);
  assert.equal(matched.status, 'matched');
  assert.equal(matched.reason, 'registry_manual_alias_exact_verified');
  assert.equal(matched.rule.shortName, 'HOYA 6 ห่อ');
  assert.equal(matched.assignment.modelId, 'm2');
});

// 5. upsertManualSkuAlias attaches registry_alias_title_changed code and currentProductName on stale alias title
test('upsertManualSkuAlias attaches registry_alias_title_changed code and currentProductName on title edit', () => {
  const originalCatalog = createTestRegistry('TIKTOK', [
    {
      productId: 'prod-title',
      productName: 'Original Title',
      variants: [{ modelId: 'm1', variantName: 'Red', sellerSku: 'ORIG-SKU' }]
    }
  ]);

  const sourceItem = { text: 'Original Title | Red | NEW-SKU', sellerSku: 'NEW-SKU' };
  const selectedOriginal = {
    platform: 'TIKTOK', productId: 'prod-title', modelId: 'm1', variantName: 'Red', productName: 'Original Title'
  };

  const assigned = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), originalCatalog, 'TIKTOK', sourceItem, selectedOriginal, 'Red Name', identity,
    { confirmedExplicitTarget: true }
  );

  // Rename product in registry
  const renamedCatalog = createTestRegistry('TIKTOK', [
    {
      productId: 'prod-title',
      productName: 'Edited New Title',
      variants: [{ modelId: 'm1', variantName: 'Red', sellerSku: 'ORIG-SKU' }]
    }
  ]);

  const selectedRenamed = {
    platform: 'TIKTOK', productId: 'prod-title', modelId: 'm1', variantName: 'Red', productName: 'Edited New Title'
  };

  try {
    matcher.upsertManualSkuAlias(assigned, renamedCatalog, 'TIKTOK', sourceItem, selectedRenamed, 'Red Name', identity, { confirmedExplicitTarget: true });
    assert.fail('should have thrown registry_alias_title_changed');
  } catch (err) {
    assert.equal(err.code, 'registry_alias_title_changed');
    assert.equal(err.currentProductName, 'Edited New Title');
    assert.ok(Array.isArray(err.previousProductNames));
    assert.ok(err.previousProductNames.includes('Original Title'));
  }

  // Passing confirmedRegistryProductName succeeds
  const updated = matcher.upsertManualSkuAlias(assigned, renamedCatalog, 'TIKTOK', sourceItem, selectedRenamed, 'Red Name', identity, {
    confirmedExplicitTarget: true,
    confirmedRegistryProductName: 'Edited New Title'
  });
  assert.equal(updated.entries[0].manualSkuRegistryProductName, 'Edited New Title');
});

// 6. Ambiguous no-SKU item bound via upsertManualSkuAlias matches on reload
test('ambiguous no-SKU item bound via upsertManualSkuAlias matches on reload', () => {
  const catalog = createTestRegistry('TIKTOK', [
    {
      productId: 'p1',
      productName: 'Baby Wipes Premium Pack',
      variants: [{ modelId: 'v1', variantName: 'White 80 sheets', sellerSku: null }]
    },
    {
      productId: 'p2',
      productName: 'Baby Wipes Premium Pack',
      variants: [{ modelId: 'v2', variantName: 'White 80 sheets', sellerSku: null }]
    }
  ]);

  const sourceItem = { text: 'Baby Wipes Premium Pack | White 80 sheets', qty: 1 };
  const evidence = identity.resolve(catalog, 'TIKTOK', sourceItem);
  assert.equal(evidence.status, 'ambiguous', 'must be ambiguous without unique product ID');
  assert.equal(evidence.reason, 'duplicate_catalog_text');

  const selectedRow = {
    platform: 'TIKTOK',
    productId: 'p1',
    modelId: 'v1',
    variantName: 'White 80 sheets',
    productName: 'Baby Wipes Premium Pack'
  };

  const saved = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), catalog, 'TIKTOK', sourceItem, selectedRow, 'ทิชชู่ขาวพรีเมียม', identity,
    { confirmedExplicitTarget: true }
  );

  const reloaded = matcher.validateAssignments(JSON.parse(JSON.stringify(saved)));
  const matched = matcher.match(catalog, 'TIKTOK', sourceItem, reloaded, identity);

  assert.equal(matched.status, 'matched');
  assert.equal(matched.reason, 'registry_manual_alias_exact_verified');
  assert.equal(matched.rule.shortName, 'ทิชชู่ขาวพรีเมียม');
  assert.equal(matched.assignment.modelId, 'v1');
});

// 7. index.html handleSaveQuickMapping static structure check
test('index.html handleSaveQuickMapping uses confirmedExplicitTarget and handles title edit re-bind', () => {
  const quickMapSlice = html.slice(html.indexOf('const handleSaveQuickMapping'), html.indexOf('const handleCreateLocalProduct'));
  assert.ok(!quickMapSlice.includes("if (latestEvidence.status === 'ambiguous') throw new Error('Seller SKU ซ้ำ"),
    'ambiguous check must not unconditionally reject in handleSaveQuickMapping');
  assert.match(quickMapSlice, /confirmedExplicitTarget:\s*true/);
  assert.match(quickMapSlice, /registry_alias_title_changed/);
});

// 8. Runtime VM test: duplicate SKU / ambiguous item permanent binding writes on confirm, writes nothing on cancel, and matches on reload
test('index.html handleSaveQuickMapping runtime: duplicate SKU / ambiguous item confirms and matches on reload, cancels without writing', async () => {
  const products = [
    { platform: 'TIKTOK', productId: 'p-dup', productName: 'Multi Pack Wipes', variants: [
      { modelId: 'v1', variantName: 'White 80 sheets', sellerSku: 'SYN-DUP-TEST' },
      { modelId: 'v2', variantName: 'Pink 80 sheets', sellerSku: 'SYN-DUP-TEST' }
    ]}
  ];
  const skuRows = [
    { platform: 'TIKTOK', productId: 'p-dup', productName: 'Multi Pack Wipes', sellerSku: 'SYN-DUP-TEST', sellerSkuStatus: 'present', modelId: 'v1', variantName: 'White 80 sheets', sourceRowType: 'variant', variantOrdinal: 1 },
    { platform: 'TIKTOK', productId: 'p-dup', productName: 'Multi Pack Wipes', sellerSku: 'SYN-DUP-TEST', sellerSkuStatus: 'present', modelId: 'v2', variantName: 'Pink 80 sheets', sourceRowType: 'variant', variantOrdinal: 2 }
  ];
  const store = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry', platform: 'TIKTOK',
    source: { shop: 'test', captureDate: '2026-11-13' },
    products, skuRows, productsWithoutAnySellerSku: [], pages: [{ products: 1 }],
    summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 2, sellerSkuPresentRowCount: 2, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
  });
  const index = identity.buildIndex(store, registryApi);
  const item = { text: 'Multi Pack Wipes | Pink 80 sheets | SYN-DUP-TEST', sellerSku: 'SYN-DUP-TEST', qty: 1 };
  const targetRow = skuRows[1];
  const key = (p, x) => JSON.stringify([p, String(x.productId || x.itemId || ''), x.modelId || null, x.variantName || null]);

  // Case A: User cancels confirm dialog -> writes nothing to localStorage
  {
    const memory = new Map();
    const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
    registryApi.saveStore(storage, store);
    const initialAssignments = matcher.newAssignments();
    matcher.saveLocalAssignments(storage, initialAssignments);

    const messages = [];
    let savedAssignments = initialAssignments;
    const context = {
      cloudMode: false, marketplaceRegistry: store, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignments: initialAssignments,
      getQuickMapRegistryRowKey: key, marketplaceCatalogIndex: index, canPersistQuickMap: true,
      quickMapSelectedRegistryRow: targetRow,
      quickMapState: { itemIndex: 0, shortName: 'ชมพู 80 แผ่น', selectedRegistryRowKey: key('TIKTOK', targetRow), row: { order: { platform: 'TIKTOK', parsedItems: [item] } } },
      window: { localStorage: storage, confirm: msg => { messages.push(msg); return false; } },
      setRegistryAssignments(next) { savedAssignments = next; context.registryAssignments = next; },
      advanceReviewItem() {}, showToast() {}
    };
    vm.createContext(context);
    const script = html.slice(html.indexOf('const rereadLocalNamingState ='), html.indexOf('const persistRegistryAssignmentEvidence =')) +
      html.slice(html.indexOf('const handleSaveQuickMapping ='), html.indexOf('const handleCreateLocalProduct =')) +
      '\nhandleSaveQuickMapping();';
    await vm.runInContext(script, context);

    assert.equal(messages.length, 1, 'must have prompted confirmation');
    assert.match(messages[0], /ยืนยันผูกชื่อถาวรใน Local/);
    assert.deepEqual(matcher.loadLocalAssignments(storage), initialAssignments, 'must not have written anything to localStorage');
  }

  // Case B: User accepts confirm dialog -> saves alias and matches on reload
  {
    const memory = new Map();
    const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
    registryApi.saveStore(storage, store);
    const initialAssignments = matcher.newAssignments();
    matcher.saveLocalAssignments(storage, initialAssignments);

    const messages = [];
    let savedAssignments = initialAssignments;
    const context = {
      cloudMode: false, marketplaceRegistry: store, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignments: initialAssignments,
      getQuickMapRegistryRowKey: key, marketplaceCatalogIndex: index, canPersistQuickMap: true,
      quickMapSelectedRegistryRow: targetRow,
      quickMapState: { itemIndex: 0, shortName: 'ชมพู 80 แผ่น', selectedRegistryRowKey: key('TIKTOK', targetRow), row: { order: { platform: 'TIKTOK', parsedItems: [item] } } },
      window: { localStorage: storage, confirm: msg => { messages.push(msg); return true; } },
      setRegistryAssignments(next) { savedAssignments = next; context.registryAssignments = next; },
      advanceReviewItem() {}, showToast() {}
    };
    vm.createContext(context);
    const script = html.slice(html.indexOf('const rereadLocalNamingState ='), html.indexOf('const persistRegistryAssignmentEvidence =')) +
      html.slice(html.indexOf('const handleSaveQuickMapping ='), html.indexOf('const handleCreateLocalProduct =')) +
      '\nhandleSaveQuickMapping();';
    await vm.runInContext(script, context);

    assert.equal(messages.length, 1);
    assert.match(messages[0], /คำเตือน/);
    const reloaded = matcher.loadLocalAssignments(storage);
    assert.equal(reloaded.entries.length, 1);
    assert.equal(reloaded.entries[0].manualSkuAliases?.length, 1);
    const matchResult = matcher.match(index, 'TIKTOK', item, reloaded, identity);
    assert.equal(matchResult.status, 'matched');
    assert.equal(matchResult.reason, 'registry_manual_alias_exact_verified');
    assert.equal(matchResult.rule.shortName, 'ชมพู 80 แผ่น');
  }
});

// 9. Runtime VM test: registry_alias_title_changed confirm dialog retries and re-binds on OK, writes nothing on cancel
test('index.html handleSaveQuickMapping runtime: registry_alias_title_changed confirms with old/new title on OK, writes nothing on cancel', async () => {
  const productsOld = [
    { platform: 'TIKTOK', productId: 'p-title', productName: 'Old Product Title', variants: [
      { modelId: 'v1', variantName: 'Red', sellerSku: 'SYN-DUP-TITLE' },
      { modelId: 'v2', variantName: 'Blue', sellerSku: 'SYN-DUP-TITLE' }
    ]}
  ];
  const skuRowsOld = [
    { platform: 'TIKTOK', productId: 'p-title', productName: 'Old Product Title', sellerSku: 'SYN-DUP-TITLE', sellerSkuStatus: 'present', modelId: 'v1', variantName: 'Red', sourceRowType: 'variant', variantOrdinal: 1 },
    { platform: 'TIKTOK', productId: 'p-title', productName: 'Old Product Title', sellerSku: 'SYN-DUP-TITLE', sellerSkuStatus: 'present', modelId: 'v2', variantName: 'Blue', sourceRowType: 'variant', variantOrdinal: 2 }
  ];
  const storeOld = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry', platform: 'TIKTOK',
    source: { shop: 'test', captureDate: '2026-11-13' },
    products: productsOld, skuRows: skuRowsOld, productsWithoutAnySellerSku: [], pages: [{ products: 1 }],
    summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 2, sellerSkuPresentRowCount: 2, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
  });
  const indexOld = identity.buildIndex(storeOld, registryApi);
  const item = { text: 'Old Product Title | Red | SYN-DUP-TITLE', sellerSku: 'SYN-DUP-TITLE', qty: 1 };
  const initialAssignments = matcher.upsertManualSkuAlias(matcher.newAssignments(), indexOld, 'TIKTOK', item, skuRowsOld[0], 'แดงดั้งเดิม', identity, { confirmedExplicitTarget: true });

  // Renamed store
  const productsNew = [
    { platform: 'TIKTOK', productId: 'p-title', productName: 'New Product Title', variants: [
      { modelId: 'v1', variantName: 'Red', sellerSku: 'SYN-DUP-TITLE' },
      { modelId: 'v2', variantName: 'Blue', sellerSku: 'SYN-DUP-TITLE' }
    ]}
  ];
  const skuRowsNew = [
    { platform: 'TIKTOK', productId: 'p-title', productName: 'New Product Title', sellerSku: 'SYN-DUP-TITLE', sellerSkuStatus: 'present', modelId: 'v1', variantName: 'Red', sourceRowType: 'variant', variantOrdinal: 1 },
    { platform: 'TIKTOK', productId: 'p-title', productName: 'New Product Title', sellerSku: 'SYN-DUP-TITLE', sellerSkuStatus: 'present', modelId: 'v2', variantName: 'Blue', sourceRowType: 'variant', variantOrdinal: 2 }
  ];
  const storeNew = registryApi.replacePlatformRegistry(registryApi.createEmptyStore(), {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry', platform: 'TIKTOK',
    source: { shop: 'test', captureDate: '2026-11-13' },
    products: productsNew, skuRows: skuRowsNew, productsWithoutAnySellerSku: [], pages: [{ products: 1 }],
    summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 2, sellerSkuPresentRowCount: 2, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
  });
  const indexNew = identity.buildIndex(storeNew, registryApi);
  const key = (p, x) => JSON.stringify([p, String(x.productId || x.itemId || ''), x.modelId || null, x.variantName || null]);

  // Case A: User cancels the title change confirmation -> writes nothing to localStorage
  {
    const memory = new Map();
    const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
    registryApi.saveStore(storage, storeNew);
    matcher.saveLocalAssignments(storage, initialAssignments);

    const messages = [];
    const context = {
      cloudMode: false, marketplaceRegistry: storeNew, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignments: initialAssignments,
      getQuickMapRegistryRowKey: key, marketplaceCatalogIndex: indexNew, canPersistQuickMap: true,
      quickMapSelectedRegistryRow: skuRowsNew[0],
      quickMapState: { itemIndex: 0, shortName: 'แดงใหม่', selectedRegistryRowKey: key('TIKTOK', skuRowsNew[0]), row: { order: { platform: 'TIKTOK', parsedItems: [item] } } },
      // Accept first prompt, reject second prompt (title change)
      window: { localStorage: storage, confirm: msg => { messages.push(msg); return messages.length === 1; } },
      setRegistryAssignments(next) { context.registryAssignments = next; },
      advanceReviewItem() {}, showToast() {}
    };
    vm.createContext(context);
    const script = html.slice(html.indexOf('const rereadLocalNamingState ='), html.indexOf('const persistRegistryAssignmentEvidence =')) +
      html.slice(html.indexOf('const handleSaveQuickMapping ='), html.indexOf('const handleCreateLocalProduct =')) +
      '\nhandleSaveQuickMapping();';
    await vm.runInContext(script, context);

    assert.equal(messages.length, 2, 'must have prompted initial confirm then title change confirm');
    assert.match(messages[1], /Old Product Title/);
    assert.match(messages[1], /New Product Title/);
    assert.deepEqual(matcher.loadLocalAssignments(storage), initialAssignments, 'must not have written anything on cancel');
  }

  // Case B: User accepts title change confirmation -> retries and re-binds with new title
  {
    const memory = new Map();
    const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
    registryApi.saveStore(storage, storeNew);
    matcher.saveLocalAssignments(storage, initialAssignments);

    const messages = [];
    let savedAssignments = initialAssignments;
    const context = {
      cloudMode: false, marketplaceRegistry: storeNew, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignments: initialAssignments,
      getQuickMapRegistryRowKey: key, marketplaceCatalogIndex: indexNew, canPersistQuickMap: true,
      quickMapSelectedRegistryRow: skuRowsNew[0],
      quickMapState: { itemIndex: 0, shortName: 'แดงใหม่', selectedRegistryRowKey: key('TIKTOK', skuRowsNew[0]), row: { order: { platform: 'TIKTOK', parsedItems: [item] } } },
      // Accept both prompts
      window: { localStorage: storage, confirm: msg => { messages.push(msg); return true; } },
      setRegistryAssignments(next) { savedAssignments = next; context.registryAssignments = next; },
      advanceReviewItem() {}, showToast() {}
    };
    vm.createContext(context);
    const script = html.slice(html.indexOf('const rereadLocalNamingState ='), html.indexOf('const persistRegistryAssignmentEvidence =')) +
      html.slice(html.indexOf('const handleSaveQuickMapping ='), html.indexOf('const handleCreateLocalProduct =')) +
      '\nhandleSaveQuickMapping();';
    await vm.runInContext(script, context);

    assert.equal(messages.length, 2);
    assert.match(messages[1], /Old Product Title/);
    assert.match(messages[1], /New Product Title/);
    const reloaded = matcher.loadLocalAssignments(storage);
    assert.equal(reloaded.entries[0].manualSkuRegistryProductName, 'New Product Title');
    assert.equal(reloaded.entries[0].shortName, 'แดงใหม่');
  }
});

console.log('PackMaster ticket 07 tests defined');
