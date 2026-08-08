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
assert.ok(html.includes('for (let i = 0; i < MappedOrders.length; i++)'), 'Save PDF must keep full MappedOrders');
assert.ok(html.includes('{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Print must keep full MappedOrders');

// Phase 3 helpers may use LocalStorage / Browser capability APIs, but must not open or migrate IndexedDB directly.
const phase3Helpers = [
  'packmaster-workspace.js',
  'packmaster-duplicate.js',
  'packmaster-exceptions.js',
  'packmaster-archive.js',
  'packmaster-storage-health.js',
  'packmaster-diagnostics.js'
];

const forbiddenServicePattern = /(supabase|firebase|firestore|sentry|mixpanel|amplitude|posthog|segment\.io|stripe|cloudinary)/i;
const networkApiPattern = /\b(fetch\s*\(|XMLHttpRequest\b|WebSocket\b|EventSource\b)/;

for (const file of phase3Helpers) {
  const source = read(file);
  assert.equal(/\bindexedDB\b/i.test(source), false, `${file} must not access IndexedDB directly`);
  assert.equal(forbiddenServicePattern.test(source), false, `${file} must not depend on paid/cloud service runtime`);
  assert.equal(networkApiPattern.test(source), false, `${file} must remain local-only with no runtime network transport`);
}

console.log('PackMaster permanent local-first / frozen-persistence guardrails passed');
