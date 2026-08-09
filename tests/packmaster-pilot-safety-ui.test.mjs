import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const mustInclude = (needle, message) => assert.ok(html.includes(needle), message || `Missing UI safety marker: ${needle}`);

test('review screen has a hard print safety gate', () => {
  mustInclude('<script src="./packmaster-pilot-safety.js"></script>');
  mustInclude('const pilotSafetyApi = window.PackMasterPilotSafety;');
  mustInclude('const printBlocked = pilotSafetyApi ? pilotSafetyApi.hasBlockingExceptions(exceptionRows) : exceptionRows.length > 0;');
  mustInclude("showToast(`ยังพิมพ์ไม่ได้ — แก้ Exception ให้ครบก่อน (${exceptionRows.length} รายการ)`, 'error');");
  mustInclude('disabled={exportStatus.active || orders.length === 0 || printBlocked}');
  mustInclude('disabled={orders.length === 0 || printBlocked}');
  mustInclude('แก้ Exception ให้ครบก่อนพิมพ์');
});

test('print and Save PDF remain full-batch operations after safety gate', () => {
  mustInclude('for (let i = 0; i < MappedOrders.length; i++)');
  mustInclude('{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}');
});

test('SKU/unmapped exception uses only safely resolved identity for inline Quick Mapping', () => {
  mustInclude('const handleFixSkuException = (row) => {');
  mustInclude("types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')");
  mustInclude('const seed = pilotSafetyApi.getSkuFixSeed(row, getMatchResult);');
  mustInclude('sourceText: seed');
  mustInclude("setQuickMapState({ open: true, row, keyword: seed, shortName: '', suggestions });");
  mustInclude('data-pm-quick-mapping');
  mustInclude('เปิดคลังคำศัพท์');
  mustInclude("setNewRule({ keyword: seed, shortName: String(quickMapState.shortName || '') });");
  mustInclude('ตั้งชื่อ SKU');
  assert.equal(/setQuickMapState\(\{[^}]*open:\s*true[^}]*shortName:\s*['"][^'"]+['"][^}]*\}\)/s.test(html), false, 'Pilot Safety must never auto-generate the internal short name');
});

test('batch status UI uses exception-first effective status and invalidates stale completed state', () => {
  mustInclude('const getEffectiveBatchStatus = (batch) => pilotSafetyApi ? pilotSafetyApi.getEffectiveBatchStatus(batch) : batch.status;');
  mustInclude('const statusUi = getBatchStatusUi(getEffectiveBatchStatus(batch));');
  mustInclude('const ui = getBatchStatusUi(getEffectiveBatchStatus(activeBatch));');
  mustInclude('printedAt: printBlocked ? null : activeBatch.printedAt');
});
