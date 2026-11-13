import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const matcher = require('../packmaster-registry-matcher.js');
const registryApi = require('../packmaster-marketplace-registry.js');
const crossTab = require('../packmaster-cross-tab.js');

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Synthetic two-tab harness: both "tabs" share one localStorage-like store.
function createSharedStorage() {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); },
    raw: key => data.get(key) ?? null
  };
}

function evidenceFor(sellerSku, productId) {
  return {
    status: 'found',
    identityType: 'seller_sku',
    sellerSku,
    candidate: {
      platform: 'TIKTOK',
      sellerSku,
      productId,
      productName: `Synthetic product ${productId}`,
      modelId: null,
      variantName: 'Default',
      linkedSellerSkus: []
    }
  };
}

const FIXED_DATE = new Date('2026-11-13T00:00:00Z');

// What a tab sees when it opens the page: the snapshot it keeps in memory.
function openTab(storage) {
  return {
    assignments: matcher.loadLocalAssignments(storage),
    registry: registryApi.loadStore(storage).store
  };
}

test('two tabs: a stale tab cannot overwrite a name saved by another tab', () => {
  const storage = createSharedStorage();
  const tabA = openTab(storage);
  const tabB = openTab(storage); // B opens before A saves, so B's memory goes stale

  // Tab A saves its name through the re-read guard.
  const aLatest = crossTab.readLocalNamingState({
    storage, matcherApi: matcher, registryApi,
    expectedAssignments: tabA.assignments, expectedRegistry: tabA.registry
  });
  const aNext = matcher.upsertAssignment(aLatest.assignments, 'TIKTOK', evidenceFor('SKU-A', 'p-a'), 'ชื่อจากแท็บ A');
  matcher.saveLocalAssignments(storage, aNext);

  // Tab B still holds the stale snapshot and tries to save a different name.
  assert.throws(() => crossTab.readLocalNamingState({
    storage, matcherApi: matcher, registryApi,
    expectedAssignments: tabB.assignments, expectedRegistry: tabB.registry
  }), error => error.code === 'stale_local_write' && /กรุณาโหลด/.test(error.message));

  // A's edit is still there and untouched.
  const stored = matcher.loadLocalAssignments(storage);
  assert.equal(stored.entries.length, 1);
  assert.equal(stored.entries[0].shortName, 'ชื่อจากแท็บ A');
});

test('two tabs: after reloading, the second tab adds its name on top of the latest data', () => {
  const storage = createSharedStorage();
  const tabA = openTab(storage);
  matcher.saveLocalAssignments(storage, matcher.upsertAssignment(tabA.assignments, 'TIKTOK', evidenceFor('SKU-A', 'p-a'), 'ชื่อ A'));

  const reloadedB = openTab(storage);
  const latest = crossTab.readLocalNamingState({
    storage, matcherApi: matcher, registryApi,
    expectedAssignments: reloadedB.assignments, expectedRegistry: reloadedB.registry
  });
  matcher.saveLocalAssignments(storage, matcher.upsertAssignment(latest.assignments, 'TIKTOK', evidenceFor('SKU-B', 'p-b'), 'ชื่อ B'));

  const names = matcher.loadLocalAssignments(storage).entries.map(entry => entry.shortName).sort();
  assert.deepEqual(names, ['ชื่อ A', 'ชื่อ B']);
});

test('two tabs: a stale registry snapshot is refused even when names are unchanged', () => {
  const storage = createSharedStorage();
  const tabB = openTab(storage);
  const bundledRegistry = JSON.parse(fs.readFileSync(new URL('../data/packmaster-marketplace-registry.json', import.meta.url), 'utf8'));
  registryApi.saveStore(storage, bundledRegistry); // tab A imports a real registry

  assert.throws(() => crossTab.readLocalNamingState({
    storage, matcherApi: matcher, registryApi,
    expectedAssignments: tabB.assignments, expectedRegistry: tabB.registry
  }), error => error.code === 'stale_local_write');
});

