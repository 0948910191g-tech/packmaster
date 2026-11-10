import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const api = require('../packmaster-marketplace-registry.js');
const identity = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const registry = require('../data/packmaster-marketplace-registry.json');
const index = identity.buildIndex(registry, api);
let row, item;
for (const r of api.getNameableRows(registry.platforms.SHOPEE, 'SHOPEE')) {
  const input = { text: [r.title, r.variantName].filter(Boolean).join(' ') };
  const e = identity.resolve(index, 'SHOPEE', input);
  if (e.status === 'found' && r.sellerSku && index.SHOPEE.sellerSkus.get(matcher.normalizeSku(r.sellerSku))?.length === 1) { row = r; item = input; break; }
}
assert.ok(row);
const skuEvidence = identity.resolve(index, 'SHOPEE', {sellerSku: row.sellerSku});
const catalogEvidence = identity.resolve(index, 'SHOPEE', item);
test('exact catalog item uses verified current SKU name', () => {
  const assignments = matcher.upsertAssignment(matcher.newAssignments(), 'SHOPEE', skuEvidence, 'Verified');
  assert.equal(matcher.match(index, 'SHOPEE', item, assignments, identity).rule?.shortName, 'Verified');
});
test('review save uses current SKU key for same exact row', () => {
  const canonical = matcher.canonicalEvidence(index, 'SHOPEE', catalogEvidence);
  const assignments = matcher.upsertAssignment(matcher.newAssignments(), 'SHOPEE', canonical, 'Review');
  assert.equal(matcher.match(index, 'SHOPEE', {sellerSku: row.sellerSku}, assignments, identity).rule?.shortName, 'Review');
});
test('conflicting legacy catalog name is not silently selected', () => {
  let assignments = matcher.upsertAssignment(matcher.newAssignments(), 'SHOPEE', skuEvidence, 'SKU name');
  assignments = matcher.upsertAssignment(assignments, 'SHOPEE', catalogEvidence, 'Old name');
  assert.equal(matcher.match(index, 'SHOPEE', item, assignments, identity).status, 'ambiguous');
});

test('explicit save resolves conflicting name without removing either record', () => {
  let assignments = matcher.upsertAssignment(matcher.newAssignments(), 'SHOPEE', skuEvidence, 'SKU name');
  assignments = matcher.upsertAssignment(assignments, 'SHOPEE', catalogEvidence, 'Old name');
  const saved = matcher.saveConfirmedAssignment(assignments, index, 'SHOPEE', catalogEvidence, 'Confirmed');
  assert.equal(saved.entries.length, 2);
  assert.equal(matcher.match(index, 'SHOPEE', item, saved, identity).rule.shortName, 'Confirmed');
  assert.equal(matcher.match(index, 'SHOPEE', { sellerSku: row.sellerSku }, saved, identity).rule.shortName, 'Confirmed');
});

test('matcher test widget supplies selected platform', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const part = (a,b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
  const assignments = matcher.upsertAssignment(matcher.newAssignments(), 'SHOPEE', skuEvidence, 'Verified');
  const c = {registryMatcherApi: matcher, marketplaceCatalogIndex: index, registryAssignments: assignments,
    registryAssignmentsLoaded: true, registryIdentityApi: identity, registryAssignmentsError: '',
    useCallback: f => f, useMemo: f => f(), testInput: 'Seller SKU: ' + row.sellerSku,
    testQty: '1', testPlatform: 'SHOPEE', getAggregatedShortName: name => name};
  vm.createContext(c);
  vm.runInContext(part('const getMatchResult = useCallback(', 'const handleFileUpload =') +
    part('const testResult = useMemo(', 'const skuFilterOptions =') + '\nglobalThis.result = testResult;', c);
  assert.equal(c.result, 'Verified');
});

test('stale Seller SKU mapping with a changed no-model variant is unresolved', () => {
  const original = { platform: 'SHOPEE', productId: 'p-variant', modelId: null, variantName: 'Small', sellerSku: 'VAR-SKU' };
  const changed = { ...original, variantName: 'Large' };
  const assignments = { ...matcher.newAssignments(), entries: [{
    platform: 'SHOPEE', identityType: 'seller_sku', sellerSku: 'VAR-SKU', productId: 'p-variant',
    modelId: null, variantName: 'Small', shortName: 'Small pack'
  }] };
  const result = matcher.match({ SHOPEE: { sellerSkus: new Map([['VAR-SKU', [changed]]]) } }, 'SHOPEE', {}, assignments,
    { resolve: () => ({ status: 'found', identityType: 'seller_sku', sellerSku: 'VAR-SKU', candidate: changed }) });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.reason, 'registry_identity_changed');
});

test('prepared naming snapshot reuses validated assignment keys for repeated visible rows', () => {
  const entries = Array.from({ length: 10000 }, (_, i) => ({ platform: 'SHOPEE', identityType: 'seller_sku',
    sellerSku: `SKU-${i}`, productId: `p-${i}`, modelId: null, variantName: null, shortName: `Name ${i}` }));
  let sourceEntryReads = 0;
  const trackedEntries = new Proxy(entries, { get(target, key, receiver) {
    if (/^(0|[1-9]\d*)$/.test(String(key))) sourceEntryReads++;
    return Reflect.get(target, key, receiver);
  } });
  const assignments = { ...matcher.newAssignments(), entries: trackedEntries };
  const prepared = matcher.prepareAssignments(assignments);
  assert.equal(prepared.byKey.size, 10000);
  const readsAfterPrepare = sourceEntryReads;
  const candidate = { platform: 'SHOPEE', productId: 'p-9999', modelId: null, variantName: null, sellerSku: 'SKU-9999' };
  const index = { SHOPEE: { sellerSkus: new Map([['SKU-9999', [candidate]]]) } };
  const identityApi = { resolve: () => ({ status: 'found', identityType: 'seller_sku', sellerSku: 'SKU-9999', candidate }) };
  for (let i = 0; i < 50; i++) {
    assert.equal(matcher.match(index, 'SHOPEE', {}, assignments, identityApi, prepared).rule.shortName, 'Name 9999');
  }
  assert.equal(sourceEntryReads, readsAfterPrepare, 'prepared lookups must not re-read the full caller assignment array');
  const updatedAssignments = { ...matcher.newAssignments(), entries: entries.map((entry, i) =>
    i === 9999 ? { ...entry, shortName: 'Refreshed name' } : entry) };
  const refreshed = matcher.prepareAssignments(updatedAssignments);
  assert.equal(refreshed.byKey.size, 10000);
  assert.equal(refreshed.byKey.get(matcher.assignmentKey(updatedAssignments.entries[9999])).shortName, 'Refreshed name',
    'a new immutable assignment object creates a refreshed prepared snapshot');
});
