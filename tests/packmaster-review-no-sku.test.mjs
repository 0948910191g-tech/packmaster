import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const registry = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const store = require('../data/packmaster-marketplace-registry.json');
const existingNames = require('../data/packmaster-registry-assignments.json');

test('Review can explicitly name a PDF product/variant pair with no Seller SKU', () => {
  const index = identity.buildIndex(store, registry);
  const selected = registry.getNameableRows(store.platforms.TIKTOK, 'TIKTOK')
    .find(row => row.productId === '1731446401417644870');
  const item = { text: `${selected.productName} | แพ็ค 5 ห่อ`, sellerSku: null };
  assert.equal(identity.extractSellerSku('TIKTOK', item), null);
  const saved = matcher.upsertManualSkuAlias(existingNames, index, 'TIKTOK', item, selected, 'ม่วง5', identity);
  const reloaded = matcher.validateAssignments(JSON.parse(JSON.stringify(saved)));
  assert.equal(matcher.match(index, 'TIKTOK', item, reloaded, identity).rule?.shortName, 'ม่วง5');
  assert.notEqual(matcher.match(index, 'TIKTOK', { text: `${selected.productName} | แพ็ค 10 ห่อ` }, reloaded, identity).status, 'matched');
  assert.notEqual(matcher.match(index, 'TIKTOK', { text: `${selected.productName} | แพ็ค 5 ห่อ | UNCONFIRMED` }, reloaded, identity).status, 'matched');
});

test('actual Review handler enables, confirms and persists a no-SKU pair to Local', async () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const selected = registry.getNameableRows(store.platforms.TIKTOK, 'TIKTOK').find(row => row.productId === '1731446401417644870');
  const item = { text: `${selected.productName} | แพ็ค 5 ห่อ`, sellerSku: null, qty: 1 };
  const order = { id: 'synthetic', platform: 'TIKTOK', parsedItems: [item] };
  const key = (platform, row) => JSON.stringify([platform, String(row.productId || row.itemId || ''), row.modelId || null, row.variantName || null]);
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  registry.saveStore(storage, store);
  const context = { cloudMode: false, marketplaceRegistry: store, marketplaceRegistryApi: registry,
    registryMatcherApi: matcher, registryIdentityApi: identity, registryAssignmentsLoaded: true, registryAssignmentsError: '',
    registryAssignments: matcher.newAssignments(), getQuickMapRegistryRowKey: key,
    quickMapRegistryPlatform: 'TIKTOK', quickMapRegistryRows: registry.getNameableRows(store.platforms.TIKTOK, 'TIKTOK'),
    marketplaceCatalogIndex: identity.buildIndex(store, registry),
    preparedRegistryAssignments: matcher.prepareAssignments(matcher.newAssignments()),
    quickMapState: { sourceText: item.text, itemIndex: 0, row: { order, types: ['UNMAPPED'] }, selectedRegistryRowKey: '', shortName: 'ม่วง5' },
    event: { target: { value: key('TIKTOK', selected) } },
    window: { localStorage: storage, confirm: () => true },
    setQuickMapState(value) { context.quickMapState = typeof value === 'function' ? value(context.quickMapState) : value; },
    showToast() {}, setRegistryAssignments(next) { context.registryAssignments = next; }
  };
  vm.createContext(context);
  context.quickMapState.registrySearch = 'HOYA ม่วง';
  const filterStart = html.indexOf('quickMapRegistryRows.filter(candidate => {', html.indexOf('aria-label="ผลการค้นหาสินค้า"'));
  const filterEnd = html.indexOf(').map(candidate => {', filterStart);
  assert.ok(filterStart >= 0 && filterEnd > filterStart);
  const searchResults = vm.runInContext(html.slice(filterStart, filterEnd + 1), context);
  assert.ok(searchResults.some(row => row.productId === selected.productId), 'search must find the selected HOYA product');
  assert.ok(searchResults.length < context.quickMapRegistryRows.length, 'search must narrow the list');
  const chooserStart = html.indexOf('aria-label="ผลการค้นหาสินค้า"');
  const eventStart = html.indexOf('onClick={() => {', chooserStart) + 'onClick={() => {'.length;
  const eventEnd = html.indexOf('}}>', eventStart);
  assert.ok(eventEnd > eventStart);
  context.candidate = selected;
  context.rowKey = key('TIKTOK', selected);
  vm.runInContext(html.slice(html.indexOf('const getRegistryRowEvidence ='), html.indexOf('const hasDuplicateRegistrySku =')) +
    '\n' + html.slice(eventStart, eventEnd), context);
  assert.equal(context.quickMapState.selectedRegistryRowKey, key('TIKTOK', selected));
  const state = html.slice(html.indexOf('const quickMapRegistryPlatform ='), html.indexOf('const sortBatchRows ='));
  vm.runInContext(state + '\nglobalThis.allowed = canPersistQuickMap;', context);
  assert.equal(context.allowed, true, 'no Seller SKU must not disable explicit catalog pair confirmation');
  const handler = html.slice(html.indexOf('const handleSaveQuickMapping ='), html.indexOf('const handleLinkNewRegistrySku ='));
  await vm.runInContext(handler + '\nhandleSaveQuickMapping();', context);
  const saved = matcher.loadLocalAssignments(storage);
  assert.equal(matcher.match(identity.buildIndex(store, registry), 'TIKTOK', item, saved, identity).rule?.shortName, 'ม่วง5');
  const outputSource = html.slice(html.indexOf('const LiveMappedOrders = useMemo(() => orders.map(o => {'), html.indexOf('const historicalSnapshot = useMemo'));
  const output = vm.runInNewContext(outputSource + '\nLiveMappedOrders;', {
    orders: [order], useMemo: fn => fn(),
    getMatchResult: (item, platform) => matcher.match(identity.buildIndex(store, registry), platform, item, saved, identity),
    getAggregatedShortName: name => name, hasQtyWarning: () => false,
    reviewOverridesApi: { getReviewAcknowledgement: () => false, getEffectiveItemQty: (_order, item) => item.qty,
      getManualSkuOverride: () => null, hasAmbiguousLegacyQtyOverride: () => false }
  });
  assert.deepEqual(Array.from(output[0].displayItems), ['ม่วง5']);
});
