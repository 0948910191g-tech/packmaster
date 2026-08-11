import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sourceFiles = require(path.resolve(__dirname, '../packmaster-batch-source-files.js'));
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

assert.equal(
  typeof sourceFiles.getBatchSourceFileNames,
  'function',
  'Batch cards need a lightweight LocalStorage sidecar for source filenames'
);
assert.equal(
  typeof sourceFiles.rememberBatchSourceFiles,
  'function',
  'Opening/saving the active Batch should be able to refresh the filename sidecar'
);

assert.doesNotMatch(
  html,
  /Promise\.all\(visibleBatches\.map[\s\S]*?batchApi\.loadBatch\(batch\.id\)/,
  'Batch list must not load every inactive Batch order payload just to show source filenames'
);
assert.doesNotMatch(
  html,
  /const batchOrders = batch\.id === activeBatchId[\s\S]*?batchApi\.loadBatch\(batch\.id\)/,
  'Inactive Batch cards must never hydrate full order payloads for filenames'
);

assert.match(
  html,
  /batchSourceFilesApi\.getBatchSourceFileNames\(batch\.id\)/,
  'Inactive Batch cards should read filenames from the lightweight sidecar'
);

console.log('PackMaster lightweight Batch list regression guard passed');
