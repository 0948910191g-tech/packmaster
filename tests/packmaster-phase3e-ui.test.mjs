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
  'storageHealthApi.cleanupArchivedReprintImages(batchApi, selectedArchivedBatchIds, (meta) => archiveApi ? archiveApi.isArchived(meta.id, meta.archivedAt || null) : Boolean(meta.archivedAt))',
  'diagnosticsApi.buildDiagnosticReport',
  'batches: batches.map(batch => ({ ...batch, archivedAt: getBatchArchivedAt(batch) }))',
  'navigator.storage'
];
requiredMarkers.forEach((marker) => assert.ok(html.includes(marker), `missing Phase 3E-H UI marker: ${marker}`));

assert.ok(html.includes('for (let i = 0; i < ordersToExport.length; i++)'));
assert.ok(html.includes('{PrintScopedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'));
console.log('PackMaster Phase 3E-H sidecar-aware UI guard passed');
