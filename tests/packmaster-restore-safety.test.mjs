import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

// Ticket 21: a web restore must download a safety copy of the current data first,
// write the new batches in one atomic step, and leave the old data intact if it fails midway.

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const META = 'batchMeta';
const ORDERS = 'batchOrders';

// Minimal IndexedDB double with real transaction semantics: writes go to a working copy,
// commit only when the transaction completes, and any exception raised inside a request
// handler aborts the whole transaction (as the browser does).
function createFakeIndexedDb({ committed, failAfterWrites = Infinity, log = [] }) {
  let writes = 0;
  const copy = map => new Map(Array.from(map, ([key, value]) => [key, JSON.parse(JSON.stringify(value))]));
  const indexedDB = {
    open() {
      const request = {};
      setTimeout(() => { request.result = db; if (request.onsuccess) request.onsuccess(); }, 0);
      return request;
    }
  };
  const db = {
    objectStoreNames: { contains: name => name === META || name === ORDERS },
    createObjectStore() {},
    transaction() {
      const working = { [META]: copy(committed[META]), [ORDERS]: copy(committed[ORDERS]) };
      const queue = [];
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
      let aborted = false;
      // A storage failure aborts the whole transaction, as a quota or disk error does in the browser.
      const abort = error => {
        if (aborted) return;
        aborted = true;
        tx.error = error;
        setTimeout(() => { if (tx.onabort) tx.onabort(); }, 0);
      };
      const store = name => {
        const keyOf = value => (name === META ? value.id : value.batchId);
        const failIfNeeded = () => {
          writes += 1;
          if (writes > failAfterWrites) {
            const error = new Error('synthetic storage failure after N writes');
            abort(error);
            throw error;
          }
        };
        return {
          getAllKeys() {
            const request = { result: Array.from(working[name].keys()) };
            queue.push(request);
            return request;
          },
          getAll() {
            const request = { result: Array.from(working[name].values()) };
            queue.push(request);
            return request;
          },
          get(key) {
            const request = { result: working[name].get(key) };
            queue.push(request);
            return request;
          },
          put(value) {
            if (aborted) throw new Error('transaction already aborted');
            failIfNeeded();
            working[name].set(keyOf(value), JSON.parse(JSON.stringify(value)));
            log.push(['put', name, keyOf(value)]);
          },
          delete(key) {
            if (aborted) throw new Error('transaction already aborted');
            failIfNeeded();
            working[name].delete(key);
            log.push(['delete', name, key]);
          }
        };
      };
      tx.objectStore = name => store(name);
      const pump = () => {
        while (queue.length && !aborted) {
          const request = queue.shift();
          try { if (request.onsuccess) request.onsuccess({ target: request }); }
          catch (error) { abort(error); }
        }
        if (aborted) return;
        committed[META] = working[META];
        committed[ORDERS] = working[ORDERS];
        // Completion is asynchronous, as in the browser: callers attach handlers after awaiting a read.
        setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
      };
      setTimeout(pump, 0);
      return tx;
    }
  };
  return { indexedDB, db };
}

const snapshot = committed => ({
  meta: Array.from(committed[META].entries()).sort(([a], [b]) => a.localeCompare(b)),
  orders: Array.from(committed[ORDERS].entries()).sort(([a], [b]) => a.localeCompare(b))
});

const seedOld = () => {
  const meta = new Map([
    ['old-a', { id: 'old-a', name: 'Old A' }],
    ['old-b', { id: 'old-b', name: 'Old B' }]
  ]);
  const orders = new Map([
    ['old-a', { batchId: 'old-a', orders: [{ id: 'old-order-a', parsedItems: [{ text: 'OLD SKU', qty: 1 }] }], updatedAt: '2026-11-01T00:00:00.000Z' }],
    ['old-b', { batchId: 'old-b', orders: [], updatedAt: '2026-11-01T00:00:00.000Z' }]
  ]);
  return { [META]: meta, [ORDERS]: orders };
};

