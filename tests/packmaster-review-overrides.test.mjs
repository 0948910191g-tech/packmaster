import fs from 'node:fs';
import assert from 'node:assert/strict';

const modulePath = new URL('../packmaster-review-overrides.js', import.meta.url);
assert.equal(fs.existsSync(modulePath), true, 'manual override helper module must exist');

const api = await import(modulePath.href);
const helpers = api.default || api;

const orderA = { id: 'A', manualSkuOverrides: [] };
const orderB = { id: 'B', manualSkuOverrides: [] };

const first = helpers.upsertManualSkuOverride(orderA, 'HOYA Baby 5 ห่อ', 'หมูเด้ง5');
assert.equal(first.id, 'A');
assert.deepEqual(orderA.manualSkuOverrides, [], 'helper must not mutate the source order');
assert.equal(helpers.getManualSkuOverride(first, 'HOYA   Baby 5 ห่อ')?.shortName, 'หมูเด้ง5', 'override lookup must use normalized exact source text');
assert.equal(helpers.getManualSkuOverride(first, 'HOYA Baby 10 ห่อ'), null, 'similar SKU must not inherit another override');
assert.equal(helpers.getManualSkuOverride(orderB, 'HOYA Baby 5 ห่อ'), null, 'override must stay isolated to its order');

const replaced = helpers.upsertManualSkuOverride(first, 'HOYA Baby 5 ห่อ', 'หมูเด้งใหม่5');
assert.equal(replaced.manualSkuOverrides.length, 1, 'upsert must replace an existing sourceText override instead of duplicating it');
assert.equal(helpers.getManualSkuOverride(replaced, 'HOYA Baby 5 ห่อ')?.shortName, 'หมูเด้งใหม่5');

assert.deepEqual(
  helpers.getUniqueInternalNames([
    { shortName: 'หมูเด้ง5' },
    { shortName: ' หมูเด้ง5 ' },
    { shortName: 'เย็นฟ้า5' },
    { shortName: '' }
  ]),
  ['หมูเด้ง5', 'เย็นฟ้า5'],
  'internal-name choices must be trimmed and deduplicated'
);

console.log('PackMaster per-order override contract passed');
