import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Slice a named handler so source checks only look inside it.
function sliceFrom(marker, length) {
  const start = html.indexOf(marker);
  assert.ok(start > 0, `${marker} must exist in index.html`);
  return html.slice(start, start + length);
}

// Upload region: from the upload entry point up to the live mapped orders.
function uploadHandlerSource() {
  const start = html.indexOf('const handleFileUpload = async (e) => {');
  const end = html.indexOf('const LiveMappedOrders = useMemo', start);
  assert.ok(start > 0 && end > start, 'upload handler must be locatable in index.html');
  return html.slice(start, end);
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// ---- Pure seam: packmaster-upload-session.js ------------------------------------------------

test('upload gate refuses a second upload until the first one finishes', () => {
  const session = require('../packmaster-upload-session.js');
  const gate = session.createUploadGate();
  assert.equal(gate.isActive(), false);
  assert.equal(gate.tryStart(), true, 'first upload must start');
  assert.equal(gate.isActive(), true, 'gate must be busy right after start');
  assert.equal(gate.tryStart(), false, 'second upload must be refused while the first is processing');
  gate.finish();
  assert.equal(gate.isActive(), false);
  assert.equal(gate.tryStart(), true, 'gate must reopen after finish');
  gate.finish();
  gate.finish();
  assert.equal(gate.isActive(), false, 'finish must be safe to call repeatedly');
});

test('runExclusive refuses a second call while the first is still running and runs fn only once', async () => {
  const session = require('../packmaster-upload-session.js');
  const gate = session.createUploadGate();
  const hold = deferred();
  let secondCalled = false;
  const first = session.runExclusive(gate, () => hold.promise.then(() => 'first-result'));
  const second = await session.runExclusive(gate, () => { secondCalled = true; return 'second'; });
  assert.deepEqual(second, { ran: false, value: undefined }, 'second call must be refused, not queued');
  assert.equal(secondCalled, false, 'refused fn must never run');
  assert.equal(gate.isActive(), true, 'first call still holds the gate');
  hold.resolve();
  assert.deepEqual(await first, { ran: true, value: 'first-result' });
  assert.equal(gate.isActive(), false, 'gate is released after the first call completes');
});

test('runExclusive releases the gate when fn throws and rethrows the error', async () => {
  const session = require('../packmaster-upload-session.js');
  const gate = session.createUploadGate();
  await assert.rejects(
    session.runExclusive(gate, async () => { throw new Error('synthetic failure'); }),
    /synthetic failure/
  );
  assert.equal(gate.isActive(), false, 'a throwing fn must not leave the gate stuck busy');
  const next = await session.runExclusive(gate, async () => 'ok');
  assert.deepEqual(next, { ran: true, value: 'ok' }, 'the next upload must be able to run');
});

test('runExclusive with a synchronous throw still releases the gate', async () => {
  const session = require('../packmaster-upload-session.js');
  const gate = session.createUploadGate();
  await assert.rejects(session.runExclusive(gate, () => { throw new Error('sync failure'); }), /sync failure/);
  assert.equal(gate.isActive(), false);
});

test('a rejected save leaves no fingerprint and reports the error', async () => {
  const session = require('../packmaster-upload-session.js');
  const remembered = [];
  const entries = [{ name: 'synthetic-a.pdf', size: 10, hash: 'abc', addedAt: '2026-11-13T00:00:00.000Z' }];
  const outcome = await session.saveThenRemember({
    save: async () => { throw new Error('quota exceeded'); },
    remember: value => remembered.push(value),
    entries
  });
  assert.equal(outcome.saved, false);
  assert.match(outcome.error.message, /quota exceeded/);
  assert.deepEqual(remembered, [], 'a failed save must never remember the file');
});

test('a save that reports nothing persisted leaves no fingerprint', async () => {
  const session = require('../packmaster-upload-session.js');
  const remembered = [];
  const outcome = await session.saveThenRemember({
    save: async () => false,
    remember: value => remembered.push(value),
    entries: [{ name: 'synthetic-b.pdf', size: 1, hash: 'def' }]
  });
  assert.equal(outcome.saved, false);
  assert.equal(outcome.error, null);
  assert.deepEqual(remembered, []);
});

test('a successful save remembers exactly the accepted files', async () => {
  const session = require('../packmaster-upload-session.js');
  const remembered = [];
  const entries = [{ name: 'synthetic-c.pdf', size: 2, hash: 'ghi' }];
  const outcome = await session.saveThenRemember({
    save: async () => true,
    remember: value => remembered.push(value),
    entries
  });
  assert.equal(outcome.saved, true);
  assert.equal(outcome.error, null);
  assert.deepEqual(remembered, [entries]);
});

test('the active-batch check aborts when the batch changed or was deleted during upload', () => {
  const session = require('../packmaster-upload-session.js');
  assert.equal(session.isSameBatch('batch-1', 'batch-1'), true, 'same batch may save');
  assert.equal(session.isSameBatch('batch-1', 'batch-2'), false, 'switched batch must abort');
  assert.equal(session.isSameBatch('batch-1', null), false, 'deleted batch (no active id) must abort');
  assert.equal(session.isSameBatch('batch-1', undefined), false, 'missing live id must abort');
  assert.equal(session.isSameBatch(null, null), false, 'no upload batch never saves');
  assert.equal(session.isSameBatch(undefined, undefined), false);
});

test('committed orders keep edits made while the upload was running', () => {
  const session = require('../packmaster-upload-session.js');
  const snapshotAtStart = [{ id: 'order-1', tracking: 'SYN-1', name: 'ชื่อเดิม' }];
  const latest = [{ id: 'order-1', tracking: 'SYN-1', name: 'ชื่อที่แก้ระหว่างอัปโหลด' }];
  const added = [{ id: 'order-2', tracking: 'SYN-2', name: 'ใหม่' }];

  const merged = session.mergeUploadedOrders(latest, added);
  assert.deepEqual(merged.map(order => order.id), ['order-1', 'order-2'], 'new orders are appended after the latest ones');
  assert.equal(merged[0].name, 'ชื่อที่แก้ระหว่างอัปโหลด', 'the edit made during upload must survive the merge');
  assert.notEqual(merged[0].name, snapshotAtStart[0].name, 'merge must not fall back to the snapshot from upload start');
  assert.equal(latest.length, 1, 'merge must not mutate the latest array');
  assert.equal(added.length, 1, 'merge must not mutate the added array');
});

test('merge tolerates missing input without losing the latest orders', () => {
  const session = require('../packmaster-upload-session.js');
  assert.deepEqual(session.mergeUploadedOrders([{ id: 'order-1' }], undefined), [{ id: 'order-1' }]);
  assert.deepEqual(session.mergeUploadedOrders(undefined, [{ id: 'order-2' }]), [{ id: 'order-2' }]);
});

test('fingerprints are remembered only when the save succeeded', () => {
  const session = require('../packmaster-upload-session.js');
  const entries = [{ name: 'synthetic-a.pdf', size: 10, hash: 'abc', addedAt: '2026-11-13T00:00:00.000Z' }];
  assert.deepEqual(session.fingerprintsToRemember({ saved: false, entries }), []);
  assert.deepEqual(session.fingerprintsToRemember({ saved: undefined, entries }), []);
  assert.deepEqual(session.fingerprintsToRemember({ saved: true, entries }), entries);
  assert.deepEqual(session.fingerprintsToRemember({ saved: true, entries: null }), []);
});

// ---- Source checks on index.html -------------------------------------------------------------

test('the busy gate has a fail-closed fallback that refuses uploads but does not block other batch actions', () => {
  assert.match(html, /tryStart: \(\) => false, finish: \(\) => \{\}, isActive: \(\) => false \}/,
    'if the module is missing, tryStart must refuse and isActive must be false so batch create/open/clear are not blocked forever');
  assert.doesNotMatch(html, /isActive: \(\) => true/, 'the old always-busy fallback must be gone');
});

