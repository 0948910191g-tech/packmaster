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
  const index = identity.buildIndex(store, registryApi);
  index.store = store;
  return index;
}

// 1. matchingAliases returns registry_name_conflict_or_stale when another entry on the same row has a different shortName
test('match() matchingAliases returns registry_name_conflict_or_stale when same row has conflicting shortName', () => {
  const index = createTestRegistry('TIKTOK', [
    {
      productId: 'p-conflict',
      productName: 'Conflicting Product',
      variants: [{ modelId: 'v1', variantName: 'Red', sellerSku: 'SKU-CONF' }]
    }
  ]);
  const row = index.TIKTOK.registryRows[0];
  const item = { text: 'Conflicting Product | Red | SKU-CONF', sellerSku: 'SKU-CONF', qty: 1 };

  // Entry 1: manual SKU alias on the row with shortName 'ชื่อ ก'
  const base = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), index, 'TIKTOK', item, row, 'ชื่อ ก', identity,
    { confirmedExplicitTarget: true }
  );

  // Entry 2: direct seller_sku entry on the same row with conflicting shortName 'ชื่อ ข'
  const conflicting = matcher.validateAssignments({
    ...base,
    entries: [
      ...base.entries,
      {
        platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'SKU-CONF',
        productId: 'p-conflict', modelId: 'v1', variantName: 'Red', shortName: 'ชื่อ ข'
      }
    ]
  });

  const result = matcher.match(index, 'TIKTOK', item, conflicting, identity);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.reason, 'registry_name_conflict_or_stale');
});

// 2. saveConfirmedAssignment resolves all conflicting entries on the same row
test('saveConfirmedAssignment updates all conflicting entries on the same row and re-matches to confirmed name', () => {
  const index = createTestRegistry('TIKTOK', [
    {
      productId: 'p-resolve',
      productName: 'Resolve Product',
      variants: [{ modelId: 'v1', variantName: 'Blue', sellerSku: 'SKU-RES' }]
    }
  ]);
  const row = index.TIKTOK.registryRows[0];
  const item = { text: 'Resolve Product | Blue | SKU-RES', sellerSku: 'SKU-RES', qty: 1 };

  // Entry 1: manual SKU alias with 'ชื่อ เก่า 1'
  const base = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), index, 'TIKTOK', item, row, 'ชื่อ เก่า 1', identity,
    { confirmedExplicitTarget: true }
  );

  // Entry 2: seller_sku entry with 'ชื่อ เก่า 2'
  const conflicting = matcher.validateAssignments({
    ...base,
    entries: [
      ...base.entries,
      {
        platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'SKU-RES',
        productId: 'p-resolve', modelId: 'v1', variantName: 'Blue', shortName: 'ชื่อ เก่า 2'
      }
    ]
  });

  // Now confirm a unified name 'ชื่อ ใหม่แน่นอน'
  const evidence = identity.resolve(index, 'TIKTOK', item);
  const resolved = matcher.saveConfirmedAssignment(conflicting, index, 'TIKTOK', evidence, 'ชื่อ ใหม่แน่นอน');

  // Verify all entries for this row have the new name
  assert.ok(resolved.entries.length >= 2);
  assert.ok(resolved.entries.every(e => e.shortName === 'ชื่อ ใหม่แน่นอน'));

  // match() must now return matched with the confirmed name
  const matchResult = matcher.match(index, 'TIKTOK', item, resolved, identity);
  assert.equal(matchResult.status, 'matched');
  assert.equal(matchResult.rule.shortName, 'ชื่อ ใหม่แน่นอน');
});

// 3. index.html static checks: getRegistryRowSavedNames, handleSaveRegistryRowName, and chip label
test('index.html includes handleSaveRegistryRowName, updated getRegistryRowSavedNames, and chip label', () => {
  assert.match(html, /const handleSaveRegistryRowName =/);
  assert.match(html, /ชื่อขัดกัน \/ ต้องตรวจ/);
  assert.match(html, /ชื่อขัดกัน: \$\{savedNames\.join\(' \/ '\)\} • ตรวจและยืนยันชื่อที่จะใช้/);
});

