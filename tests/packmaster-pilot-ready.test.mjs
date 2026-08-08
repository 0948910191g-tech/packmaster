import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const requiredDocs = [
  'docs/PILOT_CHECKLIST.md',
  'docs/RECOVERY_GUIDE.md',
  'docs/PRIVACY_LOCAL_DATA.md'
];
requiredDocs.forEach((relative) => assert.ok(fs.existsSync(path.join(root, relative)), `${relative} must exist`));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const markers = [
  '<script src="./packmaster-storage-health.js"></script>',
  '<script src="./packmaster-diagnostics.js"></script>',
  'Storage Health',
  'ล้างเฉพาะรูปสำหรับ Reprint',
  'ดาวน์โหลด Diagnostics',
  'ข้อมูลอยู่ใน Browser เครื่องนี้',
  'PackMaster Pilot',
  'navigator.storage'
];
markers.forEach((marker) => assert.ok(html.includes(marker), `missing pilot-ready UI marker: ${marker}`));

assert.ok(html.includes('for (let i = 0; i < MappedOrders.length; i++)'), 'Save PDF must keep full MappedOrders');
assert.ok(html.includes('{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Print area must keep full MappedOrders');

for (const relative of requiredDocs) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.ok(text.length > 300, `${relative} must contain actionable guidance`);
}

console.log('PackMaster pilot readiness guard tests passed');
