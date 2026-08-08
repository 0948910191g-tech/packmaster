import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  rules,
  tikTokContinuationPage1,
  tikTokContinuationPage2,
  tikTokFivePackQtyThree,
  shopeeQtyCases
} from './fixtures/smart-matcher-cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const helperStart = html.indexOf('const normalizeMatchText');
const helperEnd = html.indexOf('const waitForLabelRender');
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Smart Matcher helper block is missing from index.html');

const helperSource = `${html.slice(helperStart, helperEnd)}\n` + `
globalThis.__packmasterSmart = {
  normalizeMatchText,
  extractPackTokens,
  scoreSkuRule,
  matchSkuRule,
  parseExplicitTotalQty,
  parseTikTokPositionedItems,
  hasQtyWarning,
  getAggregatedShortName
};`;
const context = {};
vm.createContext(context);
vm.runInContext(helperSource, context);
const {
  normalizeMatchText,
  matchSkuRule,
  parseExplicitTotalQty,
  parseTikTokPositionedItems,
  hasQtyWarning,
  getAggregatedShortName
} = context.__packmasterSmart;

assert.equal(normalizeMatchText('ฮากุเบบี้-ยกลัง36ห\uF70Aอ'), normalizeMatchText('ฮากุเบบี้-ยกลัง36ห่อ'));

assert.equal(matchSkuRule('Hoya Baby Wipes Value Pack 5 ห่อ', rules).rule?.id, 2, 'Value Pack must beat normal HOYA');
assert.equal(matchSkuRule('Hoya Baby Wipes Plus 5 ห่อ', rules).rule?.id, 3, 'Plus must beat normal HOYA');
assert.equal(matchSkuRule('Haku Cooling 1 ห่อ', rules).rule?.id, 4, 'Cooling 1 must not become Cooling 3');
assert.equal(matchSkuRule('Haku Cooling 3 ห่อ', rules).rule?.id, 5, 'Cooling 3 must match its own pack size');
assert.equal(matchSkuRule('Haku Extra Cooling 3 ห่อ', rules).rule?.id, 6, 'Extra Cooling must beat Cooling');

const ambiguousRules = [
  { id: 'a', keyword: 'HOYA baby wipes 5', shortName: 'A5' },
  { id: 'b', keyword: 'HOYA baby wipes 5', shortName: 'B5' }
];
assert.equal(matchSkuRule('HOYA baby wipes 5', ambiguousRules).status, 'ambiguous', 'close candidates must require review');

const t1 = parseTikTokPositionedItems(tikTokContinuationPage1, null);
const t2 = parseTikTokPositionedItems(tikTokContinuationPage2, 3);
assert.equal(t1.items.length, 1, 'TikTok first continuation page should contain one SKU');
assert.equal(t2.items.length, 2, 'TikTok continuation page should contain two SKUs');
assert.deepEqual([...t1.items, ...t2.items].map(item => item.qty), [1, 1, 1]);
assert.equal(hasQtyWarning([...t1.items, ...t2.items], t2.declaredTotalQty, false), false, '3 parsed items must agree with Qty Total 3');

const tQty3 = parseTikTokPositionedItems(tikTokFivePackQtyThree, 3);
assert.equal(tQty3.items.length, 1);
assert.equal(tQty3.items[0].qty, 3, 'Pack size 5 must not overwrite TikTok order Qty 3');
assert.equal(hasQtyWarning(tQty3.items, 3, false), false);

for (const sample of shopeeQtyCases) {
  assert.notEqual(sample.packSize, sample.orderQty, 'fixture must keep pack size separate from order qty');
}
assert.equal(parseExplicitTotalQty('Qty Total: 3 Order ID: X', 'TIKTOK'), 3);

assert.equal(getAggregatedShortName('Hoya V2 ฮากุ 1 ลัง', 2), 'Hoya V2 ฮากุ 2 ลัง');
assert.equal(getAggregatedShortName('95 1 1', 2), '95 1 2');

console.log('PackMaster smart matcher regression tests passed');