test('index.html two-tab simulation: tab B with a stale snapshot cannot overwrite tab A name', async () => {
  const sourceStart = html.indexOf('const rereadLocalNamingState =');
  const sourceEnd = html.indexOf('const handleSaveQuickMapping =', sourceStart);
  assert.ok(sourceStart >= 0 && sourceEnd > sourceStart, 'the guard and the save handler must be in index.html');
  const storageData = new Map();
  const storage = { getItem: key => storageData.get(key) ?? null, setItem: (key, value) => storageData.set(key, String(value)) };
  // Synthetic identity: each PDF item is its own exact registry row.
  const identity = {
    resolve: (_index, platform, item) => ({ status: 'found', sellerSku: item.sellerSku,
      candidate: { platform, productId: item.productId, modelId: null } })
  };
  registryApi.saveStore(storage, registryApi.createEmptyStore(FIXED_DATE));
  const openTab = () => {
    const tab = {
      cloudMode: false, registryMatcherApi: matcher, registryIdentityApi: identity, marketplaceRegistryApi: registryApi,
      crossTabApi: crossTab, marketplaceCatalogIndex: {}, registryAssignmentsLoaded: true, registryAssignmentsError: '',
      registryAssignmentsBusy: false,
      registryAssignments: matcher.loadLocalAssignments(storage),
      marketplaceRegistry: registryApi.loadStore(storage).store,
      window: { localStorage: storage },
      setRegistryAssignmentsBusy() {},
      setRegistryAssignments(next) { tab.registryAssignments = next; }
    };
    vm.createContext(tab);
    vm.runInContext(html.slice(sourceStart, sourceEnd) + '\nglobalThis.save = saveRegistryAssignment;', tab);
    return tab;
  };
  const tabA = openTab();
  const tabB = openTab(); // B opens before A saves, so B's snapshot goes stale

  await tabA.save('TIKTOK', { sellerSku: 'SKU-A', productId: 'p-a' }, 'ชื่อจากแท็บ A');
  await assert.rejects(tabB.save('TIKTOK', { sellerSku: 'SKU-B', productId: 'p-b' }, 'ชื่อจากแท็บ B'),
    error => /อีกแท็บ/.test(error.message));

  const stored = matcher.loadLocalAssignments(storage);
  assert.deepEqual(stored.entries.map(entry => entry.shortName), ['ชื่อจากแท็บ A']);
});

// Batch store whose reads and writes land late, like IndexedDB transactions in flight.
function createTimedBatchStore({ saveDelay = 0, loadDelay = 0 } = {}) {
  const rows = new Map();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  return {
    async loadBatch(id) {
      const row = rows.get(id);
      const snapshot = row ? { meta: structuredClone(row.meta), orders: structuredClone(row.orders) } : { meta: null, orders: [] };
      await wait(loadDelay); // the result arrives after a save may have finished
      return snapshot;
    },
    async saveBatch(meta, orders) {
      await wait(saveDelay); // the write lands late
      rows.set(meta.id, { meta: structuredClone(meta), orders: structuredClone(orders) });
      return meta;
    },
    async listBatches() { return [...rows.values()].map(row => structuredClone(row.meta)); },
    async deleteBatch(id) { rows.delete(id); },
    rows
  };
}

test('batch queue: a load that finishes after an in-flight save does not roll back the known version', async () => {
  const T0 = '2026-11-13T09:00:00.000Z';
  const T1 = '2026-11-13T09:01:00.000Z';
  const T2 = '2026-11-13T09:02:00.000Z';
  const store = createTimedBatchStore({ saveDelay: 20, loadDelay: 40 });
  const tab = crossTab.createBatchVersionGuard(store);
  await tab.saveBatch({ id: 'batch-q1', updatedAt: T0 }, []);
  await tab.loadBatch('batch-q1');
  const savePending = tab.saveBatch({ id: 'batch-q1', updatedAt: T1 }, [{ id: 'x' }]);
  const loadPending = tab.loadBatch('batch-q1');
  await savePending;
  const inFlight = await loadPending;
  assert.equal(inFlight.meta.updatedAt, T1, 'the load must run after the save it was queued behind');
  // Same tab keeps saving its own batch without a false stale refusal (no repairing re-read in between).
  await tab.saveBatch({ id: 'batch-q1', updatedAt: T2 }, [{ id: 'y' }]);
  assert.equal(store.rows.get('batch-q1').meta.updatedAt, T2);
});