// 4. getRegistryRowSavedNames runtime test: collects distinct names from sameTarget and unique seller_sku entry
test('getRegistryRowSavedNames collects distinct names from sameTarget and unique seller_sku entry', () => {
  const index = createTestRegistry('TIKTOK', [
    {
      productId: 'p1', productName: 'Item A',
      variants: [{ modelId: 'v1', variantName: 'Red', sellerSku: 'SKU-UNIQUE' }]
    }
  ]);
  const row = index.TIKTOK.registryRows[0];
  const base = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), index, 'TIKTOK',
    { text: 'Item A | Red | SKU-UNIQUE', sellerSku: 'SKU-UNIQUE' }, row, 'ชื่อ แคตตาล็อก', identity,
    { confirmedExplicitTarget: true }
  );
  const assignments = matcher.validateAssignments({
    ...base,
    entries: [
      ...base.entries,
      {
        platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'SKU-UNIQUE',
        productId: 'p1', modelId: 'v1', variantName: 'Red', shortName: 'ชื่อ SKU'
      }
    ]
  });

  const context = {
    registryAssignments: assignments,
    marketplaceCatalogIndex: index,
    registryMatcherApi: matcher
  };
  vm.createContext(context);
  const snippet = html.slice(html.indexOf('const getRegistryRowSavedNames ='), html.indexOf('const getRegistryRowAssignment =')) +
    '\nglobalThis.getNames = getRegistryRowSavedNames;';
  vm.runInContext(snippet, context);

  const savedNames = context.getNames('TIKTOK', row);
  assert.deepEqual(Array.from(savedNames).sort(), ['ชื่อ SKU', 'ชื่อ แคตตาล็อก'].sort());
});

