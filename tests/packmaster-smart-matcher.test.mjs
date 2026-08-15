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
  shopeeFivePlusFiveQtyTwo,
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

const menthol12 = matchSkuRule('HAKU Cooling MENTHOL 12 ห่อ', productionRuleSubset);
assert.equal(menthol12.status, 'matched', 'Formatting-only internal-name aliases must not become ambiguous');
assert.ok(['เย็นฟ้า12', 'เย็นฟ้า 12'].includes(menthol12.rule?.shortName));

const lavender6 = matchSkuRule('HAKU Cooling LAVENDER 6 ห่อ', productionRuleSubset);
assert.equal(lavender6.status, 'ambiguous', 'Conflicting real internal names must still require review');
assert.equal(lavender6.rule, null, 'True mapping conflicts must never choose a SKU automatically');

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

// 2026-08-14 real failure case: a purple HOYA Baby 24-carton label was printed as the pink internal SKU.
// The TikTok parser preserves Product / SKU / Seller SKU separated by " | ". A stale shared mapping can be a
// longer exact substring of Product Name, so the current exact-longest matcher bypasses Seller SKU + pack identity.
const purple24RulesWithStaleSharedMapping = [
  { id: 'purple-24', keyword: 'Hoya baby 24', shortName: 'เด้งม่วง1ลัง' },
  { id: 'pink-24', keyword: 'Hoya Plus 24', shortName: 'เด้งชม1ลัง' },
  {
    id: 'stale-shared-product-title',
    keyword: '(ยกลัง24ห่อ) HOYA ทิชชู่เปียก baby Wipes 80แผ่น/ห่อ สูตรอ่อนโยน',
    shortName: 'เด้งชม1ลัง'
  }
];
const purple24TikTokSource = '(ยกลัง24ห่อ) HOYA ทิชชู่เปียก baby Wipes 80แผ่น/ห่อ สูตรอ่อนโยน สำหรับผิวบอบบาง | ค่าเริ่มต้น | HOYA BB สีม่วง';
const purple24Result = matchSkuRule(purple24TikTokSource, purple24RulesWithStaleSharedMapping);
assert.equal(purple24Result.status, 'matched', 'purple TikTok carton should resolve from authoritative structured identity');
assert.equal(
  purple24Result.rule?.shortName,
  'เด้งม่วง1ลัง',
  'Seller SKU HOYA BB สีม่วง + 24-pack identity must not be overridden by a stale broad Product Name mapping'
);

const pink24TikTokSource = '(มีกลิ่นหอม ยกลัง24ห่อ) HOYA ทิชชู่เปียก baby Wipes Plus 80แผ่น/ห่อ สูตรมีกลิ่นหอม | ค่าเริ่มต้น | HOYA BB สีชมพู';
const pink24Result = matchSkuRule(pink24TikTokSource, purple24RulesWithStaleSharedMapping);
assert.equal(pink24Result.status, 'matched', 'pink TikTok carton should remain confidently matched');
assert.equal(pink24Result.rule?.shortName, 'เด้งชม1ลัง', 'Plus/pink identity must remain pink');

// 2026-08-15 follow-up real failure: production can have only the stale pink shared mapping available.
// In that case structured matching finds no strong purple alternative and currently falls back to exact-longest,
// printing pink even though Seller SKU explicitly says สีม่วง. This must fail closed into Review instead.
const stalePinkOnlyRules = [
  {
    id: 'stale-pink-only',
    keyword: '(ยกลัง24ห่อ) HOYA ทิชชู่เปียก baby Wipes 80แผ่น/ห่อ สูตรอ่อนโยน',
    shortName: 'เด้งชม1ลัง'
  }
];
const purpleAgainstStalePinkOnly = matchSkuRule(purple24TikTokSource, stalePinkOnlyRules);
assert.equal(
  purpleAgainstStalePinkOnly.status,
  'ambiguous',
  'Seller SKU สีม่วง conflicting with a pink internal mapping must fail closed into Review when no safe purple rule exists'
);
assert.equal(purpleAgainstStalePinkOnly.rule, null, 'conflicting stale pink mapping must never be printed for a purple Seller SKU');

const pinkAgainstStalePinkOnly = matchSkuRule(pink24TikTokSource, stalePinkOnlyRules);
assert.equal(pinkAgainstStalePinkOnly.status, 'matched', 'Seller SKU สีชมพู may keep the pink internal mapping');
assert.equal(pinkAgainstStalePinkOnly.rule?.shortName, 'เด้งชม1ลัง');

assert.ok(parseShopeePositionedItems, 'Shopee must have a deterministic positioned-column parser');
const shopee3 = parseShopeePositionedItems(shopeeThreeSkuPositioned, 3);
assert.deepEqual([...shopee3.items].map(item => item.qty), [1, 1, 1], 'Shopee row Qty must come from the Qty column, never row numbers/footer total');
assert.equal(shopee3.items.length, 3);
assert.equal(hasQtyWarning(shopee3.items, 3, shopee3.parserWarning), false);
assert.match(shopee3.items[0].text, /HAKU Cooling/i, 'row 1 must keep its own product identity');
assert.doesNotMatch(shopee3.items[0].text, /EXCARE|Value Pack/i, 'row 1 must not absorb the next SKU');
assert.match(shopee3.items[1].text, /EXCARE MAKEUP REMOVER/i, 'row 2 must keep EXCARE identity');
assert.doesNotMatch(shopee3.items[1].text, /Value Pack/i, 'row 2 must not absorb row 3 Value Pack');
assert.match(shopee3.items[2].text, /Value Pack 5/i, 'row 3 must keep Value Pack 5');
assert.doesNotMatch(shopee3.items[2].text, /EXCARE/i, 'row 3 must not contain the previous SKU');
const value5 = matchSkuRule(shopee3.items[2].text, productionRuleSubset);
assert.equal(value5.status, 'matched');
assert.equal(value5.rule?.shortName, 'HOYA Value 5', 'Value Pack 5 Qty 1 must remain Value 5, not become Value 10');

const bundle = parseShopeePositionedItems(shopeeFivePlusFiveQtyTwo, 2);
assert.equal(bundle.items.length, 1, 'Shopee 5+5 order must parse as one SKU');
assert.equal(bundle.items[0].qty, 2, 'Shopee 5+5 order Qty must come from Qty column');
const bundleMatch = matchSkuRule(bundle.items[0].text, productionRuleSubset);
assert.equal(bundleMatch.status, 'matched', '5+5 bundle must match the bundle rule, not generic HOYA baby 5');
assert.equal(bundleMatch.rule?.shortName, 'เด้งม่วง5 ชม5', '5+5 bundle must preserve both internal components');
assert.equal(
  getAggregatedShortName(bundleMatch.rule.shortName, bundle.items[0].qty, bundleMatch.rule.keyword),
  'เด้งม่วง10 ชม10',
  'Qty 2 of a 5+5 bundle must aggregate both component quantities'
);

for (const sample of shopeeQtyCases) {
  assert.notEqual(sample.packSize, sample.orderQty, 'fixture must keep pack size separate from order qty');
}
assert.equal(parseExplicitTotalQty('Qty Total: 3 Order ID: X', 'TIKTOK'), 3);

assert.equal(getAggregatedShortName('Hoya V2 ฮากุ 1 ลัง', 2), 'Hoya V2 ฮากุ 2 ลัง');
assert.equal(getAggregatedShortName('95 1 1', 2), '95 1 2');

console.log('PackMaster smart matcher regression tests passed');