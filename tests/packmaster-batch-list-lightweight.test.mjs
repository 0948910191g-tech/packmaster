import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const batch = require(path.resolve(__dirname, '../packmaster-batch.js'));
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

assert.equal(
  typeof batch.extractSourceFileNames,
  'function',
  'Batch metadata should expose a lightweight source-file extractor so cards never need full order loads'
);

assert.doesNotMatch(
  html,
  /Promise\.all\(visibleBatches\.map[\s\S]*?batchApi\.loadBatch\(batch\.id\)/,
  'Batch list must not load every inactive Batch order payload just to show source filenames'
);

assert.match(
  html,
  /batch\.sourceFileNames/,
  'Inactive Batch cards should read source filenames from lightweight metadata'
);

console.log('PackMaster lightweight Batch list regression guard passed');
