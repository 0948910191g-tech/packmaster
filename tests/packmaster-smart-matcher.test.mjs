import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  rules,
  productionRuleSubset,
  tikTokContinuationPage1,
  tikTokContinuationPage2,
  tikTokFivePackQtyThree,
  tikTokGroupedHeader,
  shopeeThreeSkuPositioned,
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
  parseShopeePositionedItems: typeof parseShopeePositionedItems === 'function' ? parseShopeePositionedItems : null,
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
  parseShopeePositionedItems,
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

// Production regressions from the user's actual mapping export + real Shopee product text.
const hoyaBaby3 = matchSkuRule(
  'แพ็ค3ห่อ HOYA Baby Wipes ทิชชู่เปียกสูตรน้ำบริสุทธิ์ 99.9% 80 แผ่น สำหรับผิวบอบบาง',
  productionRuleSubset
);
assert.equal(hoyaBaby3.status, 'matched', 'HOYA Baby 3-pack should be confidently matched');
assert.equal(hoyaBaby3.rule?.shortName, 'เด้งม่วง3', 'HOYA Baby 3-pack must never become Wash Gloves 3-pack');

const jasmine12 = matchSkuRule(
  'Gift Set วันแม่ HAKU Cooling (ฮากุ ผ้าเปียกติดแอร์) กลิ่นมะลิ 12 ห่อ พร้อมกระเป๋าของขวัญ',
  productionRuleSubset
);
assert.equal(jasmine12.status, 'matched', 'HAKU Cooling Jasmine 12-pack should be confidently matched');
assert.equal(jasmine12.rule?.shortName, 'เย็นเขียว 12', 'Jasmine 12-pack must never become generic HAKU Baby 1');

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

const groupedTikTok = parseTikTokPositionedItems(tikTokGroupedHeader, 1);
assert.equal(groupedTikTok.parserWarning, false, 'Grouped Product Name / Seller SKU headers must be accepted');
assert.equal(groupedTikTok.items.length, 1, 'Grouped TikTok header must still produce one row');
assert.equal(groupedTikTok.items[0].qty, 1);

assert.ok(parseShopeePositionedItems, 'Shopee must have a deterministic positioned-column parser');
const shopee3 = parseShopeePositionedItems(shopeeThreeSkuPositioned, 3);
assert.deepEqual(shopee3.items.map(item => item.qty), [1, 1, 1], 'Shopee row Qty must come from the Qty column, never row numbers/footer total');
assert.equal(shopee3.items.length, 3);
assert.equal(hasQtyWarning(shopee3.items, 3, shopee3.parserWarning), false);

for (const sample of shopeeQtyCases) {
  assert.notEqual(sample.packSize, sample.orderQty, 'fixture must keep pack size separate from order qty');
}
assert.equal(parseExplicitTotalQty('Qty Total: 3 Order ID: X', 'TIKTOK'), 3);

assert.equal(getAggregatedShortName('Hoya V2 ฮากุ 1 ลัง', 2), 'Hoya V2 ฮากุ 2 ลัง');
assert.equal(getAggregatedShortName('95 1 1', 2), '95 1 2');

console.log('PackMaster smart matcher regression tests passed');
