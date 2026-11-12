import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileRoot = path.join(repo, 'desktop', 'test-profiles', 'recovery-journal-test');
const handlers = new Map();
const mainFrame = { url: 'packmaster://app/index.html' };
const win = { webContents: { id: 91, mainFrame } };
const { registerRecoveryIpc } = require('../desktop/lib/recovery-ipc.cjs');

function makeBackup() {
  return {
    schema: 'packmaster-workspace-backup', version: 1,
    createdAt: '2026-11-11T00:00:00.000Z', appVersion: 'test', settings: {},
    skuRules: [], batches: [], batchOrders: []
  };
}

function sender(id = 91, url = 'packmaster://app/index.html') {
  return { sender: id === 91 ? win.webContents : { id }, senderFrame: url === mainFrame.url ? mainFrame : { url } };
}

function setup(options = {}) {
  const { preserve = false, ...registrationOptions } = options;
  if (!preserve) fs.rmSync(profileRoot, { recursive: true, force: true });
  fs.mkdirSync(profileRoot, { recursive: true });
  handlers.clear();
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  registerRecoveryIpc({ ipcMain, win, profilePath: profileRoot, storeId: 'store_abc123', origin: 'packmaster://app', ...registrationOptions });
}

function call(channel, event = sender(), payload) {
  return handlers.get('packmaster:recovery:' + channel)(event, payload);
}

after(() => fs.rmSync(profileRoot, { recursive: true, force: true }));

test('pending snapshot is durable and can be read by a fresh registration', async () => {
  setup();
  const backup = makeBackup();
  const localStorageEntries = [['skuMappingRules', '[{"keyword":"abc","shortName":"X"}']];
  const prepared = await call('prepare', sender(), { backup, localStorageEntries });
  assert.match(prepared.id, /^[a-f0-9-]{36}$/i);
  const probe = `
    const { registerRecoveryIpc } = require(${JSON.stringify(path.join(repo, 'desktop', 'lib', 'recovery-ipc.cjs'))});
    const ipc = new Map(); const webContents = { id: 19 };
    registerRecoveryIpc({ ipcMain: { handle: (name, fn) => ipc.set(name, fn) }, win: { webContents },
      profilePath: process.argv[1], storeId: 'store_abc123', origin: 'packmaster://app' });
    ipc.get('packmaster:recovery:get-pending')({ sender: webContents, senderFrame: { url: 'packmaster://app/index.html' } })
      .then(value => process.stdout.write(JSON.stringify(value)));
  `;
  const restartedValue = JSON.parse(execFileSync(process.execPath, ['-e', probe, profileRoot], { encoding: 'utf8' }));
  assert.deepEqual(restartedValue, { id: prepared.id, storeId: 'store_abc123', backup, localStorageEntries });
});

test('completion is bound to the current pending ID and retains the snapshot', async () => {
  setup();
  const { id } = await call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [] });
  await assert.rejects(call('complete', sender(), { id: 'wrong-id' }), /pending|identifier/i);
  assert.equal((await call('get-pending')).id, id);
  assert.deepEqual(await call('complete', sender(), { id }), { success: true });
  assert.equal(await call('get-pending'), null);
  const journal = JSON.parse(fs.readFileSync(path.join(profileRoot, 'recovery', 'journal.json'), 'utf8'));
  assert.equal(journal.snapshot.id, id);
  assert.equal(journal.phase, 'completed');
});

test('a second prepare cannot replace an unresolved recovery snapshot', async () => {
  setup();
  await call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [] });
  await assert.rejects(call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [] }), /pending/i);
});

test('a later restore cycle retains every previously completed snapshot', async () => {
  setup();
  const firstBackup = makeBackup();
  firstBackup.appVersion = 'first';
  const first = await call('prepare', sender(), { backup: firstBackup, localStorageEntries: [['source', 'first']] });
  await call('complete', sender(), { id: first.id });
  const secondBackup = makeBackup();
  secondBackup.appVersion = 'second';
  const second = await call('prepare', sender(), { backup: secondBackup, localStorageEntries: [['source', 'second']] });
  const journal = JSON.parse(fs.readFileSync(path.join(profileRoot, 'recovery', 'journal.json'), 'utf8'));
  const archivedPath = path.join(profileRoot, 'recovery', 'history', first.id + '.json');
  const archived = JSON.parse(fs.readFileSync(archivedPath, 'utf8'));
  assert.equal(journal.snapshot.id, second.id);
  assert.equal(archived.snapshot.id, first.id);
  assert.equal(archived.snapshot.backup.appVersion, 'first');
  assert.deepEqual(archived.snapshot.localStorageEntries, [['source', 'first']]);
});

