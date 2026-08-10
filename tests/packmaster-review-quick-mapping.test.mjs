import fs from 'node:fs';
import assert from 'node:assert/strict';

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
assert.match(html, /บันทึกเป็น Mapping และใช้/, 'persistent shared mapping must be a separate explicit action');
assert.match(html, /pm-internal-name-options/, 'Quick Mapping must expose searchable existing internal-name choices');
assert.match(html, /getUniqueInternalNames\(skuRules\)/, 'internal-name choices must come from the current SKU Library');
assert.match(html, /ยังตั้งชื่อเฉพาะ Order นี้ได้/, 'no Keyword suggestion state must not block manual completion');
assert.match(html, /เปิดคลังคำศัพท์/, 'Quick Mapping must preserve advanced SKU Library fallback');
assert.match(html, /REVIEW_SKU.*UNMAPPED|UNMAPPED.*REVIEW_SKU/s, 'Quick Mapping action must stay limited to SKU/Unmapped exceptions');
assert.equal(/setQuickMapState\(\{[^}]*open:\s*true[^}]*shortName:\s*['"][^'"]+['"][^}]*\}\)/s.test(html), false, 'Quick Mapping must not auto-generate an internal short name');

const applyStart = html.indexOf('const handleApplyQuickOrderName');
const persistentStart = html.indexOf('const handleSaveQuickMapping');
assert.ok(applyStart >= 0 && persistentStart > applyStart, 'order-only handler must be defined before persistent mapping handler');
const applyBody = html.slice(applyStart, persistentStart);
assert.doesNotMatch(applyBody, /saveSkuRule\(/, 'using a name for one order must never create a shared SKU rule');

console.log('PackMaster safe Quick Mapping contract passed');
