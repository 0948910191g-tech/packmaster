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
  joinPositionedText,
  parseTikTokPositionedItems,
  parseShopeePositionedItems: typeof parseShopeePositionedItems === 'function' ? parseShopeePositionedItems : null,
  findContinuationTargetOrder: typeof findContinuationTargetOrder === 'function' ? findContinuationTargetOrder : null,
  migrateSkuRulesToPlatformScopes: typeof migrateSkuRulesToPlatformScopes === 'function' ? migrateSkuRulesToPlatformScopes : null,
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
  joinPositionedText,
  parseTikTokPositionedItems,
  parseShopeePositionedItems,
  migrateSkuRulesToPlatformScopes,
  hasQtyWarning,
  getAggregatedShortName
} = context.__packmasterSmart;

assert.equal(normalizeMatchText('ฮากุเบบี้-ยกลัง36ห\uF70Aอ'), normalizeMatchText('ฮากุเบบี้-ยกลัง36ห่อ'));

assert.equal(matchSkuRule('Hoya Baby Wipes Value Pack 5 ห่อ', rules).rule?.id, 2, 'Value Pack must beat normal HOYA');
assert.equal(matchSkuRule('Hoya Baby Wipes Plus 5 ห่อ', rules).rule?.id, 3, 'Plus must beat normal HOYA');
assert.equal(matchSkuRule('Haku Cooling 1 ห่อ', rules).rule?.id, 4, 'Cooling 1 must not become Cooling 3');
assert.equal(matchSkuRule('Haku Cooling 3 ห่อ', rules).rule?.id, 5, 'Cooling 3 must match its own pack size');
assert.equal(matchSkuRule('Haku Extra Cooling 3 ห่อ', rules).rule?.id, 6, 'Extra Cooling must beat Cooling');

const platformScopedRules = [
  { id: 'tt-menthol', platform: 'TIKTOK', keyword: 'HAKU Cooling Menthol 1 ห่อ', shortName: 'TikTok Menthol 1' },
  { id: 'sp-menthol', platform: 'SHOPEE', keyword: 'HAKU Cooling Menthol 1 ห่อ', shortName: 'Shopee Menthol 1' }
];
const tiktokScopedMatch = matchSkuRule('HAKU Cooling Menthol 1 ห่อ', platformScopedRules, 'TIKTOK');
assert.equal(tiktokScopedMatch.status, 'matched', 'TikTok must match only TikTok-scoped SKU rules');
assert.equal(tiktokScopedMatch.rule?.shortName, 'TikTok Menthol 1');
const shopeeScopedMatch = matchSkuRule('HAKU Cooling Menthol 1 ห่อ', platformScopedRules, 'SHOPEE');
assert.equal(shopeeScopedMatch.status, 'matched', 'Shopee must match only Shopee-scoped SKU rules');
assert.equal(shopeeScopedMatch.rule?.shortName, 'Shopee Menthol 1');
assert.equal(
  matchSkuRule('HAKU Cooling Menthol 1 ห่อ', [platformScopedRules[0]], 'SHOPEE').status,
  'unmatched',
  'TikTok-only rules must never auto-match a Shopee order'
);

assert.equal(typeof migrateSkuRulesToPlatformScopes, 'function');
const migratedLegacyRules = migrateSkuRulesToPlatformScopes([
  { id: 'legacy-1', keyword: 'HAKU Cooling Menthol 1 ห่อ', shortName: 'Menthol 1' }
], 'legacy-test');
assert.deepEqual(
  Array.from(migratedLegacyRules, rule => rule.platform).sort(),
  ['SHOPEE', 'TIKTOK'],
  'legacy shared rules must be copied into independent platform scopes during migration'
);
assert.equal(new Set(Array.from(migratedLegacyRules, rule => String(rule.id))).size, 2, 'migrated platform copies need distinct IDs');

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