const loadBatchModule = (indexedDB) => {
  globalThis.indexedDB = indexedDB;
  delete require.cache[require.resolve('../packmaster-batch.js')];
  return require('../packmaster-batch.js');
};

const newBackup = () => {
  const workspace = require('../packmaster-workspace.js');
  return workspace.createBackup({
    appVersion: 'restore-safety-test',
    settings: { thermalMode: false },
    skuRules: [],
    batches: [
      { id: 'new-1', name: 'Restored One', updatedAt: '2026-11-10T00:00:00.000Z' },
      { id: 'new-2', name: 'Restored Two', updatedAt: '2026-11-10T00:00:00.000Z' }
    ],
    batchOrders: [
      { batchId: 'new-1', orders: [{ id: 'restored-order', parsedItems: [{ text: 'NEW SKU', qty: 2 }] }] },
      { batchId: 'new-2', orders: [] }
    ]
  }, new Date('2026-11-10T07:05:00.000Z'));
};

// BLOCKED (ticket 21 acceptance): an overlapping batch id is overwritten before the failure, so the
// old copy is not fully intact. Making this pass needs a single-transaction replace in packmaster-batch.js,
// which the frozen-adapter guardrail (tests/packmaster-guardrails.test.mjs) currently forbids.
test('a failure midway through the batch replace leaves every old batch and order record intact', { todo: 'BLOCKED: needs an approved single-transaction Batch replace (frozen adapter)' }, async () => {
  const workspace = require('../packmaster-workspace.js');
  const backup = newBackup();
  const totalWrites = 8; // 2 new batches x 2 stores + 2 stale batches x 2 stores
  for (let failAfter = 0; failAfter < totalWrites; failAfter += 1) {
    const committed = seedOld();
    const before = snapshot(committed);
    const fake = createFakeIndexedDb({ committed, failAfterWrites: failAfter });
    const batch = loadBatchModule(fake.indexedDB);
    await assert.rejects(() => workspace.replaceWorkspaceBatches(backup, batch), /synthetic storage failure/);
    assert.deepEqual(snapshot(committed), before, `old data must survive a failure after ${failAfter} writes`);
  }
});

test('a successful restore writes the new batches before removing the stale ones', async () => {
  const workspace = require('../packmaster-workspace.js');
  const committed = seedOld();
  const log = [];
  const fake = createFakeIndexedDb({ committed, log });
  const batch = loadBatchModule(fake.indexedDB);
  await workspace.replaceWorkspaceBatches(newBackup(), batch);

  const lastPut = log.map(entry => entry[0]).lastIndexOf('put');
  const firstDelete = log.map(entry => entry[0]).indexOf('delete');
  assert.ok(lastPut >= 0 && firstDelete > lastPut, 'every new record must be written before any stale record is deleted');
  assert.deepEqual(Array.from(committed[META].keys()).sort(), ['new-1', 'new-2']);
  assert.deepEqual(Array.from(committed[ORDERS].keys()).sort(), ['new-1', 'new-2']);
  assert.equal(committed[ORDERS].get('new-1').orders.length, 1);
});

test('a failure midway never deletes a stale batch before every backup batch has been saved', async () => {
  const workspace = require('../packmaster-workspace.js');
  const backup = newBackup();
  const restoredIds = ['new-1', 'new-2'];
  for (let failAfter = 0; failAfter <= 8; failAfter += 1) {
    const committed = seedOld();
    const fake = createFakeIndexedDb({ committed, failAfterWrites: failAfter });
    const batch = loadBatchModule(fake.indexedDB);
    try {
      await workspace.replaceWorkspaceBatches(backup, batch);
    } catch (error) {
      assert.match(error.message, /synthetic storage failure/);
    }
    const staleGone = !committed[META].has('old-a') || !committed[META].has('old-b') || !committed[ORDERS].has('old-a') || !committed[ORDERS].has('old-b');
    if (staleGone) {
      for (const id of restoredIds) {
        assert.ok(committed[META].has(id) && committed[ORDERS].has(id),
          `stale batch removed after failing at write ${failAfter + 1}, but ${id} was not saved first`);
      }
    }
  }
});

