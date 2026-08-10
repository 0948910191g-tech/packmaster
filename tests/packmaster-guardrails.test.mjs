import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Freeze the Phase 2 Batch adapter byte-for-byte using its canonical Git blob SHA-1.
const batchSource = read('packmaster-batch.js');
const gitBlobSha = crypto.createHash('sha1')
  .update(`blob ${Buffer.byteLength(batchSource, 'utf8')}\0`)
  .update(batchSource, 'utf8')
  .digest('hex');
assert.equal(
  gitBlobSha,
  '941bddd557803aa27e58bd23372b9f51d6ca1605',
  'packmaster-batch.js is frozen for Phase 3; use sidecars/derived state instead of modifying IndexedDB persistence'
);
assert.ok(batchSource.includes("const DB_VERSION = 1;"));

const html = read('index.html');
assert.ok(html.includes('for (let i = 0; i < ordersToExport.length; i++)'), 'Save PDF must use explicit selected output scope');
assert.ok(html.includes('{PrintScopedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Print must use explicit selected output scope');
assert.ok(html.includes('selectPrintOrders(MappedOrders, mode'), 'Output scope must derive from full mapped Batch data');

// Local-first helpers may use LocalStorage / Browser capability APIs, but must not open/migrate IndexedDB or call cloud services.
const localHelpers = [
  'packmaster-workspace.js',
  'packmaster-duplicate.js',
  'packmaster-exceptions.js',
  'packmaster-archive.js',
  'packmaster-storage-health.js',
  'packmaster-diagnostics.js',
  'packmaster-review-overrides.js',
  'packmaster-review-keyword-suggestions.js',
  'packmaster-batch-source-files.js',
  'packmaster-print-scope.js'
];

const forbiddenServicePattern = /(supabase|firebase|firestore|sentry|mixpanel|amplitude|posthog|segment\.io|stripe|cloudinary)/i;
const networkApiPattern = /\b(fetch\s*\(|XMLHttpRequest\b|WebSocket\b|EventSource\b)/;

for (const file of localHelpers) {
  const source = read(file);
  assert.equal(/\bindexedDB\b/i.test(source), false, `${file} must not access IndexedDB directly`);
  assert.equal(forbiddenServicePattern.test(source), false, `${file} must not depend on paid/cloud service runtime`);
  assert.equal(networkApiPattern.test(source), false, `${file} must remain local-only with no runtime network transport`);
}

console.log('PackMaster permanent local-first / frozen-persistence guardrails passed');
