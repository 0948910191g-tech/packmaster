import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /<script src="\.\/packmaster-print-scope\.js"><\/script>/);
assert.match(html, /const printScopeApi = window\.PackMasterPrintScope;/);
assert.match(html, /printScopeMode/);
assert.match(html, /selectPrintOrders\(/);
assert.match(html, /READY_ONLY/);
assert.match(html, /FULL_BATCH/);
assert.doesNotMatch(html, /พิมพ์เฉพาะรายการพร้อม|พิมพ์ Ready/);
assert.doesNotMatch(html, /Save Ready PDF/);
assert.match(html, /handlePrint\('FULL_BATCH'/, 'full-batch print is directly available');
assert.match(html, /handleExportPDF\('FULL_BATCH'/, 'full-batch PDF export is directly available');
assert.doesNotMatch(html, /handleEmergencyPrint|printBlocked/, 'legacy print guard controls must be removed');
assert.match(html, /PrintScopedOrders\.map\(/, 'browser print output must follow selected print scope');
assert.match(html, /ordersToExport/, 'PDF export must iterate an explicit selected scope');
assert.match(html, /mode === ['"]FULL_BATCH['"]/, 'full-batch print may mark the batch completed');

const exportStart = html.indexOf("const handleExportPDF = async (mode = 'FULL_BATCH') => {");
const exportEnd = html.indexOf('const handleExportRules = () => {', exportStart);
assert.ok(exportStart >= 0 && exportEnd > exportStart, 'handleExportPDF block must exist');
const exportBlock = html.slice(exportStart, exportEnd);
const declarationIndex = exportBlock.indexOf('const ordersToExport =');
const firstLengthUseIndex = exportBlock.indexOf('ordersToExport.length');
assert.ok(declarationIndex >= 0, 'ordersToExport must be declared');
assert.ok(firstLengthUseIndex > declarationIndex, 'ordersToExport must be declared before any .length read');

console.log('PackMaster print override UI contract passed');
