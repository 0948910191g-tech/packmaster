import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const matcherApi = require('../packmaster-registry-matcher.js');
const identityApi = require('../packmaster-registry-identity.js');
const marketplaceRegistryApi = require('../packmaster-marketplace-registry.js');

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-quick-mapping/, 'Review must expose inline Quick Mapping UI');
assert.match(html, /<script src="\.\/packmaster-review-overrides\.js"><\/script>/, 'Review must load the per-order override helper');
assert.match(html, /const reviewOverridesApi = window\.PackMasterReviewOverrides;/);
assert.match(html, /pilotSafetyApi\.getSkuFixSeed\(row, getMatchResult\)/, 'Quick Mapping must reuse Pilot Safety safe SKU seed');
assert.match(html, /sourceText:\s*seed/, 'Quick Mapping must preserve the unresolved item identity');
assert.match(html, /keyword:\s*''/, 'Quick Mapping must not auto-select a suggested Keyword');
assert.match(html, /handleApplyQuickOrderName/, 'Quick Mapping must have an order-only apply action');
assert.match(html, /upsertManualSkuOverride\(/, 'order-only apply must persist a local order override');
assert.match(html, /ใช้กับ Order นี้/, 'Quick Mapping must expose the safe default action');
assert.match(html, /บันทึกชื่อจาก SKU ที่ตรงทะเบียน|ยืนยันและผูกคู่ SKU\/ข้อความใน Local/, 'persistent SKU assignment must be a separate explicit action');
assert.match(html, /pm-internal-name-options/, 'Quick Mapping must expose searchable existing internal-name choices');
assert.match(html, /getUniqueInternalNames\(skuRules\)/, 'internal-name choices must come from the current SKU Library');
assert.match(html, /ยังตั้งชื่อเฉพาะ Order นี้ได้/, 'no Keyword suggestion state must not block manual completion');
assert.match(html, /เปิดทะเบียนสินค้า/, 'Quick Mapping must link to the registry');
assert.match(html, /REVIEW_SKU.*UNMAPPED|UNMAPPED.*REVIEW_SKU/s, 'Quick Mapping action must stay limited to SKU/Unmapped exceptions');
assert.equal(/setQuickMapState\(\{[^}]*open:\s*true[^}]*shortName:\s*['"][^'"]+['"][^}]*\}\)/s.test(html), false, 'Quick Mapping must not auto-generate an internal short name');

