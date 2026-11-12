import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const recovery = require('../packmaster-desktop-recovery.js');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('restore writes a durable snapshot before replacement and completes only after all settings apply', async () => {
  const journal = [];
  const bridge = {
    recovery: {
      async prepare(payload) { journal.push(['prepare', payload]); return { id: 'restore-1' }; },
      async complete({ id }) { journal.push(['complete', id]); }
    }
  };
  await recovery.runRestore({
    bridge, backup: { batches: [{ id: 'new' }] }, localStorageEntries: [['theme', 'dark']],
    async replace() { journal.push(['replace']); },
    async apply() { journal.push(['apply']); }
  });
  assert.deepEqual(journal.map(row => row[0]), ['prepare', 'replace', 'apply', 'complete']);
  assert.deepEqual(journal[0][1], { backup: { batches: [{ id: 'new' }] }, localStorageEntries: [['theme', 'dark']] });
});

test('journal write failure prevents destructive replacement', async () => {
  let replaced = false;
  await assert.rejects(recovery.runRestore({
    bridge: { recovery: { async prepare() { throw new Error('ENOSPC'); } } },
    backup: {}, localStorageEntries: [], async replace() { replaced = true; }, async apply() {}
  }), /ENOSPC/);
  assert.equal(replaced, false);
});

test('failed replacement leaves pending recovery available after process restart', async () => {
  let pending = null;
  const bridge = { recovery: {
    async prepare(payload) { pending = { id: 'pending-1', ...payload }; return { id: pending.id }; },
    async getPending() { return pending; }, async complete() { pending = null; }
  } };
  await assert.rejects(recovery.runRestore({ bridge, backup: { batches: [] }, localStorageEntries: [],
    async replace() { throw new Error('partial write'); }, async apply() {} }), /partial write/);
  const afterRestart = await bridge.recovery.getPending();
  assert.equal(afterRestart.id, 'pending-1');
  assert.deepEqual(afterRestart.backup, { batches: [] });
});

test('pending recovery restores batches and every snapshotted local setting before clearing journal', async () => {
  const values = new Map([['obsolete', 'will be removed']]);
  const storage = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  let pending = { id: 'pending-2', storeId: 'store-a', backup: { batches: [{ id: 'old' }] },
    localStorageEntries: [['thermalMode', 'false'], ['marketplaceRegistry', '{"version":1}']] };
  const journal = [];
  const bridge = { recovery: { async getPending() { return pending; }, async complete({ id }) { journal.push(['complete', id]); pending = null; } } };
  const result = await recovery.recoverPending({ bridge, storage,
    async replace(backup) { journal.push(['replace', backup.batches[0].id]); },
    reload() { journal.push(['reload']); }
  });
  assert.equal(result.recovered, true);
  assert.deepEqual([...values], [['thermalMode', 'false'], ['marketplaceRegistry', '{"version":1}']]);
  assert.deepEqual(journal, [['replace', 'old'], ['complete', 'pending-2'], ['reload']]);
});

test('a failed pending recovery preserves journal and raw local storage entries exclude auth-like keys', async () => {
  const values = new Map();
  const storage = { get length() { return values.size; }, key(i) { return [...values.keys()][i] ?? null; },
    getItem(k) { return values.get(k) ?? null; }, setItem(k, v) { values.set(k, String(v)); }, removeItem(k) { values.delete(k); } };
  storage.setItem('skuMappingRules', '[{}]');
  storage.setItem('accessToken', 'sensitive');
  assert.deepEqual(recovery.captureLocalStorageEntries(storage), [['skuMappingRules', '[{}]']]);
  const pending = { id: 'still-pending', backup: {}, localStorageEntries: [['skuMappingRules', '[]']] };
  const bridge = { recovery: { async getPending() { return pending; }, async complete() { throw new Error('must not complete'); } } };
  await assert.rejects(recovery.recoverPending({ bridge, storage, async replace() { throw new Error('disk full'); } }), /disk full/);
  assert.equal((await bridge.recovery.getPending()).id, 'still-pending');
});