// 2026-10-19 real PDF regression: PDF.js can emit TikTok table labels and product text one character at a time.
// Structural labels still need to be detected, real word spaces need to survive, and footer rows must stay outside the SKU.
let splitIndex = 1000;
const splitPdfText = (text, startX, y, step = 5) => {
  let x = startX;
  let pendingSpace = false;
  const items = [];
  for (const character of text) {
    if (/\s/.test(character)) {
      pendingSpace = true;
      x += step;
      continue;
    }
    items.push({ text: character, x, y, index: splitIndex++, spaceBefore: pendingSpace });
    pendingSpace = false;
    x += step;
  }
  return items;
};

const tikTokCharacterSplit = [
  ...splitPdfText('Product Name', 6, 220, 5),
  ...splitPdfText('SKU', 128, 220, 7),
  ...splitPdfText('Seller SKU', 170, 220, 7),
  ...splitPdfText('Qty', 261, 220, 7),
  ...splitPdfText('Huga Kids Hygiene Wipes 30', 6, 190, 4),
  ...splitPdfText('ค่าเริ่มต้น', 128, 190, 3),
  ...splitPdfText('HUGA KIDS 30', 170, 190, 5),
  { text: '1', x: 265, y: 190, index: splitIndex++, spaceBefore: true },
  ...splitPdfText('Qty Total: 1', 210, 135, 5),
  ...splitPdfText('Order ID: TEST-TIKTOK-ORDER-CHAR-SPLIT', 6, 104, 4)
];
const characterSplitTikTok = parseTikTokPositionedItems(tikTokCharacterSplit, 1);
assert.equal(characterSplitTikTok.parserWarning, false, 'character-split TikTok table must parse without warning');
assert.equal(characterSplitTikTok.items.length, 1, 'character-split TikTok table must produce exactly one SKU row');
assert.equal(characterSplitTikTok.items[0].qty, 1);
assert.match(characterSplitTikTok.items[0].text, /Huga Kids Hygiene Wipes 30/i, 'real word spaces must survive PDF.js character splitting');
assert.doesNotMatch(characterSplitTikTok.items[0].text, /Qty\s*Total|Order\s*ID/i, 'character-split footer must not leak into the SKU row');

const characterSplitSignalText = joinPositionedText(tikTokCharacterSplit);
assert.match(characterSplitSignalText, /Product Name/i, 'reconstructed PDF signal text must restore split Product Name');
assert.match(characterSplitSignalText, /Seller SKU/i, 'reconstructed PDF signal text must restore split Seller SKU');
assert.match(characterSplitSignalText, /Qty Total:\s*1/i, 'reconstructed PDF signal text must restore split Qty Total');
assert.match(characterSplitSignalText, /Order ID:\s*TEST-TIKTOK-ORDER-CHAR-SPLIT/i, 'reconstructed PDF signal text must restore split Order ID');
assert.ok(
  html.includes('const pdfSignalText = `${fullText} ${joinPositionedText(positionedItems)}`;'),
  'upload flow must combine raw PDF text with reconstructed positioned text for platform/metadata detection'
);
assert.ok(
  html.includes('const declaredTotalQty = parseExplicitTotalQty(pdfSignalText, platform);'),
  'TikTok Qty Total detection must use reconstructed PDF signal text'
);
assert.ok(
  html.includes('let orderMatch = pdfSignalText.match(/(?:Shopee\\s*Order\\s*No\\.?|Order\\s*ID)'),
  'Order ID detection must use reconstructed PDF signal text'
);
assert.ok(
  html.includes('TH[A-Z0-9]{10,}'),
  'TikTok TH-prefixed tracking codes must accept the alphanumeric format emitted by real labels'
);

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
// In that case structured matching finds no strong purple alternative and the old exact path fell back to pink.
// Seller SKU color conflict must fail closed into Review instead of printing the wrong internal SKU.
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

