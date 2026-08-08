import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /const \[exceptionMode, setExceptionMode\] = useState\(false\)/, 'Review must expose presentation-only Exception Mode state');
assert.match(html, /exceptionOrderIds/, 'Exception Mode must derive order IDs from existing exception rows');
assert.match(html, /ReviewDisplayOrders/, 'Review must expose a presentation-only derived display list');
assert.match(html, /data-pm-exception-mode/, 'Exception Mode banner/marker must exist');
assert.match(html, /ออกจากโหมดตรวจปัญหา/, 'Exception Mode must be explicitly dismissible');
assert.match(html, /data-pm-review-action-bar/, 'Review sticky completion action bar must exist');
assert.match(html, /แก้ .*รายการ/, 'Sticky Review action must guide unresolved work');
assert.match(html, /พร้อมพิมพ์/, 'Sticky Review action must expose ready state');

// Critical scope invariant: presentation filters/modes must not change full-Batch export/print.
assert.match(html, /for \(let i = 0; i < MappedOrders\.length; i\+\+\)/, 'Save PDF must still iterate all MappedOrders');
assert.match(html, /MappedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Print area must still render all MappedOrders');
assert.equal(/MappedOrders\s*=\s*ReviewDisplayOrders/.test(html), false, 'Exception Mode must never replace full-Batch MappedOrders');

console.log('PackMaster Review Exception Mode contract passed');