test('batch queue: deleteBatch waits for an in-flight save so the batch is not resurrected', async () => {
  const store = createTimedBatchStore({ saveDelay: 20 });
  const tab = crossTab.createBatchVersionGuard(store);
  const savePending = tab.saveBatch({ id: 'batch-q2', updatedAt: '2026-11-13T09:00:00.000Z' }, [{ id: 'x' }]);
  const deletePending = tab.deleteBatch('batch-q2');
  await Promise.all([savePending, deletePending]);
  assert.equal(store.rows.has('batch-q2'), false, 'delete must run after the save it was queued behind');
});

test('SKU rules: a tab that wrote restored rules keeps saving its own later edits', () => {
  // Mirrors index.html: restore writes the rules text and records it as the tab's known text.
  let stored = null;
  let known = null;
  const write = nextRaw => {
    const decision = crossTab.decideRawWrite({ storedRaw: stored, knownRaw: known, nextRaw });
    if (decision.action === 'write') stored = nextRaw;
    if (decision.action !== 'stale') known = nextRaw;
    return decision.action;
  };
  assert.equal(write('[]'), 'write'); // mount
  assert.equal(write('[{"a":1}]'), 'write'); // user edit
  stored = '[{"restored":true}]'; // restore writes directly
  known = stored; // ...and records what it wrote (the fix)
  assert.equal(write('[{"restored":true},{"b":2}]'), 'write', 'an edit after restore must still save');
  assert.equal(stored, '[{"restored":true},{"b":2}]');
});

test('SKU rules: text another tab wrote is refused, while identical text is adopted without a write', () => {
  assert.equal(crossTab.decideRawWrite({ storedRaw: '[{"other":1}]', knownRaw: '[]', nextRaw: '[{"mine":1}]' }).action, 'stale');
  assert.equal(crossTab.decideRawWrite({ storedRaw: '[{"same":1}]', knownRaw: '[]', nextRaw: '[{"same":1}]' }).action, 'adopt');
  assert.equal(crossTab.decideRawWrite({ storedRaw: null, knownRaw: null, nextRaw: '[]' }).action, 'write');
});