// 5. handleSaveRegistryRowName runtime VM test: confirm dialog, cancel writes nothing, race rejection, confirm saves
test('handleSaveRegistryRowName runtime: confirms conflicting names, cancels without writing, rejects on race', async () => {
  const index = createTestRegistry('TIKTOK', [
    {
      productId: 'p-mgr', productName: 'Manager Item',
      variants: [{ modelId: 'v1', variantName: 'Red', sellerSku: 'MGR-SKU' }]
    }
  ]);
  const row = index.TIKTOK.registryRows[0];
  const base = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), index, 'TIKTOK',
    { text: 'Manager Item | Red | MGR-SKU', sellerSku: 'MGR-SKU' }, row, 'ชื่อ เดิม 1', identity,
    { confirmedExplicitTarget: true }
  );
  const initial = matcher.validateAssignments({
    ...base,
    entries: [
      ...base.entries,
      {
        platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'MGR-SKU',
        productId: 'p-mgr', modelId: 'v1', variantName: 'Red', shortName: 'ชื่อ เดิม 2'
      }
    ]
  });

  const memory = new Map();
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  registryApi.saveStore(storage, index.store || registryApi.createEmptyStore());
  matcher.saveLocalAssignments(storage, initial);

  const snippet = html.slice(html.indexOf('const rereadLocalNamingState ='), html.indexOf('const advanceReviewItem =')) +
    '\nglobalThis.saveRow = handleSaveRegistryRowName;';

  // Subcase A: Cancel confirm dialog -> writes nothing
  {
    const messages = [];
    const context = {
      cloudMode: false, marketplaceRegistry: index.store, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignmentsBusy: false,
      registryAssignments: initial, marketplaceCatalogIndex: index,
      registryNameRowMatches: new Map([[row, { status: 'ambiguous', reason: 'registry_name_conflict_or_stale' }]]),
      window: { localStorage: storage, confirm: msg => { messages.push(msg); return false; } },
      setRegistryAssignments() {}, setRegistryAssignmentsBusy() {}, setRegistryAssignmentsError() {},
      showToast() {}
    };
    vm.createContext(context);
    vm.runInContext(snippet, context);

    const saveEvidence = { status: 'found', identityType: 'seller_sku', sellerSku: 'MGR-SKU', candidate: row };
    await context.saveRow('TIKTOK', row, saveEvidence, 'ชื่อ รวม');

    assert.equal(messages.length, 1);
    assert.match(messages[0], /พบชื่อภายในต่างกันสำหรับสินค้าและตัวเลือกเดียวกัน/);
    assert.match(messages[0], /ชื่อ เดิม 1/);
    assert.match(messages[0], /ชื่อ เดิม 2/);
    assert.deepEqual(matcher.loadLocalAssignments(storage), initial, 'must write nothing on cancel');
  }

  // Subcase B: Race condition -> storage changes during confirm -> rejects write
  {
    let caughtError = null;
    const context = {
      cloudMode: false, marketplaceRegistry: index.store, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignmentsBusy: false,
      registryAssignments: initial, marketplaceCatalogIndex: index,
      registryNameRowMatches: new Map([[row, { status: 'ambiguous', reason: 'registry_name_conflict_or_stale' }]]),
      window: {
        localStorage: storage,
        confirm: () => {
          // Concurrent write in another tab
          matcher.saveLocalAssignments(storage, {
            ...initial,
            entries: [{ ...initial.entries[0], shortName: 'ชื่อ เปลี่ยนจากแท็บอื่น' }]
          });
          return true;
        }
      },
      setRegistryAssignments() {}, setRegistryAssignmentsBusy() {}, setRegistryAssignmentsError() {},
      showToast() {}
    };
    vm.createContext(context);
    vm.runInContext(snippet, context);

    const saveEvidence = { status: 'found', identityType: 'seller_sku', sellerSku: 'MGR-SKU', candidate: row };
    try {
      await context.saveRow('TIKTOK', row, saveEvidence, 'ชื่อ รวม');
    } catch (err) {
      caughtError = err;
    }
    assert.ok(caughtError, 'must reject on concurrent storage change');
    assert.match(caughtError.message, /ข้อมูลเปลี่ยนระหว่างยืนยัน/);
  }

  // Subcase C: Accept confirm -> saves unified name and resolves conflict
  {
    // Reset storage to initial
    matcher.saveLocalAssignments(storage, initial);
    let savedNext = initial;
    const context = {
      cloudMode: false, marketplaceRegistry: index.store, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignmentsBusy: false,
      registryAssignments: initial, marketplaceCatalogIndex: index,
      registryNameRowMatches: new Map([[row, { status: 'ambiguous', reason: 'registry_name_conflict_or_stale' }]]),
      window: { localStorage: storage, confirm: () => true },
      setRegistryAssignments(next) { savedNext = next; context.registryAssignments = next; },
      setRegistryAssignmentsBusy() {}, setRegistryAssignmentsError() {},
      showToast() {}
    };
    vm.createContext(context);
    vm.runInContext(snippet, context);

    const saveEvidence = { status: 'found', identityType: 'seller_sku', sellerSku: 'MGR-SKU', candidate: row };
    await context.saveRow('TIKTOK', row, saveEvidence, 'ชื่อ รวม');

    assert.ok(savedNext.entries.every(e => e.shortName === 'ชื่อ รวม'));
    const reloaded = matcher.loadLocalAssignments(storage);
    assert.ok(reloaded.entries.every(e => e.shortName === 'ชื่อ รวม'));
  }
});

