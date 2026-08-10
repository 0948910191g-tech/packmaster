import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../packmaster-batch-source-files.js');

test('summarizes source PDF filenames case-insensitively and preserves first casing', () => {
  const summary = api.summarizeBatchSourceFiles([
    { sourceFileName: 'TikTok_A.pdf' },
    { sourceFileName: 'tiktok_a.pdf' },
    { sourceFileName: 'Shopee_B.pdf' },
    { sourceFileName: 'Shopee_C.pdf' },
    { sourceFileName: '' }
  ], 2);

  assert.deepEqual(summary.names, ['TikTok_A.pdf', 'Shopee_B.pdf']);
  assert.equal(summary.total, 3);
  assert.equal(summary.hiddenCount, 1);
  assert.equal(summary.label, 'TikTok_A.pdf • Shopee_B.pdf • +1 ไฟล์');
});

test('returns a stable empty label and supports all filenames when limit is large', () => {
  assert.deepEqual(api.summarizeBatchSourceFiles([], 2), {
    names: [],
    total: 0,
    hiddenCount: 0,
    label: 'ยังไม่มีไฟล์'
  });

  const summary = api.summarizeBatchSourceFiles([
    { sourceFileName: 'A.pdf' },
    { sourceFileName: 'B.pdf' }
  ], 10);
  assert.deepEqual(summary.names, ['A.pdf', 'B.pdf']);
  assert.equal(summary.hiddenCount, 0);
  assert.equal(summary.label, 'A.pdf • B.pdf');
});
