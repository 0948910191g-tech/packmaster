import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../desktop/main.cjs', import.meta.url), 'utf8');
const preloadSource = fs.readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
const recoveryIpcSource = fs.readFileSync(new URL('../desktop/lib/recovery-ipc.cjs', import.meta.url), 'utf8');
const recoveryJournalModule = require('../desktop/lib/recovery-journal.cjs');
const desktopRecovery = require('../packmaster-desktop-recovery.js');

// Ticket 25 Acceptance Criteria Tests

// 1. Exit from stuck recovery gate (packmaster-desktop-recovery.js + discard support)
test('createStartupGate provides export snapshot and skip/enter app buttons on pending and error states', async () => {
  const fakeDoc = {
    body: {
      appendChild(el) { fakeDoc._overlay = el; }
    },
    createElement(tag) {
      const el = {
        tagName: tag,
        style: {},
        attributes: new Map(),
        children: [],
        listeners: new Map(),
        setAttribute(k, v) { el.attributes.set(k, v); },
        getAttribute(k) { return el.attributes.get(k); },
        hasAttribute(k) { return el.attributes.has(k); },
        appendChild(child) { el.children.push(child); },
        append(...items) { el.children.push(...items); },
        replaceChildren(...items) { el.children = [...items]; },
        addEventListener(type, fn) { el.listeners.set(type, fn); },
        remove() { el.removed = true; }
      };
      return el;
    }
  };

  let discarded = false;
  let completed = false;
  const mockBridge = {
    recovery: {
      async getPending() {
        return {
          id: 'test-recovery-123',
          backup: { schema: 'packmaster-workspace-backup', version: 1, batches: [], batchOrders: [] }
        };
      },
      async complete({ id }) {
        completed = (id === 'test-recovery-123');
        return { success: true };
      },
      async discard() {
        discarded = true;
        return { success: true };
      }
    }
  };

  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  try {
    const gate = desktopRecovery.createStartupGate({
      bridge: mockBridge,
      document: fakeDoc,
      storage: { length: 0, key() {}, getItem() {}, setItem() {}, removeItem() {} },
      reload: () => {},
      isDesktop: true
    });

    await new Promise(r => setTimeout(r, 20));
    assert.equal(gate.getState(), 'pending');

    // Find export and skip buttons in overlay
    function findElements(node, predicate) {
      const found = [];
      if (predicate(node)) found.push(node);
      for (const child of node.children || []) found.push(...findElements(child, predicate));
      return found;
    }

    const exportButtons = findElements(fakeDoc._overlay, el => el.hasAttribute && el.hasAttribute('data-pm-desktop-recovery-export'));
    assert.equal(exportButtons.length, 1, 'must have data-pm-desktop-recovery-export button');

    const skipButtons = findElements(fakeDoc._overlay, el => el.hasAttribute && el.hasAttribute('data-pm-desktop-recovery-skip'));
    assert.equal(skipButtons.length, 1, 'must have data-pm-desktop-recovery-skip button');

    // Click skip button
    await skipButtons[0].listeners.get('click')();
    assert.ok(completed || discarded, 'skipping recovery must complete or discard pending state');
    assert.equal(gate.getState(), 'ready');
    assert.equal(gate.isBlocked(), false);
    assert.equal(fakeDoc._overlay.removed, true);
  } finally {
    globalThis.confirm = originalConfirm;
  }
});

test('createStartupGate skip button works when getPending fails (corrupt journal) and calls discard', async () => {
  const fakeDoc = {
    body: { appendChild(el) { fakeDoc._overlay = el; } },
    createElement(tag) {
      const el = {
        tagName: tag, style: {}, attributes: new Map(), children: [], listeners: new Map(),
        setAttribute(k, v) { el.attributes.set(k, v); },
        hasAttribute(k) { return el.attributes.has(k); },
        appendChild(child) { el.children.push(child); },
        append(...items) { el.children.push(...items); },
        replaceChildren(...items) { el.children = [...items]; },
        addEventListener(type, fn) { el.listeners.set(type, fn); },
        remove() { el.removed = true; }
      };
      return el;
    }
  };

  let discarded = false;
  const mockBridge = {
    recovery: {
      async getPending() { throw new Error('Corrupt journal JSON'); },
      async complete() {},
      async discard() { discarded = true; return { success: true }; }
    }
  };

  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  try {
    const gate = desktopRecovery.createStartupGate({
      bridge: mockBridge,
      document: fakeDoc,
      storage: { length: 0, key() {}, getItem() {}, setItem() {}, removeItem() {} },
      reload: () => {},
      isDesktop: true
    });

    await new Promise(r => setTimeout(r, 20));
    assert.equal(gate.getState(), 'error');

    function findElements(node, predicate) {
      const found = [];
      if (predicate(node)) found.push(node);
      for (const child of node.children || []) found.push(...findElements(child, predicate));
      return found;
    }

    const skipButtons = findElements(fakeDoc._overlay, el => el.hasAttribute && el.hasAttribute('data-pm-desktop-recovery-skip'));
    assert.equal(skipButtons.length, 1, 'must have skip button in error state');

    await skipButtons[0].listeners.get('click')();
    assert.equal(discarded, true, 'discard must be called when skipping error state');
    assert.equal(gate.getState(), 'ready');
    assert.equal(gate.isBlocked(), false);
  } finally {
    globalThis.confirm = originalConfirm;
  }
});

