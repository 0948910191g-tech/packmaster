import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const requiredDocs = [
  'docs/PILOT_CHECKLIST.md',
  'docs/RECOVERY_GUIDE.md',
  'docs/PRIVACY_LOCAL_DATA.md',
  'docs/PILOT_SAMPLE_DATA.json'
];
requiredDocs.forEach((relative) => assert.ok(fs.existsSync(path.join(root, relative)), `${relative} must exist`));
assert.ok(fs.existsSync(path.join(root, '.github/workflows/production-smoke.yml')), 'production smoke workflow must exist');

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

assert.ok(html.includes('for (let i = 0; i < ordersToExport.length; i++)'), 'Save PDF must use the explicit output scope');
assert.ok(html.includes('{PrintScopedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Print area must use the explicit output scope');

for (const relative of requiredDocs.slice(0, 3)) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.ok(text.length > 300, `${relative} must contain actionable guidance`);
}

const sample = JSON.parse(fs.readFileSync(path.join(root, 'docs/PILOT_SAMPLE_DATA.json'), 'utf8'));
const serializedSample = JSON.stringify(sample);
assert.equal(sample.schema, 'packmaster-pilot-sample');
assert.equal(/\b0\d{8,9}\b/.test(serializedSample), false, 'sample must not contain Thai phone-like values');
assert.equal(serializedSample.includes('data:image'), false, 'sample must not contain PDF/image payloads');
assert.equal(serializedSample.includes('customer'), false, 'sample should not contain customer PII fields');

console.log('PackMaster pilot readiness guard tests passed');
