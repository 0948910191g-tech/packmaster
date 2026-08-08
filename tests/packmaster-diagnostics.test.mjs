import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const diagnostics = require(path.resolve(__dirname, '../packmaster-diagnostics.js'));

assert.equal(typeof diagnostics.buildDiagnosticReport, 'function');
assert.equal(typeof diagnostics.toDiagnosticCsv, 'function');

const report = diagnostics.buildDiagnosticReport({
  appVersion: 'pilot-test',
  batches: [{
    id: 'batch-secret-id',
    name: '8 Aug / Batch #001',
    status: 'REVIEW',
    archivedAt: null,
    totalOrders: 2,
    readyCount: 1,
    reviewSkuCount: 1,
    reviewQtyCount: 0,
    unmappedCount: 0
  }],
  storage: { supported: true, usage: 100, quota: 1000, percent: 10 },
  counters: { processedOrders: 2, duplicateBlocks: 1, duplicateOverrides: 0, printCount: 0, exportCount: 0 },
  errors: [{ type: 'storage', message: 'failed tracking TH123456789 customer Jane Doe', tracking: 'TH123456789', pdfImage: 'data:image/jpeg;base64,SECRET' }],
  now: new Date('2026-08-08T13:30:00.000Z')
});

assert.equal(report.schema, 'packmaster-local-diagnostics');
assert.equal(report.version, 1);
assert.equal(report.createdAt, '2026-08-08T13:30:00.000Z');
assert.equal(report.batches.length, 1);
assert.equal(report.batches[0].id, undefined, 'diagnostics must not export batch ids');
assert.equal(report.batches[0].name, undefined, 'diagnostics should use aggregate/state fields, not potentially identifying custom names');

const serialized = JSON.stringify(report);
assert.equal(serialized.includes('TH123456789'), false, 'tracking identifiers must be redacted');
assert.equal(serialized.includes('Jane Doe'), false, 'free-form error messages must not leak customer names');
assert.equal(serialized.includes('pdfImage'), false);
assert.equal(serialized.includes('SECRET'), false);

const csv = diagnostics.toDiagnosticCsv(report);
assert.ok(csv.includes('metric,value'));
assert.ok(csv.includes('processedOrders,2'));
assert.equal(csv.includes('TH123456789'), false);

console.log('PackMaster local diagnostics privacy tests passed');