test('upload runs through runExclusive so the gate is taken before the first await and released by the helper', () => {
  const source = uploadHandlerSource();
  const gateAt = source.indexOf('uploadSessionApi.runExclusive(uploadGateRef.current');
  const firstAwaitAt = source.indexOf('await duplicateApi.hashFile(file)');
  assert.ok(gateAt > 0, 'upload must acquire the gate through runExclusive');
  assert.ok(firstAwaitAt > gateAt, 'the gate must be taken before the first await (duplicate hashing)');
  assert.ok(source.indexOf('setLoadingStatus({ active: true') > 0 && source.indexOf('setLoadingStatus({ active: true') < firstAwaitAt,
    'busy state must be visible to the UI before the first await');
});

test('a refused second pick or drop shows a Thai toast, resets its own input and does not touch orders', () => {
  const source = uploadHandlerSource();
  const refusalAt = source.indexOf('if (!run.ran) {');
  assert.ok(refusalAt > 0, 'the refusal branch must check run.ran');
  const refusal = source.slice(refusalAt, refusalAt + 400);
  assert.match(refusal, /กำลังประมวลผลไฟล์อยู่/, 'refusal must tell the user why in Thai');
  assert.match(refusal, /resetFileInput\(e\.target\)/, 'refused input must be reset');
  assert.doesNotMatch(refusal, /setOrders/, 'refused upload must not change orders');
});