test('invalid pending settings fail before batch replacement', async () => {
  let replaced = false;
  const bridge = { recovery: { async getPending() { return { id: 'bad', backup: {}, localStorageEntries: [['token', 'no']] }; } } };
  await assert.rejects(recovery.recoverPending({ bridge, storage: {}, async replace() { replaced = true; } }), /invalid entry/i);
  assert.equal(replaced, false);
});

test('failed rollback reloads into the gate only while a prepared journal is pending', async () => {
  let reloads = 0;
  const reload = () => { reloads += 1; };
  const pendingBridge = { recovery: { async getPending() { return { id: 'still-pending' }; } } };
  assert.equal(await recovery.reloadIfRecoveryPending({ bridge: pendingBridge, id: 'prepared-1', reload }), true);
  assert.equal(reloads, 1);
  assert.equal(await recovery.reloadIfRecoveryPending({ bridge: pendingBridge, id: null, reload }), false,
    'a failure before prepare must not force a reload');
  const clearedBridge = { recovery: { async getPending() { return null; } } };
  assert.equal(await recovery.reloadIfRecoveryPending({ bridge: clearedBridge, id: 'prepared-2', reload }), false);
  const unavailableBridge = { recovery: { async getPending() { throw new Error('IPC unavailable'); } } };
  assert.equal(await recovery.reloadIfRecoveryPending({ bridge: unavailableBridge, id: 'prepared-3', reload }), true);
  assert.equal(reloads, 2);
});

test('unknown and different source stores require explicit ownership confirmation', () => {
  const target = { id: 'store-current', label: 'Current store' };
  assert.match(recovery.storeOwnershipPrompt(null, target), /ไม่ทราบ Store ต้นทาง/);
  assert.equal(recovery.confirmStoreOwnership({ id: 'store-other', label: 'Other' }, target, () => false), false);
  assert.equal(recovery.confirmStoreOwnership({ id: 'store-other', label: 'Other' }, target, () => true), true);
  assert.equal(recovery.confirmStoreOwnership({ id: 'store-current', label: 'Renamed' }, target, () => { throw new Error('same store should not prompt'); }), true);
});

test('Desktop startup remains blocked when the recovery preload bridge is unavailable', async () => {
  const nodes = [];
  const fakeDocument = {
    body: { appendChild(node) { nodes.push(node); } },
    createElement() {
      return { style: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
        replaceChildren() {}, append() {}, appendChild() {}, remove() { this.removed = true; } };
    }
  };
  const gate = recovery.createStartupGate({ bridge: null, document: fakeDocument, storage: {}, isDesktop: true });
  await Promise.resolve();
  assert.equal(gate.getState(), 'unavailable');
  assert.equal(gate.isBlocked(), true);
  assert.equal(nodes[0].attributes['data-pm-desktop-recovery-gate'], '');
});

test('the actual Workspace Restore handler journals before replacing batches and confirms store ownership first', () => {
  const handler = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.ok(handler.indexOf('confirmStoreOwnership') < handler.indexOf('runRestore('));
  assert.ok(handler.indexOf('runRestore(') < handler.indexOf('replaceWorkspaceBatches(backup, batchApi)'));
  assert.ok(handler.indexOf("localStorage.setItem('skuMappingRules'") < handler.indexOf('apply: async () => {}'));
  assert.ok(html.includes("desktopStore: { id: desktopContext.id, label: desktopContext.label }"));
  assert.ok(html.includes('data-pm-desktop-restore-store-scope'));
  assert.ok(html.includes('window.__pmCancelStoreSwitch = cancelStoreSwitch'));
  assert.ok(handler.includes('reloadIfRecoveryPending'));
  assert.ok(handler.includes('recoveryId'));
  assert.match(handler, /window\.packmasterDesktop\?\.recovery/);
  assert.match(handler, /Desktop จะบันทึก Recovery Snapshot ลงดิสก์/);
  assert.match(handler, /Safety Snapshot ในหน่วยความจำ/);
});