// 6. handleSaveQuickMapping runtime VM test: conflicting names prompt confirm, cancel writes nothing, confirm saves
test('handleSaveQuickMapping runtime: conflicting names on candidate row prompt confirm before save', async () => {
  const index = createTestRegistry('TIKTOK', [
    {
      productId: 'p-quick', productName: 'Quick Item',
      variants: [{ modelId: 'v1', variantName: 'Red', sellerSku: 'QK-SKU' }]
    }
  ]);
  const row = index.TIKTOK.registryRows[0];
  const item = { text: 'Quick Item | Red | QK-SKU', sellerSku: 'QK-SKU', qty: 1 };
  const base = matcher.upsertManualSkuAlias(
    matcher.newAssignments(), index, 'TIKTOK', item, row, 'ชื่อ เดิม 1', identity,
    { confirmedExplicitTarget: true }
  );
  const initial = matcher.validateAssignments({
    ...base,
    entries: [
      ...base.entries,
      {
        platform: 'TIKTOK', identityType: 'seller_sku', sellerSku: 'QK-SKU',
        productId: 'p-quick', modelId: 'v1', variantName: 'Red', shortName: 'ชื่อ เดิม 2'
      }
    ]
  });

  const memory = new Map();
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  registryApi.saveStore(storage, index.store || registryApi.createEmptyStore());
  matcher.saveLocalAssignments(storage, initial);

  const script = html.slice(html.indexOf('const rereadLocalNamingState ='), html.indexOf('const handleCreateLocalProduct =')) +
    '\nhandleSaveQuickMapping();';

  // Subcase A: Cancel confirm dialog -> writes nothing
  {
    const messages = [];
    const context = {
      cloudMode: false, marketplaceRegistry: index.store, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignmentsBusy: false,
      registryAssignments: initial, marketplaceCatalogIndex: index,
      canPersistQuickMap: true,
      quickMapSelectedRegistryRow: null,
      quickMapState: {
        itemIndex: 0, shortName: 'ชื่อ รวมใหม่', selectedRegistryRowKey: null,
        row: { order: { platform: 'TIKTOK', parsedItems: [item] } }
      },
      setQuickMapState() {},
      window: { localStorage: storage, confirm: msg => { messages.push(msg); return false; } },
      setRegistryAssignments() {}, setRegistryAssignmentsBusy() {}, setRegistryAssignmentsError() {},
      advanceReviewItem() {}, showToast() {}
    };
    vm.createContext(context);
    await vm.runInContext(script, context);

    assert.equal(messages.length, 1);
    assert.match(messages[0], /พบชื่อภายในต่างกันสำหรับสินค้าและตัวเลือกเดียวกัน/);
    assert.deepEqual(matcher.loadLocalAssignments(storage), initial, 'must write nothing on cancel');
  }

  // Subcase B: Accept confirm -> saves unified name
  {
    const messages = [];
    let saved = initial;
    const context = {
      cloudMode: false, marketplaceRegistry: index.store, marketplaceRegistryApi: registryApi, crossTabApi: crossTab,
      registryMatcherApi: matcher, registryIdentityApi: identity,
      registryAssignmentsLoaded: true, registryAssignmentsError: '', registryAssignmentsBusy: false,
      registryAssignments: initial, marketplaceCatalogIndex: index,
      canPersistQuickMap: true,
      quickMapSelectedRegistryRow: null,
      quickMapState: {
        itemIndex: 0, shortName: 'ชื่อ รวมใหม่', selectedRegistryRowKey: null,
        row: { order: { platform: 'TIKTOK', parsedItems: [item] } }
      },
      setQuickMapState() {},
      window: { localStorage: storage, confirm: msg => { messages.push(msg); return true; } },
      setRegistryAssignments(next) { saved = next; context.registryAssignments = next; },
      setRegistryAssignmentsBusy() {}, setRegistryAssignmentsError() {},
      advanceReviewItem() {}, showToast() {}
    };
    vm.createContext(context);
    await vm.runInContext(script, context);

    assert.equal(messages.length, 1);
    const reloaded = matcher.loadLocalAssignments(storage);
    assert.ok(reloaded.entries.every(e => e.shortName === 'ชื่อ รวมใหม่'));
  }
});