test('index.html: SKU rules effect uses the shared decision and restore/rollback record the text they wrote', () => {
  assert.match(html, /crossTabApi\.decideRawWrite\(/);
  assert.match(html, /window\.localStorage\.setItem\('skuMappingRules', JSON\.stringify\(restoredRules\)\);[\s\S]{0,200}?skuMappingRulesRawRef\.current = window\.localStorage\.getItem\('skuMappingRules'\);/);
  assert.match(html, /restoreLocalStorageEntries\(window\.localStorage, previousLocalStorageEntries\);\s*skuMappingRulesRawRef\.current = window\.localStorage\.getItem\('skuMappingRules'\);/);
});

test('toasts: non-success messages stay about 10 seconds, success messages 3 seconds', () => {
  assert.match(html, /setTimeout\(\(\) => onClose\(\), type === 'success' \? 3000 : 10000\)/);
});

test('import: unreadable stored names say to restore a backup first', () => {
  assert.match(html, /ข้อมูลชื่อทะเบียน Local อ่านไม่ครบ[^'\n]*กู้คืนข้อมูลจาก Backup ก่อน/);
  assert.match(crossTab.STALE_LOCAL_MESSAGE, /^ข้อมูล/);
  const unreadable = (() => {
    const storage = createSharedStorage();
    storage.setItem(matcher.LOCAL_ASSIGNMENTS_KEY, '{broken');
    try {
      crossTab.readLocalNamingState({ storage, matcherApi: matcher, registryApi,
        expectedAssignments: matcher.newAssignments(), expectedRegistry: registryApi.createEmptyStore(FIXED_DATE) });
    } catch (error) { return error.message; }
    return '';
  })();
  assert.match(unreadable, /กู้คืนข้อมูลจาก Backup ก่อน/);
});

test('CI smoke marker list includes the cross-tab module', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/production-smoke.yml', import.meta.url), 'utf8');
  assert.match(workflow, /grep -Fq '\.\/packmaster-cross-tab\.js' <<< "\$html"/);
});

test('unreadable stored names are reported in Thai instead of a raw parse error', () => {
  const storage = createSharedStorage();
  storage.setItem(matcher.LOCAL_ASSIGNMENTS_KEY, '{broken');
  assert.throws(() => crossTab.readLocalNamingState({
    storage, matcherApi: matcher, registryApi,
    expectedAssignments: matcher.newAssignments(), expectedRegistry: registryApi.createEmptyStore(FIXED_DATE)
  }), error => /อ่านไม่ได้/.test(error.message) && !/JSON|Unexpected/.test(error.message));
});

test('empty registry with a different updatedAt is not a false stale write', () => {
  const storage = createSharedStorage();
  const opened = { assignments: matcher.newAssignments(), registry: registryApi.createEmptyStore(FIXED_DATE) };
  const later = crossTab.readLocalNamingState({
    storage, matcherApi: matcher, registryApi,
    expectedAssignments: opened.assignments, expectedRegistry: opened.registry
  });
  assert.equal(later.assignments.entries.length, 0);
  assert.deepEqual(Object.keys(later.store.platforms).sort(), Object.keys(opened.registry.platforms).sort());
});

test('batch guard refuses a write when the stored batch changed after this tab last saved it', () => {
  assert.throws(() => crossTab.assertBatchNotChangedElsewhere({ id: 'b1', updatedAt: '2026-11-13T10:00:00.000Z' },
    '2026-11-13T09:00:00.000Z'), error => error.code === 'stale_local_write' && /Batch/.test(error.message));
  assert.doesNotThrow(() => crossTab.assertBatchNotChangedElsewhere({ id: 'b1', updatedAt: '2026-11-13T09:00:00.000Z' },
    '2026-11-13T09:00:00.000Z'));
  assert.throws(() => crossTab.assertBatchNotChangedElsewhere(null, '2026-11-13T09:00:00.000Z'),
    error => error.code === 'stale_local_write'); // deleted in another tab
});

test('two tabs: a batch deleted in tab B is not resurrected by a stale save in tab A', async () => {
  const store = createSharedBatchStore();
  const tabA = crossTab.createBatchVersionGuard(store);
  const tabB = crossTab.createBatchVersionGuard(store);
  await tabA.saveBatch({ id: 'batch-3', updatedAt: '2026-11-13T09:00:00.000Z' }, [{ id: 'o1' }]);
  await tabA.loadBatch('batch-3');
  await tabB.deleteBatch('batch-3');
  await assert.rejects(
    tabA.saveBatch({ id: 'batch-3', updatedAt: '2026-11-13T09:01:00.000Z' }, [{ id: 'o2' }]),
    error => error.code === 'stale_local_write'
  );
  assert.equal((await store.loadBatch('batch-3')).meta, null);
});

// In-memory stand-in for the IndexedDB batch store, shared by both tabs.
function createSharedBatchStore() {
  const rows = new Map();
  return {
    async loadBatch(id) {
      const meta = rows.has(id) ? rows.get(id).meta : null;
      return { meta: meta ? structuredClone(meta) : null, orders: rows.has(id) ? structuredClone(rows.get(id).orders) : [] };
    },
    async saveBatch(meta, orders) {
      rows.set(meta.id, { meta: structuredClone(meta), orders: structuredClone(orders) });
      return meta;
    },
    async listBatches() { return [...rows.values()].map(row => structuredClone(row.meta)); },
    async deleteBatch(id) { rows.delete(id); }
  };
}

test('two tabs: a batch saved by tab B after tab A saved it is refused, and tab A is not overwritten', async () => {
  const store = createSharedBatchStore();
  const tabA = crossTab.createBatchVersionGuard(store);
  const tabB = crossTab.createBatchVersionGuard(store);
  const base = { id: 'batch-1', updatedAt: '2026-11-13T09:00:00.000Z' };

  await tabA.saveBatch(base, [{ id: 'o1' }]);
  await tabB.loadBatch('batch-1');
  await tabA.saveBatch({ ...base, updatedAt: '2026-11-13T09:05:00.000Z' }, [{ id: 'o1', edit: 'A' }]);

  await assert.rejects(
    tabB.saveBatch({ ...base, updatedAt: '2026-11-13T09:06:00.000Z' }, [{ id: 'o1', edit: 'B' }]),
    error => error.code === 'stale_local_write' && /Batch/.test(error.message)
  );
  const stored = await store.loadBatch('batch-1');
  assert.equal(stored.orders[0].edit, 'A');
});

test('batch guard lets a tab keep saving its own batch and never blocks a first save', async () => {
  const store = createSharedBatchStore();
  const tab = crossTab.createBatchVersionGuard(store);
  await tab.saveBatch({ id: 'batch-2', updatedAt: '2026-11-13T09:00:00.000Z' }, []);
  await tab.saveBatch({ id: 'batch-2', updatedAt: '2026-11-13T09:01:00.000Z' }, [{ id: 'x' }]);
  await tab.saveBatch({ id: 'batch-2', updatedAt: '2026-11-13T09:02:00.000Z' }, [{ id: 'y' }]);
  const stored = await store.loadBatch('batch-2');
  assert.equal(stored.meta.updatedAt, '2026-11-13T09:02:00.000Z');
});

test('storage listener reports only changes to the naming and registry keys, and can be removed', () => {
  const listeners = new Map();
  const fakeWindow = {
    addEventListener: (type, fn) => { listeners.set(type, fn); },
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); }
  };
  const seen = [];
  const stop = crossTab.watchLocalDataChanges(fakeWindow, ['packmasterRegistrySkuAssignmentsV1'], key => seen.push(key));
  const fire = event => listeners.get('storage')?.(event);

  fire({ key: 'packmasterRegistrySkuAssignmentsV1' });
  fire({ key: 'unrelatedKey' });
  fire({ key: null }); // another tab cleared storage
  assert.deepEqual(seen, ['packmasterRegistrySkuAssignmentsV1', null]);

  stop();
  assert.equal(listeners.has('storage'), false);
});