// A genuinely seller-specific pink rule must still work. Do not weaken the existing PLUS guard to rescue broad rules.
const sellerSpecificPinkRules = [
  { id: 'pink-seller-specific', keyword: 'HOYA BB สีชมพู', shortName: 'เด้งชม1ลัง' }
];
const pinkAgainstSellerSpecificRule = matchSkuRule(pink24TikTokSource, sellerSpecificPinkRules);
assert.equal(pinkAgainstSellerSpecificRule.status, 'ambiguous', 'Seller-specific color without the product PLUS identity must fail closed instead of weakening the existing PLUS guard');
assert.equal(pinkAgainstSellerSpecificRule.rule, null);

// 2026-08-27 Matcher Safety Reset: brand identity is authoritative and generic similarity must fail closed.
const hakuBaby12Rule = { id: 'haku-baby-12', keyword: 'HAKU Baby 12', shortName: 'ฮากุ12' };
const wrongCrossBrand12 = matchSkuRule(
  'HOYA Wet Baby Wipes 12 แผ่น 12 ห่อ',
  [hakuBaby12Rule]
);
assert.equal(
  wrongCrossBrand12.status,
  'unmatched',
  'HOYA source must never auto-match a HAKU rule just because Baby + 12 + pack context overlaps'
);
assert.equal(wrongCrossBrand12.rule, null, 'cross-brand candidate must never be returned for printing');

const correctHaku12 = matchSkuRule('HAKU Baby Wipes 12 ห่อ', [hakuBaby12Rule]);
assert.equal(correctHaku12.status, 'matched', 'the brand gate must preserve a correct HAKU Baby 12 mapping');
assert.equal(correctHaku12.rule?.shortName, 'ฮากุ12');

const sheetOnly12 = matchSkuRule('HAKU Baby 12 แผ่น', [hakuBaby12Rule]);
assert.equal(sheetOnly12.status, 'unmatched', '12 sheets must never satisfy a 12-pack identity');
assert.equal(sheetOnly12.rule, null);

const genericBaby12Rule = { id: 'generic-baby-12', keyword: 'Baby 12', shortName: 'generic12' };
const genericNumberOnly = matchSkuRule('NEWCO Wet Wipes Baby 12 ห่อ', [genericBaby12Rule]);
assert.equal(
  genericNumberOnly.status,
  'unmatched',
  'generic Baby + number similarity without a brand or strong discriminator must remain unmapped'
);
assert.equal(genericNumberOnly.rule, null);

const modelRule = { id: 'hoya-v2', keyword: 'HOYA V2', shortName: 'HOYA V2' };
const modelResult = matchSkuRule('HOYA V2 5 ห่อ', [modelRule]);
assert.equal(modelResult.status, 'matched', 'model number V2 is product identity and must not be treated as pack quantity');
assert.equal(modelResult.rule?.shortName, 'HOYA V2');

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

// Multi-page TikTok footer isolation: footer lines (Qty Total / Order ID) must not leak into the last SKU row or create fake rows.
const tikTokPage2WithFooter = [
  ...tikTokContinuationPage2,
  { text: 'Qty Total:', x: 210, y: 92.0, index: 100 },
  { text: '3', x: 265, y: 92.0, index: 101 },
  { text: 'Order ID: TEST-TIKTOK-ORDER-001', x: 6, y: 92.0, index: 102 }
];
const t2WithFooter = parseTikTokPositionedItems(tikTokPage2WithFooter, 3);
assert.equal(t2WithFooter.parserWarning, false, 'TikTok footer total must not trigger parserWarning');
assert.equal(t2WithFooter.items.length, 2, 'TikTok footer total in Qty column must not create a 3rd fake SKU row');
assert.equal(
  t2WithFooter.items.some(item => /Qty\s*Total|Order\s*ID|TEST-TIKTOK-ORDER-001/i.test(item.text)),
  false,
  'TikTok footer text must not leak into the last parsed SKU row'
);

