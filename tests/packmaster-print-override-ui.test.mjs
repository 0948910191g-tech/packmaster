import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /<script src="\.\/packmaster-print-scope\.js"><\/script>/);
assert.match(html, /const printScopeApi = window\.PackMasterPrintScope;/);
assert.match(html, /printScopeMode/);
assert.match(html, /selectPrintOrders\(/);
assert.match(html, /READY_ONLY/);
assert.match(html, /FULL_BATCH/);
assert.match(html, /พิมพ์เฉพาะรายการพร้อม|พิมพ์ Ready/);
assert.match(html, /Save Ready PDF/);
assert.match(html, /พิมพ์ทั้ง Batch/);
assert.match(html, /Save PDF ทั้ง Batch/);
assert.match(html, /window\.confirm\(/, 'full-batch override must require explicit confirmation');
assert.match(html, /PrintScopedOrders\.map\(/, 'browser print output must follow selected print scope');
assert.match(html, /ordersToExport/, 'PDF export must iterate an explicit selected scope');
assert.match(html, /mode === ['"]FULL_BATCH['"] && !printBlocked/, 'only a clean full-batch print may mark the batch completed');

console.log('PackMaster print override UI contract passed');