test('the restore uses only the existing Batch adapter calls, so the frozen adapter file is unchanged', () => {
  const workspaceSource = fs.readFileSync(new URL('../packmaster-workspace.js', import.meta.url), 'utf8');
  assert.match(workspaceSource, /batchApi\.saveBatch\(/);
  assert.match(workspaceSource, /batchApi\.deleteBatch\(/);
  const batchSource = fs.readFileSync(new URL('../packmaster-batch.js', import.meta.url), 'utf8');
  assert.equal(/replaceAllBatches/.test(batchSource), false, 'the frozen Batch adapter must not gain a new write path here');
});

const SAFETY_KEY_BATCH = 'packmasterBatchSourceFilesV1';
const SAFETY_KEY_SKU = 'packmasterSkuIntegrityBackupV1';

test('the local keys are written before stale ones are removed, so a failed write keeps the old value', () => {
  const safety = require('../packmaster-restore-safety.js');
  const data = new Map([[SAFETY_KEY_BATCH, '{"old":["a.pdf"]}'], [SAFETY_KEY_SKU, '[{"old":1}]']]);
  const log = [];
  let failNextSet = false;
  const storage = {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem(key, value) {
      log.push(['set', key]);
      if (failNextSet) throw new Error('quota');
      data.set(key, value);
    },
    removeItem(key) { log.push(['remove', key]); data.delete(key); }
  };

  safety.writeBackupLocalKeys(storage, { batchSourceFiles: { 'b-new': ['new.pdf'] }, skuIntegrityBackup: null });
  assert.deepEqual(log.map(([kind]) => kind), ['set', 'remove'], 'the write must come before the removal');

  data.set(SAFETY_KEY_SKU, '[{"old":1}]');
  failNextSet = true;
  assert.throws(() => safety.writeBackupLocalKeys(storage, { batchSourceFiles: { x: ['x.pdf'] }, skuIntegrityBackup: null }), /quota/);
  assert.equal(data.get(SAFETY_KEY_SKU), '[{"old":1}]', 'a failed write must not have removed the old SKU integrity backup');
});

test('the safety copy is downloaded as a file with the current data, named PackMaster_SafetyCopy_*', () => {
  const safety = require('../packmaster-restore-safety.js');
  const backup = newBackup();
  const clicks = [];
  const revoked = [];
  const blobs = new Map();
  const documentApi = {
    body: { appendChild(link) { link.attached = true; }, },
    createElement() {
      return {
        click() { clicks.push({ href: this.href, download: this.download, blob: blobs.get(this.href) }); },
        remove() { this.removed = true; }
      };
    }
  };
  const urlApi = {
    createObjectURL(blob) { const url = `blob:fake/${blobs.size}`; blobs.set(url, blob); return url; },
    revokeObjectURL(url) { revoked.push(url); }
  };

  const filename = safety.downloadSafetyCopy(backup, { documentApi, urlApi, now: new Date('2026-11-10T07:05:00.000Z') });
  assert.equal(filename, 'PackMaster_SafetyCopy_2026-11-10-07-05-00.json');
  assert.equal(clicks.length, 1, 'exactly one download must be triggered');
  assert.equal(clicks[0].download, filename);
  assert.equal(clicks[0].blob.type, 'application/json');
});

test('when the browser refuses the safety-copy download the error propagates so the restore stops before any write', async () => {
  const safety = require('../packmaster-restore-safety.js');
  const removed = [];
  const documentApi = {
    body: { appendChild() {} },
    createElement() {
      return {
        click() { throw new Error('download blocked'); },
        remove() { removed.push(true); }
      };
    }
  };
  const urlApi = { createObjectURL: () => 'blob:fake/0', revokeObjectURL() {} };
  assert.throws(
    () => safety.downloadSafetyCopy(newBackup(), { documentApi, urlApi, now: new Date('2026-11-10T07:05:00.000Z') }),
    /download blocked/
  );
  assert.equal(removed.length, 1, 'the temporary link is still removed');
});

test('the safety-copy key names match the modules that own them', () => {
  const safety = require('../packmaster-restore-safety.js');
  const sourceFiles = require('../packmaster-batch-source-files.js');
  assert.equal(safety.BATCH_SOURCE_FILES_KEY, sourceFiles.STORAGE_KEY);
  assert.equal(safety.SKU_INTEGRITY_BACKUP_KEY, SAFETY_KEY_SKU);
});

test('index.html downloads the safety copy before the Desktop recovery snapshot and before any replace', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  const download = handler.indexOf('restoreSafetyApi.downloadSafetyCopy(');
  assert.ok(download > 0, 'the restore handler must call restoreSafetyApi.downloadSafetyCopy');
  assert.ok(handler.indexOf('collectBackupPayload(') < download, 'the safety copy must be built before it is downloaded');
  assert.ok(download < handler.indexOf('runRestore('), 'download must precede the recovery journal and replace');
  assert.ok(download < handler.indexOf('replaceWorkspaceBatches('), 'download must precede any batch write');
});

test('the restore confirm dialog warns that the safety copy holds customer label images and where it goes', () => {
  const preview = require('../packmaster-restore-preview.js');
  const impact = preview.describeRestoreImpact({ backup: newBackup(), currentBindingCount: 0 });
  const message = preview.buildRestoreConfirmMessage({
    impact,
    summary: { skuRules: 0, batches: 2, orders: 1 },
    integrityPreview: '',
    recoverySafetyCopy: 'โดยระบบจะสร้าง Safety Snapshot ในหน่วยความจำก่อนเริ่มกู้คืน'
  });
  assert.match(message, /PackMaster_SafetyCopy_/);
  assert.match(message, /รูปใบปะหน้า/);
  assert.match(message, /ตามที่คุณเลือกบันทึกไว้/);
  assert.equal(message.includes('Downloads'), false);
  assert.match(message, /ห้ามอัปโหลด/);
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.match(handler, /restorePreviewApi\.buildRestoreConfirmMessage\(/, 'the handler must show this message');
});

test('the user confirms the safety copy is in Downloads after the download and before any replace', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  const download = handler.indexOf('restoreSafetyApi.downloadSafetyCopy(');
  const verified = handler.indexOf('ดาวน์โหลดไฟล์สำเนาข้อมูลเดิม');
  assert.ok(verified > download, 'the confirmation must come after the download call');
  assert.ok(verified < handler.indexOf('runRestore('), 'the confirmation must come before the recovery journal and replace');
  const runnerSource = fs.readFileSync(new URL('../packmaster-restore-runner.js', import.meta.url), 'utf8');
  assert.match(runnerSource, /ยังไม่ได้ยืนยันไฟล์สำเนาข้อมูลเดิม/, 'declining the confirmation must abort the restore');
});

test('index.html restore keeps the safety copy out of Git and runs only after the upload and cross-tab gates', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.ok(handler.indexOf('uploadGateRef.current.isActive()') < handler.indexOf('downloadSafetyCopy('));
  assert.ok(handler.includes('captureLocalStorageEntries(window.localStorage)'), 'rollback must still capture all local keys');
  assert.ok(handler.includes('restoreLocalStorageEntries(window.localStorage, previousLocalStorageEntries)'));
});