test('the input is reset and loading state cleared in the finally of the wrapper, on every exit path', () => {
  const source = uploadHandlerSource();
  assert.match(source, /\} finally \{\s*setLoadingStatus\(\{ active: false, current: 0, total: 0 \}\);\s*resetFileInput\(e\.target\);\s*\}/,
    'the wrapper finally must clear loading state and reset the input');
});

test('upload builds the committed list from the latest orders, not the upload-start snapshot', () => {
  assert.doesNotMatch(html, /const nextOrders = \[\.\.\.orders, \.\.\.allNewOrders\]/);
  assert.match(uploadHandlerSource(), /mergeUploadedOrders\(ordersRef\.current, allNewOrders\)/);
  assert.match(uploadHandlerSource(), /setOrders\(prev => uploadSessionApi\.mergeUploadedOrders\(prev, allNewOrders\)\)/);
  assert.doesNotMatch(uploadHandlerSource(), /setOrders\(nextOrders\)/);
});

test('before saving, upload aborts when the active batch is no longer the one it started on', () => {
  const source = uploadHandlerSource();
  const checkAt = source.indexOf('uploadSessionApi.isSameBatch(uploadBatchId,');
  const saveAt = source.indexOf('uploadSessionApi.saveThenRemember(');
  assert.ok(checkAt > 0, 'upload must check the live batch id before saving');
  assert.ok(saveAt > checkAt, 'the batch check must come before the save call');
  const abort = source.slice(checkAt, saveAt);
  assert.match(abort, /Batch ถูกเปลี่ยนหรือลบระหว่างอัปโหลด/, 'abort must show a Thai toast');
  assert.match(abort, /return;/, 'abort must return without saving');
  assert.doesNotMatch(source, /saveBatch\(meta, committedOrders\)[\s\S]*?isSameBatch/, 'the check must not be placed after the save');
});

test('a file is remembered as imported only through saveThenRemember, never unconditionally', () => {
  const source = uploadHandlerSource();
  assert.doesNotMatch(source, /duplicateApi\.appendBatchFingerprints\(activeBatchId, acceptedSourceFiles\)/);
  assert.match(source, /uploadSessionApi\.saveThenRemember\(\{[\s\S]*?remember: entries => \{[\s\S]*?duplicateApi\.appendBatchFingerprints\(activeBatchId, entries\)/,
    'fingerprints must be appended from the remember callback that only saveThenRemember calls on success');
  assert.match(source, /entries: acceptedSourceFiles/);
});

test('cloud save failures still surface as cloud errors after the helper returns', () => {
  const source = uploadHandlerSource();
  assert.match(source, /if \(cloudMode && persistence\.error\) \{\s*persistence\.error\.cloudSaveFailed = true;\s*throw persistence\.error;/);
});

test('clear-orders button and the Batch clear handler are blocked while an upload is processing', () => {
  assert.match(html, /onClick=\{handleClearActiveBatch\} disabled=\{orders\.length===0 \|\| loadingStatus\.active\}/);
  assert.match(sliceFrom('const handleClearActiveBatch = async () => {', 300), /uploadGateRef\.current\.isActive\(\)/);
});

test('switching Batch is refused while an upload is in flight', () => {
  assert.match(sliceFrom('const runBatchTransition = async (transition) => {', 400), /uploadGateRef\.current\.isActive\(\)/);
});

test('deleting, archiving, restoring a Batch and restoring a workspace are refused while an upload is in flight', () => {
  for (const marker of [
    'const handleDeleteBatch = async (batch) => {',
    'const handleArchiveBatch = async (batch) => {',
    'const handleRestoreArchivedBatch = async (batch) => {',
    'const handleWorkspaceRestoreFile = async (event) => {',
    'const handleConfirmWorkspaceRestore = async () => {'
  ]) {
    assert.match(sliceFrom(marker, 500), /uploadGateRef\.current\.isActive\(\)/, `${marker} must refuse while an upload is in flight`);
  }
});

test('the new upload session module is loaded by index.html and listed in the production smoke marker set', () => {
  assert.match(html, /<script src="\.\/packmaster-upload-session\.js"><\/script>/);
  assert.match(html, /const uploadSessionApi = window\.PackMasterUploadSession;/);
  const workflow = fs.readFileSync(new URL('../.github/workflows/production-smoke.yml', import.meta.url), 'utf8');
  assert.match(workflow, /grep -Fq '\.\/packmaster-upload-session\.js' <<< "\$html"/);
});
