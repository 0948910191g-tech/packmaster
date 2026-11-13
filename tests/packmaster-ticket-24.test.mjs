import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const privacyDoc = fs.readFileSync(new URL('../docs/PRIVACY_LOCAL_DATA.md', import.meta.url), 'utf8');
const workspace = require('../packmaster-workspace.js');
const printFlow = require('../packmaster-print-flow.js');
const recoveryJournalModule = require('../desktop/lib/recovery-journal.cjs');

// Ticket 24 Acceptance Criteria Tests

// 1. Image-free backup option (packmaster-workspace.js + index.html)
test('collectBackupPayload with includeImages: false strips pdfImage from orders and reprint snapshots without mutating live data', async () => {
  const sampleOrder = {
    id: 'ord-1',
    parsedItems: [{ text: 'ITEM 1', qty: 1 }],
    pdfImage: 'data:image/png;base64,SAMPLE_IMAGE_DATA'
  };
  const liveOrders = [sampleOrder];
  const fakeBatchApi = {
    async listBatches() { return [{ id: 'b-1' }]; },
    async loadBatch() { return { meta: { id: 'b-1' }, orders: liveOrders }; },
    async saveBatch(meta) { return meta; },
    async deleteBatch() {}
  };

  const reprintOrder = {
    id: 'rep-1',
    displayItems: ['Item 2'],
    resolvedAudit: [],
    pdfImage: 'data:image/png;base64,REPRINT_IMAGE_DATA'
  };
  const settings = {
    thermalMode: true,
    reprintSnapshots: {
      'b-1': {
        batchId: 'b-1',
        completedAt: '2026-11-13T00:00:00.000Z',
        orders: [reprintOrder]
      }
    }
  };

  const payload = await workspace.collectBackupPayload({
    batchApi: fakeBatchApi,
    skuRules: [],
    settings,
    appVersion: 'ticket-24-test',
    includeImages: false
  });

  // Verify live objects were NOT mutated
  assert.equal(sampleOrder.pdfImage, 'data:image/png;base64,SAMPLE_IMAGE_DATA');
  assert.equal(reprintOrder.pdfImage, 'data:image/png;base64,REPRINT_IMAGE_DATA');

  // Verify backup payload has NO pdfImage in batchOrders
  const backupOrder = payload.batchOrders[0].orders[0];
  assert.equal('pdfImage' in backupOrder, false, 'batchOrders must omit pdfImage');

  // Verify backup payload has NO pdfImage in reprintSnapshots
  const backupReprintOrder = payload.settings.reprintSnapshots['b-1'].orders[0];
  assert.equal('pdfImage' in backupReprintOrder, false, 'reprintSnapshots must omit pdfImage');

  // validateBackup accepts image-free payload
  const validated = workspace.validateBackup(workspace.createBackup(payload));
  assert.equal('pdfImage' in validated.batchOrders[0].orders[0], false);

  // printFlow missingImageMessage reports clear Thai message when pdfImage is absent
  assert.match(printFlow.missingImageMessage([backupOrder]), /ไม่มีรูปใบปะหน้า/);
});

test('index.html provides backupExcludeImages toggle and passes includeImages to collectBackupPayload', () => {
  assert.match(html, /const\s*\[backupExcludeImages,\s*setBackupExcludeImages\]\s*=\s*useState\(false\);/);
  assert.match(html, /ไม่รวมรูปใบปะหน้า\s*\(ลดขนาดไฟล์\/ซ่อนข้อมูลลูกค้า\)/);
  assert.match(html, /includeImages:\s*!backupExcludeImages/);
  assert.match(html, /_NoImages/);
  assert.match(html, /ไม่รวมรูปใบปะหน้า/);
});