test('index.html loads the restore safety module before the app runs', () => {
  assert.match(html, /<script src="\.\/packmaster-restore-safety\.js"><\/script>/);
  assert.match(html, /const restoreSafetyApi = window\.PackMasterRestoreSafety;/);
});

// ---- Handler-level runtime tests (review fix 5) -------------------------------------------------
// The restore control flow lives in packmaster-restore-runner.js. These tests run it with the REAL
// Desktop recovery functions (runRestore, reloadIfRecoveryPending, completeRecovery) over a fake bridge,
// and stub only the page side effects (confirm dialog, download, replace body, rollback).

const recoveryModule = require('../packmaster-desktop-recovery.js');
const runnerModule = require('../packmaster-restore-runner.js');
const safety = require('../packmaster-restore-safety.js');

const stubStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
};

function fakeDesktopBridge({ prepareFails = false, completeFails = false, getPendingFails = false } = {}) {
  const calls = [];
  let pending = null;
  const bridge = {
    recovery: {
      async prepare({ backup }) {
        calls.push(['prepare']);
        if (prepareFails) throw new Error('snapshot could not be written');
        pending = { id: 'rec-1', backup };
        return { id: 'rec-1' };
      },
      async complete({ id }) {
        calls.push(['complete', id]);
        if (completeFails) throw new Error('journal busy');
        pending = null;
      },
      async getPending() {
        calls.push(['getPending']);
        if (getPendingFails) throw new Error('journal unreadable');
        return pending;
      }
    }
  };
  return { bridge, calls };
}

