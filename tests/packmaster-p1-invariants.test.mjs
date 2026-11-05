import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(workspaceRoot, 'index.html'), 'utf8');

const exceptions = require(path.join(workspaceRoot, 'packmaster-exceptions.js'));
const workspace = require(path.join(workspaceRoot, 'packmaster-workspace.js'));

test('Ticket 10 (F09): PDF.js getDocument calls pass isEvalSupported: false', () => {
  const getDocMatches = Array.from(html.matchAll(/pdfjs\.getDocument\(([^)]+)\)/g));
  assert.ok(getDocMatches.length >= 2, 'Must have at least 2 getDocument callsites');
  for (const match of getDocMatches) {
    assert.ok(
      match[1].includes('isEvalSupported: false'),
      `getDocument callsite must disable eval for security: ${match[0]}`
    );
  }
});

test('Ticket 04 (F03): Bundle component aggregation multiplies all parts', () => {
  const context = {
    Date,
    parseInt,
    Math,
    Array,
    String,
    Number,
    normalizeMatchText: (text) => String(text || '').toLowerCase().trim()
  };
  vm.createContext(context);

  const start = html.indexOf('const extractBundleSignature =');
  const end = html.indexOf('const waitForLabelRender =', start);
  const snippet = html.slice(start, end) + '\nglobalThis.getAggregatedShortName = getAggregatedShortName;';
  vm.runInContext(snippet, context);

  const fn = context.getAggregatedShortName;
  assert.equal(typeof fn, 'function');

  // Both components doubled
  assert.equal(fn('เด้งม่วง5 ชม5', 2), 'เด้งม่วง10 ชม10');
  assert.equal(fn('เด้งม่วง5 ชม5', 3), 'เด้งม่วง15 ชม15');
  assert.equal(fn('เด้งม่วง 5 ชม 5', 2), 'เด้งม่วง 10 ชม 10');

  // Single items preserved
  assert.equal(fn('Hoya V2 ฮากุ 1 ลัง', 2), 'Hoya V2 ฮากุ 2 ลัง');
  assert.equal(fn('95 1 1', 2), '95 1 2');
  assert.equal(fn('เด้งม่วง10', 2), 'เด้งม่วง20');
});

test('Ticket 08 (F11): Workspace backup rejects duplicate order IDs in one Batch', () => {
  assert.throws(() => {
    workspace.createBackup({
      appVersion: 'test',
      settings: {},
      skuRules: [],
      batches: [{ id: 'batch-1' }],
      batchOrders: [
        {
          batchId: 'batch-1',
          orders: [
            { id: 'order-dup', parsedItems: [{ text: 'Item A', qty: 1 }] },
            { id: 'order-dup', parsedItems: [{ text: 'Item B', qty: 2 }] }
          ]
        }
      ]
    });
  }, /Duplicate order\.id/);
});

test('Ticket 02 (F02): Empty non-continuation order cannot be Ready', () => {
  const emptyOrder = {
    id: 'empty-1',
    isContinuation: false,
    parsedItems: [],
    displayItems: ['• ⚠️ ตรวจสอบ SKU'],
    qtyWarning: true,
    unresolvedSku: true,
    parserWarning: true,
    reviewAcknowledgements: {
      sku: { confirmed: true, confirmedAt: new Date().toISOString() },
      qty: { confirmed: true, confirmedAt: new Date().toISOString() }
    }
  };

  const flags = exceptions.getExceptionFlags(emptyOrder);
  assert.equal(flags.ready, false, 'Empty non-continuation order must never be ready');
  assert.equal(flags.reviewSku, true);
});
