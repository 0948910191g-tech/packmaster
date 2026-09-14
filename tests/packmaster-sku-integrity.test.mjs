import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const integrity = require('../packmaster-sku-integrity.js');
const normalize = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

const source = [
  { id: 'shared', keyword: 'LAVENDER 6', shortName: 'เย็นม่วง 6' },
  { id: 'shared', keyword: 'MENTHOL 6', shortName: 'เย็นฟ้า 6' }
];
const repaired = integrity.prepareRules(source, { normalize, idPrefix: 'migrate' });
assert.equal(repaired.ok, true);
assert.equal(new Set(repaired.rules.map(r => String(r.id))).size, 2, 'duplicate IDs must be re-keyed without deleting aliases');
assert.deepEqual(repaired.rules.map(r => r.shortName), source.map(r => r.shortName));
assert.equal(repaired.report.duplicateIds.length, 1);

const sameOutput = integrity.prepareRules([
  { id: 1, keyword: 'MENTHOL  12', shortName: 'เย็นฟ้า12' },
  { id: 2, keyword: ' menthol 12 ', shortName: 'เย็นฟ้า12' }
], { normalize, idPrefix: 'audit' });
assert.equal(sameOutput.ok, true);
assert.equal(sameOutput.report.sameOutputDuplicates.length, 1, 'same-output normalized aliases must be reported, not auto-deleted');
assert.equal(sameOutput.rules.length, 2);
const conflict = integrity.prepareRules([
  { id: 3, keyword: 'LAVENDER  6', shortName: 'เย็น ม.6' },
  { id: 4, keyword: 'lavender 6', shortName: 'เย็นม่วง 6' }
], { normalize, idPrefix: 'audit' });
assert.equal(conflict.ok, false, 'different-output normalized conflict must fail closed');
assert.equal(conflict.report.conflicts.length, 1);
assert.equal(conflict.rules.length, 2, 'audit must preserve both conflicting rules for user decision');

const unique = integrity.nextUniqueId(new Set(['rule-1', 'rule-2']), 'rule');
assert.equal(unique, 'rule-3');
console.log('PackMaster SKU dictionary integrity tests passed');