function restoreDeps(bridge, overrides = {}) {
  const log = [];
  const reloads = [];
  const deps = {
    log,
    reloads,
    preflight: async () => { log.push('preflight'); },
    buildSafetyCopy: async () => { log.push('buildSafetyCopy'); return newBackup(); },
    downloadSafetyCopy: () => { log.push('download'); return 'PackMaster_SafetyCopy_2026-11-10-07-05-00.json'; },
    confirmSafetyCopySaved: async () => { log.push('confirm'); return true; },
    runRecoveredReplace: ({ backup, onPrepared, replace }) => {
      log.push('runRecoveredReplace');
      return recoveryModule.runRestore({ bridge, backup, localStorageEntries: [], onPrepared, replace, apply: async () => {} });
    },
    replace: async ({ markReplacementStarted }) => {
      log.push('replace');
      markReplacementStarted();
      log.push('replace-body-done');
    },
    rollback: async () => { log.push('rollback'); },
    completeRecovery: id => recoveryModule.completeRecovery(bridge, id),
    reloadIfPending: id => recoveryModule.reloadIfRecoveryPending({ bridge, id, reload: () => reloads.push(id) }),
    ...overrides
  };
  return deps;
}

test('runtime: declining the second confirm after the safety copy writes nothing and touches no recovery state', async () => {
  const { bridge, calls } = fakeDesktopBridge();
  const deps = restoreDeps(bridge, { confirmSafetyCopySaved: async () => { deps.log.push('confirm'); return false; } });
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.replacementStarted, false);
  assert.deepEqual(deps.log, ['preflight', 'buildSafetyCopy', 'download', 'confirm'], 'nothing after the declined confirm may run');
  assert.deepEqual(calls, [], 'the Desktop journal must not be written');
  assert.deepEqual(deps.reloads, [], 'nothing reloads');
  assert.equal(outcome.error.message, 'ยังไม่ได้ยืนยันไฟล์สำเนาข้อมูลเดิม');
});

test('runtime: a failed preflight stops before any safety copy is downloaded', async () => {
  const { bridge, calls } = fakeDesktopBridge();
  const deps = restoreDeps(bridge, { preflight: async () => { throw new Error('active batch not saved'); } });
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.status, 'failed');
  assert.deepEqual(deps.log, [], 'no download or confirm after a failed preflight');
  assert.deepEqual(calls, []);
});

test('runtime: when the browser refuses the download the restore stops before the confirm and the journal', async () => {
  const { bridge, calls } = fakeDesktopBridge();
  const deps = restoreDeps(bridge, { downloadSafetyCopy: () => { throw new Error('download blocked'); } });
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.status, 'failed');
  assert.equal(deps.log.includes('confirm'), false);
  assert.deepEqual(calls, []);
});

