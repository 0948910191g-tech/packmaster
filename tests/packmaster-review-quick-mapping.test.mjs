import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-quick-mapping/, 'Review must expose inline Quick Mapping UI');
assert.match(html, /<script src="\.\/packmaster-review-overrides\.js"><\/script>/, 'Review must load the per-order override helper');
assert.match(html, /const reviewOverridesApi = window\.PackMasterReviewOverrides;/);
assert.match(html, /pilotSafetyApi\.getSkuFixSeed\(row, getMatchResult\)/, 'Quick Mapping must reuse Pilot Safety safe SKU seed');
assert.match(html, /sourceText:\s*seed/, 'Quick Mapping must preserve the unresolved item identity');
assert.match(html, /keyword:\s*''/, 'Quick Mapping must not auto-select a suggested Keyword');
assert.match(html, /handleApplyQuickOrderName/, 'Quick Mapping must have an order-only apply action');
assert.match(html, /upsertManualSkuOverride\(/, 'order-only apply must persist a local order override');
assert.match(html, /ใช้กับ Order นี้/, 'Quick Mapping must expose the safe default action');
assert.match(html, /บันทึกชื่อในทะเบียน \(เฉพาะ SKU ที่ระบุตัวได้\)/, 'persistent SKU assignment must be a separate explicit action');
assert.match(html, /pm-internal-name-options/, 'Quick Mapping must expose searchable existing internal-name choices');
assert.match(html, /getUniqueInternalNames\(skuRules\)/, 'internal-name choices must come from the current SKU Library');
assert.match(html, /ยังตั้งชื่อเฉพาะ Order นี้ได้/, 'no Keyword suggestion state must not block manual completion');
assert.match(html, /เปิดทะเบียนสินค้า/, 'Quick Mapping must link to the registry');
assert.match(html, /REVIEW_SKU.*UNMAPPED|UNMAPPED.*REVIEW_SKU/s, 'Quick Mapping action must stay limited to SKU/Unmapped exceptions');
assert.equal(/setQuickMapState\(\{[^}]*open:\s*true[^}]*shortName:\s*['"][^'"]+['"][^}]*\}\)/s.test(html), false, 'Quick Mapping must not auto-generate an internal short name');

const applyStart = html.indexOf('const handleApplyQuickOrderName');
const persistentStart = html.indexOf('const handleSaveQuickMapping');
assert.ok(applyStart >= 0 && persistentStart > applyStart, 'order-only handler must be defined before persistent mapping handler');
const applyBody = html.slice(applyStart, persistentStart);
assert.doesNotMatch(applyBody, /saveSkuRule\(/, 'using a name for one order must never create a shared SKU rule');

console.log('PackMaster safe Quick Mapping contract passed');

const helper = await import('../packmaster-review-overrides.js');
const reviewApi = helper.default || helper;
const selector = html.slice(html.indexOf('const getReviewSourceText ='), html.indexOf('const getReviewKeywordSuggestions =')) +
  '\nglobalThis.selectText = getReviewSourceText; globalThis.selectIndex = getReviewSourceItemIndex;';
for (const cloudMode of [false, true]) {
  const order = { platform: 'SHOPEE', parsedItems: [{ text: 'FIRST', qty: 1 }, { text: 'SECOND', qty: 1 }] };
  const named = reviewApi.upsertManualSkuOverride(order, 'FIRST', 'Verified', 0);
  const context = { cloudMode, reviewOverridesApi: reviewApi, getMatchResult: () => ({ status: 'unmatched' }) };
  vm.createContext(context);
  vm.runInContext(selector, context);
  const row = { types: ['UNMAPPED'], order: named };
  assert.equal(context.selectText(row), 'SECOND', `Review must advance in ${cloudMode ? 'Cloud' : 'Local'}`);
  assert.equal(context.selectIndex(row, 'SECOND'), 1);
}
{
  const order = { platform: 'SHOPEE', parsedItems: [{ text: 'DUPLICATE' }, { text: 'DUPLICATE' }] };
  const named = reviewApi.upsertManualSkuOverride(order, 'DUPLICATE', 'First row', 0);
  const context = { cloudMode: true, reviewOverridesApi: reviewApi, getMatchResult: () => ({ status: 'unmatched' }) };
  vm.createContext(context);
  vm.runInContext(selector, context);
  const row = { types: ['UNMAPPED'], order: named };
  assert.equal(context.selectText(row), 'DUPLICATE');
  assert.equal(context.selectIndex(row, 'DUPLICATE'), 1, 'duplicate text must select the still-unresolved row identity');
}
