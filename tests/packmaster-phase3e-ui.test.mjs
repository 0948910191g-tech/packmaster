import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const requiredMarkers = [
  '<script src="./packmaster-storage-health.js"></script>',
  '<script src="./packmaster-diagnostics.js"></script>',
  'const storageHealthApi = window.PackMasterStorageHealth;',
  'const diagnosticsApi = window.PackMasterDiagnostics;',
  'PackMaster Pilot',
  'Storage Health',
  'ข้อมูลอยู่ใน Browser เครื่องนี้',
  'ล้างเฉพาะรูปสำหรับ Reprint',
  'ดาวน์โหลด Diagnostics',
  'storageHealthApi.cleanupArchivedReprintImages(batchApi, selectedArchivedBatchIds)',
  'diagnosticsApi.buildDiagnosticReport',
  'navigator.storage'
];
requiredMarkers.forEach((marker) => assert.ok(html.includes(marker), `missing Phase 3E-H UI marker: ${marker}`));

assert.ok(html.includes('for (let i = 0; i < MappedOrders.length; i++)'), 'Save PDF must keep full MappedOrders');
assert.ok(html.includes('{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Print area must keep full MappedOrders');

console.log('PackMaster Phase 3E-H UI guard passed');
