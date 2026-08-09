import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /const \[exceptionMode, setExceptionMode\] = useState\(false\)/, 'Review must expose presentation-only Exception Mode state');
assert.match(html, /exceptionOrderIds/, 'Exception Mode must derive order IDs from existing exception rows');
assert.match(html, /exceptionPriorityByOrderId/, 'Exception Mode must derive presentation ordering from existing exception rows');
assert.match(html, /REVIEW_QTY[^\n]*\? 0[^\n]*REVIEW_SKU[^\n]*\? 1/, 'Exception Mode priority must be Qty > SKU > Unmapped');
assert.match(html, /ReviewDisplayOrders/, 'Review must expose a presentation-only derived display list');
assert.match(html, /\.sort\(\(a, b\) =>/, 'Exception Mode display list must sort by exception priority without mutating MappedOrders');
assert.match(html, /data-pm-exception-mode/, 'Exception Mode banner/marker must exist');
assert.match(html, /ออกจากโหมดตรวจปัญหา/, 'Exception Mode must be explicitly dismissible');
assert.match(html, /data-pm-review-action-bar/, 'Review completion action bar must exist');
assert.match(html, /data-pm-review-action-dock/, 'Review completion action must expose a stable dock marker');
assert.match(html, /\.pm-review-action-wrap \{ position: static;/, 'Review completion action must stay in normal flow and never cover labels');
assert.doesNotMatch(html, /\.pm-review-action-wrap \{ position: fixed;/, 'Review action dock must not overlay content');
assert.match(html, /แก้ .*รายการ/, 'Review action must guide unresolved work');
assert.match(html, /พร้อมพิมพ์/, 'Review action must expose ready state');
assert.match(html, /<option value="REVIEW_QTY">Qty<\/option>/, 'Qty Exception filter must use the real exception type emitted by packmaster-exceptions.js');
assert.match(html, /<option value="REVIEW_SKU">SKU<\/option>/, 'SKU Exception filter must use the real exception type emitted by packmaster-exceptions.js');

// Critical scope invariant: presentation filters/modes must not change full-Batch export/print.
assert.match(html, /for \(let i = 0; i < MappedOrders\.length; i\+\+\)/, 'Save PDF must still iterate all MappedOrders');
assert.match(html, /MappedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Print area must still render all MappedOrders');
assert.equal(/MappedOrders\s*=\s*ReviewDisplayOrders/.test(html), false, 'Exception Mode must never replace full-Batch MappedOrders');

console.log('PackMaster Review Exception Mode contract passed');