test('untrusted sender ID, URL scheme, or host cannot access recovery data', async () => {
  setup();
  for (const event of [sender(2), sender(91, 'https://app/index.html'), sender(91, 'packmaster://evil/index.html')]) {
    await assert.rejects(call('get-pending', event), /trusted|sender|origin/i);
  }
});

test('invalid backup and malformed LocalStorage pairs are rejected before journaling', async () => {
  setup();
  await assert.rejects(call('prepare', sender(), { backup: { ...makeBackup(), version: 9 }, localStorageEntries: [] }), /backup|version/i);
  await assert.rejects(call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [['key', 5]] }), /localstorage|entries|string/i);
  assert.equal(await call('get-pending'), null);
});

test('journal refuses symlink profile data paths', async t => {
  setup();
  const target = path.join(profileRoot, 'outside');
  const recovery = path.join(profileRoot, 'recovery');
  fs.mkdirSync(target);
  try { fs.symlinkSync(target, recovery, 'junction'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('symlink creation is unavailable'); throw error; }
  await assert.rejects(call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [] }), /symlink|link|profile/i);
});

test('malformed stored IDs fail closed before a recovery history path is derived', async () => {
  setup();
  fs.mkdirSync(path.join(profileRoot, 'recovery'));
  fs.writeFileSync(path.join(profileRoot, 'recovery', 'journal.json'), JSON.stringify({
    formatVersion: 1, storeId: 'store_abc123', phase: 'completed', updatedAt: '2026-11-11T00:00:00.000Z',
    snapshot: { id: '../../outside', storeId: 'store_abc123', backup: makeBackup(), localStorageEntries: [] }
  }));
  await assert.rejects(call('get-pending'), /binding|invalid/i);
  assert.equal(fs.existsSync(path.join(profileRoot, 'outside.json')), false);
});

test('history symlink blocks replacement and preserves the active completed journal', async t => {
  setup();
  const original = await call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [['keep', 'old']] });
  await call('complete', sender(), { id: original.id });
  const journalPath = path.join(profileRoot, 'recovery', 'journal.json');
  const before = fs.readFileSync(journalPath, 'utf8');
  const outside = path.join(profileRoot, 'outside');
  fs.mkdirSync(outside);
  try { fs.symlinkSync(outside, path.join(profileRoot, 'recovery', 'history'), 'junction'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('symlink creation is unavailable'); throw error; }
  await assert.rejects(call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [] }), /symlink|link|profile/i);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), before);
  assert.equal(fs.readdirSync(outside).length, 0);
});

test('write, disk-space, and rename failures reject prepare without exposing a pending snapshot', async t => {
  for (const failure of ['space', 'write', 'rename']) {
    setup({ fsOps: failure === 'space' ? { statfsSync: () => ({ bavail: 0, bsize: 4096 }) } : {
      ...(failure === 'write' ? { writeFileSync() { const error = new Error('disk full'); error.code = 'ENOSPC'; throw error; } } : {}),
      ...(failure === 'rename' ? { renameSync() { const error = new Error('rename failed'); error.code = 'EIO'; throw error; } } : {})
    } });
    await assert.rejects(call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [] }), /space|disk|write|rename|available|EIO/i);
    setup();
    assert.equal(await call('get-pending'), null, failure);
  }
});

test('partial write failure leaves the previous completed snapshot intact', async () => {
  setup();
  const original = await call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [['keep', 'old']] });
  await call('complete', sender(), { id: original.id });
  const journalPath = path.join(profileRoot, 'recovery', 'journal.json');
  const before = fs.readFileSync(journalPath, 'utf8');
  setup({ preserve: true, fsOps: { writeFileSync(fd, value) {
    fs.writeSync(fd, String(value).slice(0, 20));
    const error = new Error('partial disk full'); error.code = 'ENOSPC'; throw error;
  } } });
  await assert.rejects(call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [] }), /space|disk/i);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), before);
  setup({ preserve: true });
  assert.equal(await call('get-pending'), null);
  const retained = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  assert.equal(retained.snapshot.id, original.id);
  assert.equal(retained.phase, 'completed');
});

test('archive write failure aborts prepare and preserves the current completed journal', async () => {
  setup();
  const original = await call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [['keep', 'old']] });
  await call('complete', sender(), { id: original.id });
  const journalPath = path.join(profileRoot, 'recovery', 'journal.json');
  const before = fs.readFileSync(journalPath, 'utf8');
  setup({ preserve: true, fsOps: { writeFileSync() {
    const error = new Error('archive disk full'); error.code = 'ENOSPC'; throw error;
  } } });
  await assert.rejects(call('prepare', sender(), { backup: makeBackup(), localStorageEntries: [] }), /space|disk/i);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(profileRoot, 'recovery', 'history', original.id + '.json')), false);
});