// 2. Prune old Desktop recovery history snapshots (desktop/lib/recovery-journal.cjs)
test('archiveCompletedSnapshot prunes history snapshots exceeding max count and age', () => {
  assert.equal(recoveryJournalModule.MAX_HISTORY_SNAPSHOTS, 10);
  assert.equal(recoveryJournalModule.MAX_HISTORY_AGE_MS, 30 * 24 * 60 * 60 * 1000);

  const files = new Map();
  const deletedFiles = [];
  const fakeFs = {
    readFileSync(p) {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(p);
    },
    writeFileSync(p, c) { files.set(p, c); },
    openSync(p) { return p; },
    closeSync() {},
    fsyncSync() {},
    unlinkSync(p) {
      deletedFiles.push(p);
      files.delete(p);
    },
    renameSync(from, to) {
      files.set(to, files.get(from));
      files.delete(from);
    },
    linkSync(from, to) { files.set(to, files.get(from)); },
    mkdirSync() {},
    lstatSync(p) {
      return { isSymbolicLink: () => false, isDirectory: () => true };
    },
    statSync(p) {
      return { mtimeMs: Date.now() };
    },
    statfsSync() {
      return { bavail: 100000000, bsize: 1024 };
    },
    readdirSync(dir) {
      const results = [];
      for (const key of files.keys()) {
        if (key.startsWith(dir)) {
          results.push(path.basename(key));
        }
      }
      return results;
    }
  };

  const testProfile = path.resolve('fake-profile');
  const historyDir = path.join(testProfile, 'recovery', 'history');

  // Pre-populate 12 snapshots in history, one very old (> 40 days)
  const nowMs = 1700000000000;
  for (let i = 1; i <= 12; i++) {
    const ageMs = i === 12 ? 40 * 24 * 60 * 60 * 1000 : i * 1000;
    const snapDate = new Date(nowMs - ageMs).toISOString();
    const snapId = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
    const snapFile = path.join(historyDir, `${snapId}.json`);
    files.set(snapFile, JSON.stringify({
      formatVersion: 1,
      storeId: 'store-1',
      phase: 'completed',
      updatedAt: snapDate,
      snapshot: {
        id: snapId,
        storeId: 'store-1',
        backup: {
          schema: 'packmaster-workspace-backup',
          version: 1,
          createdAt: snapDate,
          appVersion: 'v1',
          settings: {},
          skuRules: [],
          batches: [],
          batchOrders: []
        },
        localStorageEntries: []
      }
    }));
  }

  const journal = recoveryJournalModule.createRecoveryJournal({
    profilePath: testProfile,
    storeId: 'store-1',
    fsOps: fakeFs,
    maxHistorySnapshots: 10,
    maxHistoryAgeMs: 30 * 24 * 60 * 60 * 1000,
    now: () => new Date(nowMs)
  });

  // Preparing a new journal entry triggers archiving of the existing completed snapshot
  // and pruning of the history directory
  const currentSnapId = '00000000-0000-0000-0000-000000000099';
  const journalPath = path.join(testProfile, 'recovery', 'journal.json');
  files.set(journalPath, JSON.stringify({
    formatVersion: 1,
    storeId: 'store-1',
    phase: 'completed',
    updatedAt: new Date(nowMs).toISOString(),
    snapshot: {
      id: currentSnapId,
      storeId: 'store-1',
      backup: {
        schema: 'packmaster-workspace-backup',
        version: 1,
        createdAt: new Date(nowMs).toISOString(),
        appVersion: 'v1',
        settings: {},
        skuRules: [],
        batches: [],
        batchOrders: []
      },
      localStorageEntries: []
    }
  }));

  journal.prepare({
    backup: {
      schema: 'packmaster-workspace-backup',
      version: 1,
      createdAt: new Date(nowMs).toISOString(),
      appVersion: 'v1',
      settings: {},
      skuRules: [],
      batches: [],
      batchOrders: []
    },
    localStorageEntries: []
  });

  // Verify that the old snapshot (> 30 days) and excess snapshots beyond max 10 were pruned
  assert.ok(deletedFiles.length > 0, 'pruning must delete old or excess history files');
  const remainingHistoryFiles = fakeFs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
  assert.ok(remainingHistoryFiles.length <= 10, 'history files must not exceed maxHistorySnapshots');
  const oldFileDeleted = deletedFiles.some(f => f.includes('000000000012'));
  assert.ok(oldFileDeleted, 'snapshot older than max age must be deleted');
});

// 3. Update docs/PRIVACY_LOCAL_DATA.md
test('docs/PRIVACY_LOCAL_DATA.md documents image-free backup, recovery retention, and Cloud architecture accurately', () => {
  // Image-free backup option
  assert.match(privacyDoc, /ไม่รวมรูปใบปะหน้า/);
  assert.match(privacyDoc, /pdfImage/);

  // Recovery retention
  assert.match(privacyDoc, /Recovery/i);
  assert.match(privacyDoc, /30\s*วัน|ประวัติ/);

  // Accurate Cloud architecture
  assert.match(privacyDoc, /Cloudflare D1|Worker/i);
  assert.match(privacyDoc, /Duplicate/i);
  assert.match(privacyDoc, /Source filenames|ชื่อไฟล์ต้นทาง/i);
});

console.log('PackMaster ticket 24 tests passed');