const applyStart = html.indexOf('const handleApplyQuickOrderName');
const persistentStart = html.indexOf('const handleSaveQuickMapping');
assert.ok(applyStart >= 0 && persistentStart > applyStart, 'order-only handler must be defined before persistent mapping handler');
const applyBody = html.slice(applyStart, persistentStart);
assert.doesNotMatch(applyBody, /saveSkuRule\(/, 'using a name for one order must never create a shared SKU rule');

assert.match(html, /data-pm-review-registry-chooser/, 'Review must offer an explicit registry-row chooser');
assert.match(html, /getNameableRows\(marketplaceRegistry\?\.platforms\?\.\[quickMapRegistryPlatform\]/,
  'chooser must be built from every row on the order platform rather than the filtered naming view');
assert.match(html, /disabled=\{!canPersistQuickMap \|\| registryAssignmentsBusy/,
  'persistent save must require an explicit SKU and source product/variant pair');
assert.match(html, /upsertManualSkuAlias\(/,
  'persistent Review handler must save a manually selected exact SKU/product/variant association');
assert.match(html, /ออเดอร์ในอนาคตที่มี Seller SKU PDF และข้อความสินค้า\/ตัวเลือกตรงกันเท่านั้น/,
  'confirmation must explain that the association applies only to future exact evidence');
assert.match(html, /Cloud ยังไม่รองรับ metadata นี้/,
  'manual association must explain why Cloud cannot persist it');
assert.match(html, /shortName: prev\.chooserFilledShortName \? '' : prev\.shortName/,
  'clearing a chooser must discard a name that came from the selected registry row');

const applyEnd = html.indexOf('const persistRegistryAssignmentEvidence', applyStart);
assert.ok(applyEnd > applyStart, 'the tested order-only handler must have a clear source boundary');
const actualApplyHandler = html.slice(applyStart, applyEnd);
const syntheticOrder = {
  id: 'synthetic-order-1',
  parsedItems: [{ text: 'UNKNOWN-SKU-SYNTHETIC', qty: 1 }]
};
const calls = { overrides: [], assignmentWrites: 0, toasts: [] };
let updatedOrders = [];
const sandbox = {
  quickMapState: {
    sourceText: 'UNKNOWN-SKU-SYNTHETIC',
    shortName: 'Synthetic order name',
    row: { order: syntheticOrder, types: ['REVIEW_SKU'] },
    selectedRegistryRowKey: '["TIKTOK","registry-row-2",null,null]'
  },
  reviewOverridesApi: {
    upsertManualSkuOverride(order, sourceText, shortName) {
      calls.overrides.push({ orderId: order.id, sourceText, shortName });
      return { ...order, orderOnlyName: shortName };
    },
    confirmReview(order) { return order; }
  },
  resetActiveBatchCompletion: async () => true,
  setOrders(updater) { updatedOrders = updater([syntheticOrder]); },
  setQuickMapState() {},
  showToast(message) { calls.toasts.push(message); },
  registryMatcherApi: { saveLocalAssignments() { calls.assignmentWrites += 1; } },
  calls
};
await vm.runInNewContext(`${actualApplyHandler}\nhandleApplyQuickOrderName();`, sandbox);
assert.deepEqual(calls.overrides, [{
  orderId: 'synthetic-order-1',
  sourceText: 'UNKNOWN-SKU-SYNTHETIC',
  shortName: 'Synthetic order name'
}]);
assert.equal(updatedOrders[0].orderOnlyName, 'Synthetic order name');
assert.equal(calls.assignmentWrites, 0, 'explicit chooser selection remains order-only and never writes registry assignments');

const persistentEnd = html.indexOf('const handleLinkNewRegistrySku', persistentStart);
assert.ok(persistentEnd > persistentStart, 'persistent handler must have a clear source boundary');
const actualPersistentHandler = html.slice(persistentStart, persistentEnd);
const blockedSaveCalls = { assignments: 0, toasts: [] };
const blockedSaveSandbox = {
  canPersistQuickMap: false, cloudMode: false,
  quickMapState: { selectedRegistryRowKey: '["TIKTOK","registry-row-2",null,null]', sourceText: 'UNKNOWN-SKU-SYNTHETIC',
    row: { order: { platform: 'TIKTOK', parsedItems: [{ text: 'UNKNOWN-SKU-SYNTHETIC' }] } } },
  showToast(message) { blockedSaveCalls.toasts.push(message); },
  registryMatcherApi: { saveLocalAssignments() { blockedSaveCalls.assignments += 1; } },
  saveRegistryAssignment: async () => { blockedSaveCalls.assignments += 1; }
};
await vm.runInNewContext(`${actualPersistentHandler}\nhandleSaveQuickMapping();`, blockedSaveSandbox);
assert.equal(blockedSaveCalls.assignments, 0, 'selected registry row must not be persisted against the original PDF SKU');
assert.match(blockedSaveCalls.toasts[0], /เฉพาะ Order นี้/);

function syntheticRegistry() {
  const product = { platform: 'TIKTOK', productId: 'hoya-listing-5', productName: 'HOYA Baby Wipes Value Pack', sellerSku: 'HOYA Value Pack 5', variants: [] };
  const row = { platform: 'TIKTOK', productId: product.productId, productName: product.productName,
    sellerSku: product.sellerSku, sellerSkuStatus: 'present', modelId: null,
    variantName: '5 ห่อ 400 แผ่น', sourceRowType: 'product_sku' };
  return marketplaceRegistryApi.replacePlatformRegistry(marketplaceRegistryApi.createEmptyStore(), {
    schemaVersion: 1, registryType: 'marketplace_product_sku_source_registry', platform: 'TIKTOK',
    source: { shop: 'synthetic-test', captureDate: '2026-11-12' }, products: [product], skuRows: [row],
    productsWithoutAnySellerSku: [], pages: [{ products: 1 }],
    summary: { listedProductCount: 1, uniqueProductIdCount: 1, skuModelRowCount: 1,
      sellerSkuPresentRowCount: 1, sellerSkuMissingInRowsCount: 0, productsWithoutAnySellerSkuCount: 0 }
  });
}

const syntheticStorageData = new Map();
const localStorage = {
  getItem(key) { return syntheticStorageData.has(key) ? syntheticStorageData.get(key) : null; },
  setItem(key, value) { syntheticStorageData.set(key, String(value)); }
};
const registry = syntheticRegistry();
marketplaceRegistryApi.saveStore(localStorage, registry);
const registryIndex = identityApi.buildIndex(registry, marketplaceRegistryApi);
const selectedRow = marketplaceRegistryApi.getNameableRows(registry.platforms.TIKTOK, 'TIKTOK')[0];
const selectedRowKey = JSON.stringify(['TIKTOK', selectedRow.productId, selectedRow.modelId || null, selectedRow.variantName || null]);
const pdfItem = {
  text: 'HOYA Baby Wipes Value Pack | 5 ห่อ 400 แผ่น | 5 ห่อ HOYA Baby Wipes Value Pack',
  sellerSku: '5 ห่อ HOYA Baby Wipes Value Pack', qty: 1
};
const syntheticHoyaOrder = { id: 'synthetic-hoya-order', platform: 'TIKTOK', parsedItems: [pdfItem] };
const sourceFields = {
  quickMapState: { open: true, sourceText: pdfItem.text, shortName: 'HOYA 5 Pack', selectedRegistryRowKey: selectedRowKey,
    row: { order: syntheticHoyaOrder, types: ['REVIEW_SKU'] } },
  quickMapRegistryPlatform: 'TIKTOK', quickMapSelectedRegistryRow: selectedRow,
  canPersistQuickMap: true, cloudMode: false, registryAssignmentsLoaded: true, registryAssignmentsError: '',
  registryAssignments: matcherApi.newAssignments(), marketplaceCatalogIndex: registryIndex, marketplaceRegistry: registry,
  registryMatcherApi: matcherApi, registryIdentityApi: identityApi, marketplaceRegistryApi,
  getQuickMapRegistryRowKey(platform, row) { return JSON.stringify([platform, String(row?.productId || row?.itemId || ''), row?.modelId || null, row?.variantName || null]); },
  window: { localStorage, confirm(message) { sourceFields.confirmations.push(message); return true; } },
  confirmations: [], toasts: [],
  showToast(message) { sourceFields.toasts.push(message); },
  setRegistryAssignments(next) { sourceFields.registryAssignments = next; },
  setQuickMapState() {}, saveRegistryAssignment: async () => { throw new Error('unknown SKU must use selected alias path'); }
};
const handlerContext = vm.createContext(sourceFields);
await vm.runInContext(`${actualPersistentHandler}\nhandleSaveQuickMapping();`, handlerContext);
const aliasSku2 = { ...pdfItem, text: 'HOYA Baby Wipes Value Pack | 5 ห่อ 400 แผ่น | HOYA Baby Wipes Value Pack 5 ห่อ', sellerSku: 'HOYA Baby Wipes Value Pack 5 ห่อ' };
sourceFields.quickMapState.sourceText = aliasSku2.text;
sourceFields.quickMapState.row.order.parsedItems = [aliasSku2];
await vm.runInContext('handleSaveQuickMapping();', handlerContext);
assert.equal(sourceFields.confirmations.length, 2);
assert.match(sourceFields.confirmations[0], /ออเดอร์ในอนาคต/);
const persistedAssignments = matcherApi.loadLocalAssignments(localStorage);
assert.equal(persistedAssignments.version, 2);
assert.equal(persistedAssignments.entries[0].manualSkuAliases.length, 2);
assert.equal(matcherApi.match(registryIndex, 'TIKTOK', pdfItem, persistedAssignments, identityApi).rule.shortName, 'HOYA 5 Pack');
assert.equal(matcherApi.match(registryIndex, 'TIKTOK', aliasSku2, persistedAssignments, identityApi).rule.shortName, 'HOYA 5 Pack');
assert.equal(matcherApi.match(registryIndex, 'TIKTOK', { ...pdfItem, text: 'HOYA Baby Wipes Value Pack | 10 ห่อ 800 แผ่น | 5 ห่อ HOYA Baby Wipes Value Pack' }, persistedAssignments, identityApi).status, 'unmatched');
assert.equal(sourceFields.toasts.filter(message => message.includes('บันทึกคู่ Seller SKU')).length, 2);

const liveMappedStart = html.indexOf('const LiveMappedOrders = useMemo(() => orders.map(o => {');
const liveMappedEnd = html.indexOf('const historicalSnapshot = useMemo', liveMappedStart);
assert.ok(liveMappedEnd > liveMappedStart, 'the output mapping callback must have a clear source boundary');
const liveMappedSource = html.slice(liveMappedStart, liveMappedEnd);
const liveMappedSandbox = {
  orders: [syntheticHoyaOrder],
  useMemo: callback => callback(),
  getMatchResult: (item, platform) => matcherApi.match(registryIndex, platform, item, persistedAssignments, identityApi),
  getAggregatedShortName: name => name,
  hasQtyWarning: () => false,
  reviewOverridesApi: {
    getReviewAcknowledgement: () => false,
    getEffectiveItemQty: (_order, item) => item.qty,
    getManualSkuOverride: () => null,
    hasAmbiguousLegacyQtyOverride: () => false
  }
};
const liveMappedOutput = vm.runInNewContext(`${liveMappedSource}\nLiveMappedOrders;`, liveMappedSandbox);
assert.deepEqual(Array.from(liveMappedOutput[0].displayItems), ['HOYA 5 Pack'], 'the actual output mapper must place the confirmed permanent name on the label');

const staleStorageData = new Map(syntheticStorageData);
staleStorageData.set(matcherApi.LOCAL_ASSIGNMENTS_KEY, JSON.stringify({
  schema: matcherApi.SCHEMA, version: 1, entries: [{ platform: 'TIKTOK', identityType: 'catalog_row', sellerSku: null,
    productId: 'hoya-listing-5', modelId: null, variantName: '5 ห่อ 400 แผ่น', shortName: 'Changed elsewhere' }]
}));
const staleStorage = {
  getItem(key) { return staleStorageData.has(key) ? staleStorageData.get(key) : null; },
  setItem(key, value) { staleStorageData.set(key, String(value)); }
};
const raceCalls = { toasts: [], confirmCount: 0, writes: 0 };
const raceSandbox = {
  ...sourceFields,
  window: { localStorage: staleStorage, confirm() { raceCalls.confirmCount += 1; return true; } },
  registryAssignments: matcherApi.newAssignments(),
  setRegistryAssignments() { raceCalls.writes += 1; },
  registryMatcherApi: { ...matcherApi, saveLocalAssignments() { raceCalls.writes += 1; } },
  showToast(message) { raceCalls.toasts.push(message); }
};
await vm.runInNewContext(`${actualPersistentHandler}\nhandleSaveQuickMapping();`, raceSandbox);
assert.equal(raceCalls.confirmCount, 1);
assert.equal(raceCalls.writes, 0, 'a concurrent assignment change must never be overwritten');
assert.match(raceCalls.toasts[0], /อีกหน้าต่าง/);

console.log('PackMaster safe Quick Mapping contract passed');

const helper = await import('../packmaster-review-overrides.js');
const reviewApi = helper.default || helper;
const selector = html.slice(html.indexOf('const getReviewSourceText ='), html.indexOf('const getReviewKeywordSuggestions =')) +
  '\nglobalThis.selectText = getReviewSourceText; globalThis.selectIndex = getReviewSourceItemIndex;';
for (const cloudMode of [false, true]) {
  const order = { platform: 'SHOPEE', parsedItems: [{ text: 'FIRST', qty: 1 }, { text: 'SECOND', qty: 1 }] };
  const named = reviewApi.upsertManualSkuOverride(order, 'FIRST', 'Verified', 0);
  const context = { cloudMode, reviewOverridesApi: reviewApi, getMatchResult: () => ({ status: 'unmatched' }) };
  vm.createContext(context);
  vm.runInContext(selector, context);
  const row = { types: ['UNMAPPED'], order: named };
  assert.equal(context.selectText(row), 'SECOND', `Review must advance in ${cloudMode ? 'Cloud' : 'Local'}`);
  assert.equal(context.selectIndex(row, 'SECOND'), 1);
}
{
  const order = { platform: 'SHOPEE', parsedItems: [{ text: 'DUPLICATE' }, { text: 'DUPLICATE' }] };
  const named = reviewApi.upsertManualSkuOverride(order, 'DUPLICATE', 'First row', 0);
  const context = { cloudMode: true, reviewOverridesApi: reviewApi, getMatchResult: () => ({ status: 'unmatched' }) };
  vm.createContext(context);
  vm.runInContext(selector, context);
  const row = { types: ['UNMAPPED'], order: named };
  assert.equal(context.selectText(row), 'DUPLICATE');
  assert.equal(context.selectIndex(row, 'DUPLICATE'), 1, 'duplicate text must select the still-unresolved row identity');
}