// Multi-page TikTok continuation target resolution when Page 1 has no footer Order ID yet.
assert.equal(typeof context.__packmasterSmart.findContinuationTargetOrder, 'function', 'findContinuationTargetOrder helper must be exposed');
const simulatedOrders = [
  {
    id: 'page-1',
    tracking: 'TH1234567890',
    parsedItems: [...t1.items],
    sourceFileName: 'tiktok-multi.pdf',
    sourcePage: 1,
    platform: 'TIKTOK',
    orderId: null,
    declaredTotalQty: null,
    parserWarning: false
  }
];
const targetOrder = context.__packmasterSmart.findContinuationTargetOrder(simulatedOrders, {
  fileName: 'tiktok-multi.pdf',
  platform: 'TIKTOK',
  currentOrderId: 'TEST-TIKTOK-ORDER-001',
  hasTracking: false,
  hasTableContent: true
});
assert.equal(targetOrder?.id, 'page-1', 'TikTok continuation page without tracking must link to preceding unfinished TikTok main order in the same file');

const crossFileOrder = context.__packmasterSmart.findContinuationTargetOrder([
  {
    id: 'other-file-order',
    tracking: 'TH1111111111',
    parsedItems: [...t1.items],
    sourceFileName: 'file-a.pdf',
    sourcePage: 1,
    platform: 'TIKTOK',
    orderId: 'TEST-TIKTOK-ORDER-001',
    declaredTotalQty: null,
    parserWarning: false
  }
], {
  fileName: 'file-b.pdf',
  platform: 'TIKTOK',
  currentOrderId: 'TEST-TIKTOK-ORDER-001',
  hasTracking: false,
  hasTableContent: true
});
assert.equal(crossFileOrder, null, 'findContinuationTargetOrder must not merge pages across different PDF files');

assert.ok(
  html.includes('const hasShopeeOrderSignal = /Shopee\\s*Order\\s*No/i.test(pdfSignalText);'),
  'Shopee Order No signal must prevent false TikTok classification when Seller SKU / Qty Total text appears'
);

// Real PDF shadow corpus: wrong auto-match count must be strictly 0 across all real failure cases.
const shadowCorpus = [
  { text: 'แพ็ค3ห่อ HOYA Baby Wipes ทิชชู่เปียกสูตรน้ำบริสุทธิ์ 99.9% 80 แผ่น สำหรับผิวบอบบาง', rules: productionRuleSubset, expectedShortName: 'เด้งม่วง3' },
  { text: 'Gift Set วันแม่ HAKU Cooling (ฮากุ ผ้าเปียกติดแอร์) กลิ่นมะลิ 12 ห่อ พร้อมกระเป๋าของขวัญ', rules: productionRuleSubset, expectedShortName: 'เย็นเขียว 12' },
  { text: 'HAKU Cooling LAVENDER 6 ห่อ', rules: productionRuleSubset, expectedShortName: null },
  { text: purple24TikTokSource, rules: purple24RulesWithStaleSharedMapping, expectedShortName: 'เด้งม่วง1ลัง' },
  { text: purple24TikTokSource, rules: stalePinkOnlyRules, expectedShortName: null },
  { text: 'HOYA Wet Baby Wipes 12 แผ่น 12 ห่อ', rules: [hakuBaby12Rule], expectedShortName: null },
  { text: 'HAKU Baby 12 แผ่น', rules: [hakuBaby12Rule], expectedShortName: null },
  { text: 'NEWCO Wet Wipes Baby 12 ห่อ', rules: [genericBaby12Rule], expectedShortName: null }
];
const wrongMatches = shadowCorpus.filter(entry => {
  const result = matchSkuRule(entry.text, entry.rules);
  if (result.status !== 'matched') return false;
  return result.rule?.shortName !== entry.expectedShortName;
});
assert.equal(wrongMatches.length, 0, 'Real PDF shadow corpus must have 0 wrong auto-matches');

assert.equal(getAggregatedShortName('Hoya V2 ฮากุ 1 ลัง', 2), 'Hoya V2 ฮากุ 2 ลัง');
assert.equal(getAggregatedShortName('95 1 1', 2), '95 1 2');

console.log('PackMaster smart matcher regression tests passed');