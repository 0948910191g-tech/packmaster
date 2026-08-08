import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const exceptions = require(path.resolve(__dirname, '../packmaster-exceptions.js'));

const multiWarning = {
  id: 'o1',
  tracking: 'SAFE-001',
  platform: 'SHOPEE',
  qtyWarning: true,
  parserWarning: true,
  displayItems: ['• ⚠️ ตรวจสอบ SKU', '• ยังไม่ตั้งชื่อ', '• ⚠️ ตรวจสอบ Qty'],
  parsedItems: [{ text: 'Sample Product', qty: 1 }]
};

const flags = exceptions.getExceptionFlags(multiWarning);
assert.equal(flags.reviewQty, true);
assert.equal(flags.reviewSku, true);
assert.equal(flags.parserWarning, true);
assert.equal(flags.unmapped, true);
assert.equal(flags.ready, false);
assert.equal(exceptions.getPrimaryStatus(flags), 'REVIEW_QTY', 'Qty must have highest summary precedence');
assert.deepEqual(exceptions.getExceptionTypes(flags), ['REVIEW_QTY', 'REVIEW_SKU', 'PARSER_WARNING', 'UNMAPPED']);

const skuOnly = exceptions.getExceptionFlags({ displayItems: ['• ⚠️ ตรวจสอบ SKU'] });
assert.equal(exceptions.getPrimaryStatus(skuOnly), 'REVIEW_SKU');

const unmappedOnly = exceptions.getExceptionFlags({ displayItems: ['• ยังไม่ตั้งชื่อ'] });
assert.equal(exceptions.getPrimaryStatus(unmappedOnly), 'UNMAPPED');

const ready = exceptions.getExceptionFlags({ displayItems: ['• HOYA 5'] });
assert.equal(exceptions.getPrimaryStatus(ready), 'READY');
assert.equal(ready.ready, true);

const rows = exceptions.buildExceptionRows([
  multiWarning,
  { id: 'o2', tracking: 'SAFE-002', platform: 'TIKTOK', displayItems: ['• HOYA 5'] },
  { id: 'o3', tracking: 'SAFE-003', platform: 'TIKTOK', displayItems: ['• ยังไม่ตั้งชื่อ'] }
]);
assert.equal(rows.length, 2, 'ready orders must not appear in Exception Inbox');
assert.equal(rows[0].primaryStatus, 'REVIEW_QTY');
assert.equal(rows[1].primaryStatus, 'UNMAPPED');

const skuFilter = exceptions.filterExceptionRows(rows, 'REVIEW_SKU', '');
assert.equal(skuFilter.length, 1, 'multi-warning row must match SKU filter even when primary status is Qty');
assert.equal(skuFilter[0].order.id, 'o1');

const unmappedFilter = exceptions.filterExceptionRows(rows, 'UNMAPPED', 'safe-003');
assert.equal(unmappedFilter.length, 1);
assert.equal(unmappedFilter[0].order.id, 'o3');

const parsedTextSearch = exceptions.filterExceptionRows(rows, 'ALL', 'sample product');
assert.equal(parsedTextSearch.length, 1);
assert.equal(parsedTextSearch[0].order.id, 'o1');

console.log('PackMaster Exception Inbox regression tests passed');
