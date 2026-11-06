import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const snapshotApi = require('../packmaster-reprint-snapshot.js');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hydrationGuard = html.indexOf('if (!cloudMode || !reprintSnapshotApi');
const effectStart = html.lastIndexOf('useEffect(() => {', hydrationGuard);
const effectEnd = html.indexOf('useEffect(() => {', hydrationGuard + 1);
const memoStart = html.indexOf('const historicalSnapshot = useMemo');
const memoEnd = html.indexOf('const MappedOrders = useMemo', memoStart);
assert.ok(effectStart >= 0 && effectEnd > effectStart && memoEnd > memoStart);

test('a Cloud snapshot arriving after a completed Batch invalidates the memoized missing-history result', async () => {
  let releaseDocument;
  let version = 0;
  let store = {};
  let cachedDeps = null;
  let cachedValue;
  const snapshot = snapshotApi.validateSnapshot({
    batchId: 'batch-late', completedAt: '2026-11-06T00:00:00.000Z',
    orders: [{ id: 'order-late', displayItems: ['Historical output'], originalQty: 1,
      qtyWarning: false, unresolvedSku: false, resolvedAudit: [] }]
  });
  const reprintSnapshotApi = {
    replaceStore(value) { store = value; },
    getBatchSnapshot(id) { return store[id] || null; }
  };
  const cloud = { getDocument: () => new Promise(resolve => { releaseDocument = resolve; }) };
  const c = {
    cloudMode: true,
    cloud,
    reprintSnapshotApi,
    activeBatchId: 'batch-late',
    activeBatch: { id: 'batch-late', printedAt: snapshot.completedAt },
    reprintSnapshotVersion: 0,
    setReprintSnapshotVersion(update) { version = update(version); c.reprintSnapshotVersion = version; },
    useEffect(effect) { c.cleanup = effect(); },
    useMemo(factory, deps) {
      if (!cachedDeps || deps.some((value, index) => value !== cachedDeps[index])) {
        cachedDeps = deps;
        cachedValue = factory();
      }
      return cachedValue;
    },
    console: { error() {}, warn() {} }
  };
  vm.createContext(c);
  vm.runInContext(`${html.slice(effectStart, effectEnd)}\nglobalThis.readHistorical = () => { ${html.slice(memoStart, memoEnd)}; return historicalSnapshot; };`, c);
  assert.equal(c.readHistorical(), null, 'the memo first observes missing local history');

  releaseDocument({ value: { 'batch-late': snapshot } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(version, 1, 'Cloud hydration increments the memo dependency after replacing the snapshot store');
  assert.equal(c.readHistorical().orders[0].displayItems[0], 'Historical output');
  c.cleanup?.();
});
