import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const required = [
  '<script src="./packmaster-duplicate.js"></script>',
  'const duplicateApi = window.PackMasterDuplicate;',
  'duplicateApi.hashFile(file)',
  'duplicateApi.getKnownFingerprints(activeBatchId, orders.length > 0 ? (activeBatch?.sourceFiles || []) : [])',
  'duplicateApi.findExactFileDuplicate(fileHash, knownFingerprints)',
  'duplicateApi.findOrderDuplicateSignals(allNewOrders, orders)',
  'duplicateApi.appendBatchFingerprints(activeBatchId, acceptedSourceFiles)',
  'พบไฟล์ PDF ที่เคยนำเข้า Batch นี้แล้ว',
  'พบ Order ที่อาจซ้ำกับข้อมูลใน Batch นี้'
];

required.forEach((marker) => assert.ok(html.includes(marker), `missing Phase 3B marker: ${marker}`));

assert.equal(
  html.includes('sourceFiles: [...(Array.isArray(activeBatch.sourceFiles)'),
  false,
  'Phase 3B must not write new fingerprint metadata into IndexedDB Batch metadata'
);
assert.ok(html.includes('for (let i = 0; i < MappedOrders.length; i++)'), 'Save PDF must still export full MappedOrders');
assert.ok(html.includes('{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Print area must still render full MappedOrders');
assert.ok(html.includes('parseTikTokPositionedItems(positionedItems, declaredTotalQty)'), 'TikTok parser call must remain');
assert.ok(html.includes('parseShopeePositionedItems(positionedItems, declaredTotalQty)'), 'Shopee parser call must remain');

console.log('PackMaster Phase 3B duplicate UI integration guard passed');
