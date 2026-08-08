import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const exceptions = require(path.resolve(__dirname, '../packmaster-exceptions.js'));

const syntheticOrders = Array.from({ length: 2000 }, (_, index) => ({
  id: `synthetic-${index}`,
  tracking: `SYNTH-${index}`,
  orderId: `ORDER-${index}`,
  platform: index % 2 === 0 ? 'SHOPEE' : 'TIKTOK',
  parserWarning: index % 211 === 0,
  qtyWarning: index % 157 === 0,
  displayItems: index % 97 === 0
    ? ['• ยังไม่ตั้งชื่อ']
    : (index % 131 === 0 ? ['• ⚠️ ตรวจสอบ SKU'] : [`Sample ${index} 1`]),
  parsedItems: [{ text: `Synthetic Product ${index}`, qty: 1 }]
}));

const startedAt = performance.now();
const rows = exceptions.buildExceptionRows(syntheticOrders);
const filtered = exceptions.filterExceptionRows(rows, 'ALL', 'SYNTH');
const durationMs = performance.now() - startedAt;

assert.ok(rows.length > 0, 'synthetic run must contain exceptions');
assert.equal(filtered.length, rows.length, 'search should retain all synthetic exception rows');
assert.ok(durationMs < 1500, `2,000-order exception derivation took ${durationMs.toFixed(1)}ms; investigate before optimizing blindly`);
assert.equal(syntheticOrders[0].id, 'synthetic-0', 'performance guard must not mutate source orders');

console.log(`PackMaster synthetic 2,000-order performance guard passed in ${durationMs.toFixed(1)}ms`);
