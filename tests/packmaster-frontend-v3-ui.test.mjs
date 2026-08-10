import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const requiredMarkers = [
  'data-pm-shell="v3"',
  'data-pm-view="batches"',
  'data-pm-view="upload"',
  'data-pm-view="sku"',
  'data-pm-view="review"',
  'data-pm-view="safety"',
  'data-pm-action="create-batch"',
  'data-pm-action="upload-pdf"',
  'data-pm-action="print"',
  'data-pm-action="save-pdf"',
  'data-pm-action="workspace-backup"'
];

for (const marker of requiredMarkers) {
  assert.ok(html.includes(marker), `Frontend V3 marker missing: ${marker}`);
}

for (const label of ['งานแพ็ก', 'อัปโหลด', 'คลังคำศัพท์', 'รีวิว & พิมพ์', 'สำรองข้อมูล']) {
  assert.ok(html.includes(label), `Frontend V3 navigation label missing: ${label}`);
}

for (const wiring of [
  'onClick={handleCreateBatch}',
  'handleOpenBatch(batch)',
  'handleArchiveBatch(batch)',
  'handleRestoreArchivedBatch(batch)',
  'handleWorkspaceBackup',
  'handleWorkspaceRestoreFile',
  'handleExportPDF'
]) {
  assert.ok(html.includes(wiring), `Expected real handler wiring missing: ${wiring}`);
}

for (const uploadText of ['Upload & Processing', 'เลือก Batch', 'อัปโหลดไฟล์', 'อ่าน PDF', 'จับคู่ SKU', 'พร้อมรีวิว']) {
  assert.ok(html.includes(uploadText), `Upload workflow text missing: ${uploadText}`);
}

for (const skuText of ['เพิ่ม / แก้ไขกฎ', 'ค้นหา / กรองกฎ', 'นำเข้า', 'ส่งออก']) {
  assert.ok(html.includes(skuText), `SKU workspace text missing: ${skuText}`);
}

for (const reviewText of ['ตรวจสอบ SKU', 'ตรวจสอบ Qty', 'ยังไม่ตั้งชื่อ']) {
  assert.ok(html.includes(reviewText), `Review status missing: ${reviewText}`);
}

for (const safetyText of ['ความปลอดภัย Workspace', 'Storage Health', 'Diagnostics']) {
  assert.ok(html.includes(safetyText), `Safety UI text missing: ${safetyText}`);
}

assert.ok(html.includes('PackMaster Frontend V3'), 'Frontend V3 build marker missing');
assert.match(html, /for \(let i = 0; i < ordersToExport\.length; i\+\+\)/, 'Save PDF must iterate the explicit user-selected output scope');
assert.ok(html.includes('PrintScopedOrders.map((order) => (<LabelCard'), 'Print area must render the explicit user-selected output scope');
assert.ok(html.includes("'READY_ONLY'"), 'Frontend V3 Review must expose ready-only output');
assert.ok(html.includes("'FULL_BATCH'"), 'Frontend V3 Review must preserve full-batch output');
assert.ok(html.includes("const DB_VERSION = 1") === false, 'Frontend index must not define or migrate IndexedDB DB_VERSION');

console.log('PackMaster Frontend V3 UI contract passed');