test('index.html loads the module and routes every local naming and registry write through the re-read guard', () => {
  assert.match(html, /<script src="\.\/packmaster-cross-tab\.js"><\/script>/);

  const slice = (startMarker, endMarker) => {
    const start = html.indexOf(startMarker);
    const end = html.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `missing block ${startMarker}`);
    return html.slice(start, end);
  };

  const evidenceWrite = slice('const persistRegistryAssignmentEvidence', 'const saveRegistryAssignment');
  assert.match(evidenceWrite, /readLocalNamingState\(/);
  assert.doesNotMatch(evidenceWrite, /saveConfirmedAssignment\(\s*registryAssignments,/);

  const quickMap = slice('if (quickMapState.selectedRegistryRowKey) {', 'advanceReviewItem(order, quickMapState.itemIndex, nextItem => registryMatcherApi.match(latestIndex');
  assert.match(quickMap, /readLocalNamingState\(/);
  assert.doesNotMatch(quickMap, /registryMatcherApi\.loadLocalAssignments\(window\.localStorage\)/);

  const createProduct = slice('const handleCreateLocalProduct', 'const handleLinkNewRegistrySku');
  assert.match(createProduct, /readLocalNamingState\(/);

  const importBlock = slice('const handleMarketplaceRegistryImport', 'setMarketplaceRegistry(nextStore);');
  assert.match(importBlock, /readLocalNamingState\(/);

  const restore = slice('replace: async () => {', 'if (cloudMode && typeof cloud?.saveRegistryAssignments');
  assert.match(restore, /readLocalNamingState\(/);

  const skuRulesWrite = slice('const skuMappingRulesRawRef', "useEffect(() => { localStorage.setItem('thermalMode'");
  assert.match(skuRulesWrite, /skuMappingRulesRawRef\.current/);
  assert.match(skuRulesWrite, /localStorage\.getItem\('skuMappingRules'\)/);
  assert.match(skuRulesWrite, /showToast\('ยังไม่ได้บันทึกกฎ SKU เพราะข้อมูลถูกแก้จากอีกแท็บ/); // a refused edit is never silent
});

test('index.html wraps the local batch API so every batch save re-reads the stored batch first', () => {
  // Memoized on cloudMode: a per-render guard would reset its version memory on every re-render.
  assert.match(html, /const batchApi = useMemo\(\(\) => cloudMode \? cloud\.cloudBatchApi\s*: \(crossTabApi \? crossTabApi\.createBatchVersionGuard\(window\.PackMasterBatch\) : window\.PackMasterBatch\), \[cloudMode\]\);/);
});

test('index.html warns with a readable Thai toast when another tab changes local naming or registry data', () => {
  assert.match(html, /watchLocalDataChanges\(window/);
  assert.match(html, /ข้อมูลถูกแก้จากอีกแท็บ • กรุณาโหลดหน้านี้ใหม่ก่อนบันทึกต่อ/);
});
