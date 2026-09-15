import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const snapshots = require('../packmaster-reprint-snapshot.js');

const makeStorage = () => {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
};

const storage = makeStorage();
const historical = [{
  id: 'o1', displayItems: ['เด้งม่วง5'], originalQty: 1, qtyWarning: false, unresolvedSku: false,
  resolvedAudit: [{ sourceText: 'HAKU LAVENDER 5', effectiveQty: 1, resolution: 'rule', keyword: 'HAKU LAVENDER 5', shortName: 'เด้งม่วง5' }]
}];const saved = snapshots.saveBatchSnapshot('b1', historical, '2026-09-15T01:00:00.000Z', () => true, storage);
assert.equal(saved.orders[0].displayItems[0], 'เด้งม่วง5');
assert.equal(saved.orders[0].resolvedAudit[0].keyword, 'HAKU LAVENDER 5');

const liveAfterDictionaryEdit = [{
  id: 'o1', tracking: 'SANITIZED', parsedItems: [{ text: 'HAKU LAVENDER 5', qty: 1 }],
  displayItems: ['เด้งชมพู5'], originalQty: 1, qtyWarning: false, unresolvedSku: false,
  resolvedAudit: [{ sourceText: 'HAKU LAVENDER 5', effectiveQty: 1, resolution: 'rule', keyword: 'NEW RULE', shortName: 'เด้งชมพู5' }]
}];
const applied = snapshots.applyBatchSnapshot(liveAfterDictionaryEdit, snapshots.getBatchSnapshot('b1', storage));
assert.equal(applied.ok, true);
assert.equal(applied.orders[0].displayItems[0], 'เด้งม่วง5', 'reprint must use historical output, not current dictionary rematch');
assert.equal(applied.orders[0].resolvedAudit[0].shortName, 'เด้งม่วง5');

assert.throws(() => snapshots.saveBatchSnapshot('bad', historical, new Date().toISOString(), () => false, storage), /ready/i);
assert.equal(snapshots.getBatchSnapshot('missing', storage), null);
assert.equal(snapshots.clearBatchSnapshot('b1', storage), true);
assert.equal(snapshots.getBatchSnapshot('b1', storage), null);
console.log('PackMaster stable reprint snapshot tests passed');