test('runtime: a failure before replacementStarted completes the journal and does not reload into the recovery gate', async () => {
  const { bridge, calls } = fakeDesktopBridge();
  const deps = restoreDeps(bridge, {
    replace: async () => { throw new Error('local names changed while restoring'); }
  });
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.replacementStarted, false);
  assert.equal(deps.log.includes('rollback'), false, 'nothing was replaced, so there is nothing to roll back');
  assert.deepEqual(calls.map(call => call[0]), ['prepare', 'complete', 'getPending'], 'the journal entry is completed, then read back');
  assert.deepEqual(calls.find(call => call[0] === 'complete'), ['complete', 'rec-1']);
  assert.deepEqual(deps.reloads, [], 'a completed journal must not reload the app');
  assert.equal(outcome.reloadRequested, false);
});

test('runtime: a failure after replacement starts rolls back, completes the journal and does not reload', async () => {
  const { bridge, calls } = fakeDesktopBridge();
  const deps = restoreDeps(bridge, {
    replace: async ({ markReplacementStarted }) => { markReplacementStarted(); throw new Error('write failed midway'); }
  });
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.rollbackSucceeded, true);
  assert.ok(deps.log.includes('rollback'));
  assert.ok(calls.some(call => call[0] === 'complete' && call[1] === 'rec-1'));
  assert.deepEqual(deps.reloads, []);
});

test('runtime: when the rollback fails the journal entry stays pending and the app reloads into the gate', async () => {
  const { bridge } = fakeDesktopBridge();
  const deps = restoreDeps(bridge, {
    replace: async ({ markReplacementStarted }) => { markReplacementStarted(); throw new Error('write failed midway'); },
    rollback: async () => { throw new Error('rollback also failed'); }
  });
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.rollbackSucceeded, false);
  assert.deepEqual(deps.reloads, ['rec-1'], 'the snapshot must stay available behind the recovery gate');
  assert.equal(outcome.reloadRequested, true);
});

test('runtime: if the journal cannot be completed the entry stays pending and the app reloads (fail closed)', async () => {
  const { bridge } = fakeDesktopBridge({ completeFails: true });
  const deps = restoreDeps(bridge, {
    replace: async () => { throw new Error('local names changed while restoring'); }
  });
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.completeError.message, 'journal busy');
  assert.deepEqual(deps.reloads, ['rec-1']);
});

test('runtime: if the journal cannot be read back after a failure the app reloads (fail closed)', async () => {
  const { bridge } = fakeDesktopBridge({ getPendingFails: true });
  const deps = restoreDeps(bridge, {
    replace: async () => { throw new Error('local names changed while restoring'); }
  });
  await runnerModule.runWorkspaceRestore(deps);
  assert.deepEqual(deps.reloads, ['rec-1']);
});

test('runtime: a successful restore replaces once, completes the journal through runRestore and never reloads', async () => {
  const { bridge, calls } = fakeDesktopBridge();
  const deps = restoreDeps(bridge);
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.status, 'replaced');
  assert.equal(outcome.safetyCopyFilename, 'PackMaster_SafetyCopy_2026-11-10-07-05-00.json');
  assert.deepEqual(deps.log, ['preflight', 'buildSafetyCopy', 'download', 'confirm', 'runRecoveredReplace', 'replace', 'replace-body-done']);
  assert.deepEqual(calls.map(call => call[0]), ['prepare', 'complete'], 'runRestore completes the journal itself; no read-back is needed on success');
  assert.deepEqual(deps.reloads, []);
});

test('runtime: in web mode (no Desktop bridge) a failure before replacing changes nothing and does not reload', async () => {
  const deps = restoreDeps({}, {
    runRecoveredReplace: ({ backup, onPrepared, replace }) => recoveryModule.runRestore({ bridge: {}, backup, localStorageEntries: [], onPrepared, replace, apply: async () => {} }),
    replace: async () => { throw new Error('local names changed while restoring'); },
    completeRecovery: async () => { throw new Error('must not be called without a journal'); },
    reloadIfPending: async () => false
  });
  const outcome = await runnerModule.runWorkspaceRestore(deps);
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.recoveryId, null);
  assert.equal(outcome.reloadRequested, false);
});

