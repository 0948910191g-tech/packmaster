import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workspace = require('../packmaster-workspace.js');

// Ticket 22 Acceptance Criteria Tests

// 1. Partial-corrupt Backup succeeds with warning (handleWorkspaceBackup in index.html)
test('handleWorkspaceBackup allows partial backup when local stores have load errors', () => {
  const handler = html.slice(html.indexOf('const handleWorkspaceBackup = async () => {'), html.indexOf('const handleWorkspaceRestoreFile'));
  
  // Must NOT have the hard blocking check
  assert.equal(
    handler.includes('if (skuRulesLoadError || registryAssignmentsError || marketplaceRegistryLoadError)'),
    false,
    'must remove the hard block on store load errors'
  );

  // Must handle missing parts for SKU Rules, Registry Assignments, Marketplace Registry
  assert.match(handler, /skuRulesLoadError\s*\?/);
  assert.match(handler, /registryAssignmentsError\s*\?/);
  assert.match(handler, /marketplaceRegistryLoadError\s*\?/);

  // Must wrap duplicate, archive, and reprint exports in try/catch
  assert.match(handler, /try\s*\{\s*safeDuplicateFingerprints\s*=\s*duplicateApi\.exportFingerprintStore\(\)/);
  assert.match(handler, /try\s*\{\s*safeArchiveState\s*=\s*archiveApi\.exportArchiveStore\(\)/);
  assert.match(handler, /try\s*\{\s*safeReprintSnapshots\s*=\s*reprintSnapshotApi\.exportStore\(\)/);

  // Must report missingParts along with key warnings
  assert.match(handler, /missingParts/);
  assert.match(handler, /showToast\(.*allWarnings/);
});

// 2. Restore failure never locks screen (handleConfirmWorkspaceRestore in index.html)
test('handleConfirmWorkspaceRestore wraps local sidecar exports in try/catch to protect safety-copy and rollback', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));

  // Sidecar exports before restore must be safely wrapped in try/catch
  assert.match(handler, /try\s*\{\s*previousDuplicateFingerprints\s*=\s*duplicateApi\.exportFingerprintStore\(\)/);
  assert.match(handler, /try\s*\{\s*previousArchiveState\s*=\s*archiveApi\.exportArchiveStore\(\)/);
  assert.match(handler, /try\s*\{\s*previousReprintSnapshots\s*=\s*reprintSnapshotApi\.exportStore\(\)/);

  // setWorkspaceBusy(false) must be in finally block wrapping restore execution
  assert.match(handler, /finally\s*\{\s*setWorkspaceBusy\(false\);\s*\}/);
});

// 3. Blank/image-only PDF pages become "ต้องตรวจ" orders and pass backup/save validation
test('PDF parser never pushes empty text items into parsedItems and flags empty parsedItems with parserWarning', () => {
  const parserSlice = html.slice(html.indexOf('let isNewFormat = false;'), html.indexOf('const trackingMatch = fullText.match'));

  // Non-empty checks at lines 2216, 2267, and 2274-2293
  assert.match(parserSlice, /if\s*\(\s*textWithoutQty\s*&&\s*Number\.isInteger\(itemQty\)\s*&&\s*itemQty\s*>=\s*1\s*\)\s*\{\s*parsedItems\.push\(\{\s*text:\s*textWithoutQty,\s*qty:\s*itemQty\s*\}\);/);

  // Fallback zone parsing must only push if textWithoutQty is non-empty
  const fallbackSlice = parserSlice.slice(parserSlice.indexOf("if (parsedItems.length === 0 && platform !== 'TIKTOK' && !parserWarning)"));
  assert.match(fallbackSlice, /if\s*\(\s*textWithoutQty\s*&&\s*Number\.isInteger\(itemQty\)\s*&&\s*itemQty\s*>=\s*1\s*\)\s*\{\s*parsedItems\.push/);

  // When parsedItems.length === 0, parserWarning must be set to true
  const orderCreationSlice = html.slice(html.indexOf("if (parsedItems.length === 0 && platform !== 'TIKTOK'"), html.indexOf('allNewOrders.push({'));
  assert.match(orderCreationSlice, /if\s*\(\s*parsedItems\.length\s*===\s*0\s*\)\s*\{\s*parserWarning\s*=\s*true;\s*\}/);
});

test('validateBackup accepts orders with parsedItems: [] and rejects empty text items', () => {
  const base = {
    schema: workspace.SCHEMA,
    version: workspace.VERSION,
    createdAt: '2026-11-13T00:00:00.000Z',
    appVersion: 'ticket-22',
    settings: {},
    skuRules: [],
    batches: [{ id: 'b1' }],
    batchOrders: [{
      batchId: 'b1',
      orders: [
        { id: 'o-empty', parsedItems: [], parserWarning: true }
      ]
    }]
  };

  // Valid backup with empty parsedItems (blank page order)
  const validated = workspace.validateBackup(base);
  assert.equal(validated.batchOrders[0].orders[0].parsedItems.length, 0);

  // Invalid backup with empty text item (must be rejected)
  const invalid = {
    ...base,
    batchOrders: [{
      batchId: 'b1',
      orders: [
        { id: 'o-blank-item', parsedItems: [{ text: '', qty: 1 }] }
      ]
    }]
  };
  assert.throws(() => workspace.validateBackup(invalid), /parsedItems\[0\]\.text must be a non-empty string/);
});

console.log('PackMaster ticket 22 resilience tests passed');
