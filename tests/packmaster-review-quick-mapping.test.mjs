import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-quick-mapping/, 'Review must expose inline Quick Mapping UI');
assert.match(html, /pilotSafetyApi\.getSkuFixSeed\(row, getMatchResult\)/, 'Quick Mapping must reuse Pilot Safety safe SKU seed');
assert.match(html, /quickMapState/, 'Quick Mapping must keep local presentation state');
assert.match(html, /บันทึกและใช้/, 'Quick Mapping must expose explicit save action');
assert.match(html, /เปิดคลังคำศัพท์/, 'Quick Mapping must preserve advanced SKU Library fallback');
assert.match(html, /shortName/, 'Quick Mapping must preserve existing keyword/shortName rule shape');
assert.match(html, /!.*shortName.*trim\(\)/s, 'Quick Mapping must reject empty internal short names before save');
assert.match(html, /SKU.*UNMAPPED|UNMAPPED.*SKU/s, 'Quick Mapping action must stay limited to SKU/Unmapped exception paths');
assert.equal(/quickMapState[^\n]*shortName:\s*['"][^'"]+['"]/.test(html), false, 'Quick Mapping must not auto-generate an internal short name');

console.log('PackMaster inline Quick Mapping contract passed');