test('recovery-journal discard unlinks journal.json safely', () => {
  const files = new Map();
  const deletedFiles = [];
  const fakeFs = {
    readFileSync(p) { return files.get(p); },
    writeFileSync(p, c) { files.set(p, c); },
    unlinkSync(p) { deletedFiles.push(p); files.delete(p); },
    mkdirSync() {},
    lstatSync(p) { return { isSymbolicLink: () => false, isDirectory: () => true }; }
  };

  const testProfile = path.resolve('fake-discard-profile');
  const journalFile = path.join(testProfile, 'recovery', 'journal.json');
  files.set(journalFile, '{bad json');

  const journal = recoveryJournalModule.createRecoveryJournal({
    profilePath: testProfile,
    storeId: 'store-1',
    fsOps: fakeFs
  });

  assert.equal(typeof journal.discard, 'function', 'journal must have discard()');
  const result = journal.discard();
  assert.equal(result.success, true);
  assert.ok(deletedFiles.includes(journalFile), 'journal.json must be unlinked');

  // Discarding when file is missing should not throw
  assert.doesNotThrow(() => journal.discard());
});

test('preload, recovery-ipc, and main.cjs wire up discard', () => {
  assert.match(preloadSource, /discard:\s*invoke\(['"]packmaster:recovery:discard['"]\)/);
  assert.match(recoveryIpcSource, /register\(['"]discard['"],\s*\(\)\s*=>\s*journal\.discard\(\)\)/);
  assert.match(mainSource, /for \(const action of \[[^\]]*'discard'[^\]]*\]\) ipcMain\.removeHandler\(`packmaster:recovery:\$\{action\}`\)/);
});

// 2. Flush storage before switching stores (desktop/main.cjs)
test('desktop/main.cjs flushes webContents storage data before switching stores', () => {
  const switchHandlerSlice = mainSource.slice(
    mainSource.indexOf("'packmaster:stores:switch':"),
    mainSource.indexOf("'packmaster:stores:create':") !== -1 && mainSource.indexOf("'packmaster:stores:create':") > mainSource.indexOf("'packmaster:stores:switch':")
      ? mainSource.indexOf("'packmaster:stores:create':")
      : mainSource.indexOf('makeMenu')
  );
  assert.match(switchHandlerSlice, /async\s*\(/);
  assert.match(switchHandlerSlice, /flushStorageData\(\)/);
  const flushIndex = switchHandlerSlice.indexOf('flushStorageData');
  const relaunchIndex = switchHandlerSlice.indexOf('relaunch');
  assert.ok(flushIndex !== -1 && relaunchIndex !== -1 && flushIndex < relaunchIndex, 'flushStorageData must be called before relaunch');
});

// 3. 64 MB limit actionable alternative
test('recovery-journal attaches RECOVERY_SNAPSHOT_TOO_LARGE on size error', () => {
  const fakeFs = {
    lstatSync() { return { isSymbolicLink: () => false, isDirectory: () => true }; },
    mkdirSync() {}
  };
  const journal = recoveryJournalModule.createRecoveryJournal({
    profilePath: path.resolve('fake-profile-size'),
    storeId: 'store-1',
    fsOps: fakeFs
  });

  const hugeString = 'X'.repeat(65 * 1024 * 1024);
  try {
    journal.prepare({
      backup: {
        schema: 'packmaster-workspace-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        appVersion: 'v1',
        settings: {},
        skuRules: [],
        batches: [],
        batchOrders: []
      },
      localStorageEntries: [['huge', hugeString]]
    });
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.code, 'RECOVERY_SNAPSHOT_TOO_LARGE');
    assert.match(err.message, /Recovery snapshot exceeds the supported size/);
  }
});

test('index.html provides clear alternative on 64 MB recovery snapshot limit', () => {
  const restoreSlice = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.match(restoreSlice, /workspaceApi\.isSnapshotTooLargeError\(/);
  assert.match(restoreSlice, /ไม่รวมรูปใบปะหน้า/);
});

// 3b. 64 MB retry must strip images where they actually live (batchOrders + settings.reprintSnapshots)
const workspace = require('../packmaster-workspace.js');

const makeImageBackup = () => workspace.createBackup({
  appVersion: 'ticket-25-test',
  settings: {
    thermalMode: true,
    reprintSnapshots: {
      'b-1': {
        batchId: 'b-1',
        completedAt: '2026-11-13T00:00:00.000Z',
        orders: [{ id: 'rep-1', displayItems: ['Item 2'], resolvedAudit: [], pdfImage: 'data:image/png;base64,REPRINT' }]
      }
    }
  },
  skuRules: [],
  batches: [{ id: 'b-1', name: 'Batch 1' }],
  batchOrders: [{ batchId: 'b-1', orders: [{ id: 'ord-1', parsedItems: [{ text: 'ITEM 1', qty: 1 }], pdfImage: 'data:image/png;base64,ORDER' }] }]
}, new Date('2026-11-13T00:00:00.000Z'));

const tooLarge = () => Object.assign(new Error('Recovery snapshot exceeds the supported size'), { code: 'RECOVERY_SNAPSHOT_TOO_LARGE' });
const hasPdfImage = (backup) => JSON.stringify(backup).includes('pdfImage');

test('stripImagesFromBackup removes pdfImage from batchOrders and reprintSnapshots of a real backup without mutating it', () => {
  const backup = makeImageBackup();
  const stripped = workspace.stripImagesFromBackup(backup);
  assert.equal(hasPdfImage(stripped), false, 'no pdfImage may remain anywhere in the stripped backup');
  assert.equal(stripped.batchOrders[0].orders[0].id, 'ord-1');
  assert.equal(stripped.settings.reprintSnapshots['b-1'].orders[0].id, 'rep-1');
  assert.equal(backup.batchOrders[0].orders[0].pdfImage, 'data:image/png;base64,ORDER', 'source backup must not be mutated');
  assert.equal(backup.settings.reprintSnapshots['b-1'].orders[0].pdfImage, 'data:image/png;base64,REPRINT');
  assert.doesNotThrow(() => workspace.validateBackup(stripped));
});

test('runWithImageFallback retries with an image-free snapshot when the user accepts', async () => {
  const backup = makeImageBackup();
  const attempts = [];
  const result = await workspace.runWithImageFallback({
    backup,
    confirm: () => true,
    execute: async (target) => {
      attempts.push(target);
      if (hasPdfImage(target)) throw tooLarge();
      return 'restored';
    }
  });
  assert.equal(result, 'restored');
  assert.equal(attempts.length, 2);
  assert.equal(hasPdfImage(attempts[1]), false, 'retry must not carry any pdfImage (old code stripped non-existent batches[].orders)');
});

test('runWithImageFallback throws a Thai 64 MB error recommending the image-free backup when the user declines', async () => {
  let attempts = 0;
  await assert.rejects(
    workspace.runWithImageFallback({
      backup: makeImageBackup(),
      confirm: () => false,
      execute: async () => { attempts += 1; throw tooLarge(); }
    }),
    (err) => {
      assert.equal(err.code, 'RECOVERY_SNAPSHOT_TOO_LARGE');
      assert.match(err.message, /64 MB/);
      assert.match(err.message, /สำรองแบบไม่รวมรูปใบปะหน้า/);
      assert.equal(err.userMessage, err.message);
      return true;
    }
  );
  assert.equal(attempts, 1);
});

test('runWithImageFallback throws a Thai 64 MB error when the image-free retry is still too large', async () => {
  let attempts = 0;
  await assert.rejects(
    workspace.runWithImageFallback({
      backup: makeImageBackup(),
      confirm: () => true,
      execute: async () => { attempts += 1; throw tooLarge(); }
    }),
    (err) => {
      assert.equal(err.code, 'RECOVERY_SNAPSHOT_TOO_LARGE');
      assert.match(err.message, /64 MB/);
      assert.match(err.message, /สำรองแบบไม่รวมรูปใบปะหน้า/);
      return true;
    }
  );
  assert.equal(attempts, 2);
});

test('runWithImageFallback rethrows non-size errors untouched', async () => {
  const boom = new Error('boom');
  await assert.rejects(
    workspace.runWithImageFallback({ backup: makeImageBackup(), confirm: () => true, execute: async () => { throw boom; } }),
    (err) => err === boom
  );
});

test('index.html 64 MB retry delegates to the shared workspace helper instead of mapping batches[].orders', () => {
  const restoreSlice = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.match(restoreSlice, /workspaceApi\.runWithImageFallback\(/);
  assert.doesNotMatch(restoreSlice, /safetyBackup\.batches\.map/);
  assert.match(restoreSlice, /outcome\.error\?\.userMessage/);
});

test('main.cjs removes the discard handler only once (inside the recovery action loop)', () => {
  assert.equal((mainSource.match(/removeHandler\('packmaster:recovery:discard'\)/g) || []).length, 0);
});

test('desktop recovery export defers revokeObjectURL so the download can start', () => {
  const recoverySource = fs.readFileSync(new URL('../packmaster-desktop-recovery.js', import.meta.url), 'utf8');
  assert.match(recoverySource, /setTimeout\(\(\)\s*=>\s*URL\.revokeObjectURL\(url\),\s*0\)/);
  assert.doesNotMatch(recoverySource, /^\s*URL\.revokeObjectURL\(url\);/m);
});

test('collectBackupPayload includeImages:false shares stripImagesFromOrders (single source of truth)', () => {
  const workspaceSource = fs.readFileSync(new URL('../packmaster-workspace.js', import.meta.url), 'utf8');
  assert.equal((workspaceSource.match(/delete order\.pdfImage/g) || []).length, 1, 'pdfImage deletion must live in one helper');
});

console.log('PackMaster ticket 25 tests passed');