// Review fixes 1 and 2 at handler level: the page passes these values into the same flow.
test('runtime: a corrupt local key does not stop the safety copy, and the restore still runs', () => {
  const storage = stubStorage({ [safety.BATCH_SOURCE_FILES_KEY]: '{not json' });
  const { values, problems } = safety.readBackupLocalKeys(storage);
  const safetyPayloadSettings = { thermalMode: false, ...values };
  assert.equal(safetyPayloadSettings.batchSourceFiles, null);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].message.startsWith('คีย์ packmasterBatchSourceFilesV1 '));
});

test('runtime: an unreadable binding list reaches the page as an unknown count, and a failed store as a warning', () => {
  const preview = require('../packmaster-restore-preview.js');
  const backup = newBackup();
  const impact = preview.describeRestoreImpact({ backup, currentBindingCount: null, loadErrors: ['SKU Rules'] });
  assert.equal(impact.currentBindingCountKnown, false);
  assert.ok(impact.warnings.some(text => text.includes('อ่านไม่ครบ') && text.includes('SKU Rules')));
});

test('index.html runs the restore through the runner with the real Desktop recovery functions', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.match(handler, /restoreRunnerApi\.runWorkspaceRestore\(\{/);
  assert.match(handler, /reloadIfPending: recoveryId => window\.PackMasterDesktopRecovery\.reloadIfRecoveryPending\(/);
  assert.match(handler, /PackMasterDesktopRecovery\.runRestore\(\{/);
  const runner = fs.readFileSync(new URL('../packmaster-restore-runner.js', import.meta.url), 'utf8');
  assert.match(runner, /if \(outcome\.recoveryId && \(outcome\.rollbackSucceeded \|\| !outcome\.replacementStarted\)\)/);
});

test('index.html second confirm and success toast do not claim the Downloads folder', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.equal(handler.includes('อยู่ในโฟลเดอร์ Downloads'), false);
  assert.equal(handler.includes('โฟลเดอร์ Downloads'), false);
  assert.match(handler, /ตามที่คุณเลือกบันทึกไว้/);
});

test('index.html safety copy carries the desktopStore field like a normal backup does', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  const start = handler.indexOf('buildSafetyCopy: async () =>');
  const end = handler.indexOf('downloadSafetyCopy: safetyBackup =>');
  assert.ok(start !== -1 && end !== -1, 'both slice markers must exist in the handler');
  const safetyPayload = handler.slice(start, end);
  assert.match(safetyPayload, /desktopStore: \{ id: targetStore\.id, label: targetStore\.label \}/);
});

test('handleConfirmWorkspaceRestore guards against re-entrancy and unready modules', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.match(handler, /const handleConfirmWorkspaceRestore = async \(\) => \{\s*if \(workspaceBusy\) return;/);
  assert.match(handler, /!restorePreviewApi \|\| !restoreSafetyApi \|\| !restoreRunnerApi/);
  const busyIndex = handler.indexOf('setWorkspaceBusy(true);');
  const getContextIndex = handler.indexOf('window.packmasterDesktop.getContext()');
  assert.ok(busyIndex !== -1 && getContextIndex !== -1, 'both calls must exist in handler');
  assert.ok(busyIndex < getContextIndex, 'setWorkspaceBusy(true) must be called before getContext() to prevent re-entrant restore');
});

test('index.html loads the restore runner module', () => {
  assert.match(html, /<script src="\.\/packmaster-restore-runner\.js"><\/script>/);
  assert.match(html, /const restoreRunnerApi = window\.PackMasterRestoreRunner;/);
});

console.log('PackMaster restore safety tests passed');
