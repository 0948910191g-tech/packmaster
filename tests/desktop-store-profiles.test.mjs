import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createStore, getPreferredStore, setPreferredStore, listStores, resolveStoreProfile } = require('../desktop/lib/store-profiles.cjs');
const { resolveUserDataPath } = require('../desktop/lib/user-data-profile.cjs');
const { isTrustedTopFrame } = require('../desktop/lib/trusted-renderer.cjs');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainSource = fs.readFileSync(path.join(repo, 'desktop/main.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.join(repo, 'desktop/preload.cjs'), 'utf8');
const prepareSource = fs.readFileSync(path.join(repo, 'desktop/scripts/prepare.mjs'), 'utf8');
const pageSource = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const packageConfig = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));

function withBase(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packmaster-store-test-'));
  try { return run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('store profiles keep legacy data at base and isolate each new store', () => withBase(base => {
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'Local State'), 'legacy-data');

  const createdA = createStore({ basePath: base, label: 'Shop A' });
  const createdB = createStore({ basePath: base, label: 'Shop B' });
  const profileA = resolveStoreProfile(base, createdA.id);
  const profileB = resolveStoreProfile(base, createdB.id);

  assert.match(createdA.id, /^store_[a-f0-9]{32}$/);
  assert.notEqual(profileA, profileB);
  assert.equal(resolveStoreProfile(base, 'legacy'), base);
  assert.equal(fs.readFileSync(path.join(base, 'Local State'), 'utf8'), 'legacy-data');
  fs.mkdirSync(profileA, { recursive: true });
  fs.mkdirSync(profileB, { recursive: true });
  fs.writeFileSync(path.join(profileA, 'storage.txt'), 'A');
  fs.writeFileSync(path.join(profileB, 'storage.txt'), 'B');
  assert.equal(fs.readFileSync(path.join(profileA, 'storage.txt'), 'utf8'), 'A');
  assert.equal(fs.readFileSync(path.join(profileB, 'storage.txt'), 'utf8'), 'B');
  assert.deepEqual(listStores(base).map(store => store.label), ['พื้นที่เดิม (ยังไม่ระบุร้าน)', 'Shop A', 'Shop B']);
}));

test('store catalog rejects malformed data without overwriting it', () => withBase(base => {
  fs.mkdirSync(base, { recursive: true });
  const catalog = path.join(base, 'store-catalog.json');
  fs.writeFileSync(catalog, '{broken');
  assert.throws(() => createStore({ basePath: base, label: 'Shop' }), /catalog/i);
  assert.equal(fs.readFileSync(catalog, 'utf8'), '{broken');
}));

test('store creation fails safely when another process holds the catalog lock', () => withBase(base => {
  fs.mkdirSync(base, { recursive: true });
  const lock = path.join(base, '.store-catalog.lock');
  fs.writeFileSync(lock, 'another-process');
  assert.throws(() => createStore({ basePath: base, label: 'Shop' }), /another Packmaster process/i);
  assert.equal(fs.readFileSync(lock, 'utf8'), 'another-process');
  assert.equal(fs.existsSync(path.join(base, 'store-catalog.json')), false);
}));

test('store selection rejects forged ids and unregistered store paths', () => withBase(base => {
  fs.mkdirSync(base, { recursive: true });
  assert.throws(() => resolveStoreProfile(base, '../outside'), /store id/i);
  assert.throws(() => resolveStoreProfile(base, 'store_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), /not found/i);
}));

test('explicit store choice survives restart, store creation, and invalid preferences fail closed', () => withBase(base => {
  fs.mkdirSync(base, { recursive: true });
  assert.equal(getPreferredStore(base), null);
  const shop = createStore({ basePath: base, label: 'Shop A' });
  setPreferredStore(base, shop.id);
  assert.equal(getPreferredStore(base), shop.id, 'new process resolves the saved store choice');
  createStore({ basePath: base, label: 'Shop B' });
  assert.equal(getPreferredStore(base), shop.id, 'catalog edits preserve the selection');
  setPreferredStore(base, 'legacy');
  assert.equal(getPreferredStore(base), 'legacy');
  const catalog = JSON.parse(fs.readFileSync(path.join(base, 'store-catalog.json'), 'utf8'));
  catalog.preferredStoreId = 'store_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  fs.writeFileSync(path.join(base, 'store-catalog.json'), JSON.stringify(catalog));
  assert.throws(() => getPreferredStore(base), /preferred store/i);
}));

test('store creation rejects symlinked store directories', t => withBase(base => {
  fs.mkdirSync(base, { recursive: true });
  const outside = path.join(base, 'outside-store-profiles');
  fs.mkdirSync(outside, { recursive: true });
  try { fs.symlinkSync(outside, path.join(base, 'stores'), 'junction'); }
  catch (error) { t.skip('This Windows environment does not permit test junctions: ' + error.message); return; }
  assert.throws(() => createStore({ basePath: base, label: 'Shop' }), /real directory/i);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.rmSync(path.join(base, 'stores'), { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}));

test('explicit store id selects a cataloged child of the isolated test base', () => withBase(appData => {
  const base = path.join(appData, 'PPG', 'Packmaster Desktop');
  fs.mkdirSync(base, { recursive: true });
  const store = createStore({ basePath: base, label: 'Smoke Shop' });
  assert.equal(resolveUserDataPath(['--store-id=' + store.id], path.resolve('.'), appData), store.profilePath);
  assert.equal(resolveUserDataPath([], path.resolve('.'), appData), base);
  assert.throws(() => resolveUserDataPath(['--store-id=../escape'], path.resolve('.'), appData), /store id/i);
}));

test('store profiles use isolated Electron paths, trusted IPC, and a minimal preload bridge', () => {
  assert.ok(mainSource.indexOf("app.setPath('userData', ACTIVE_PROFILE_PATH)") < mainSource.indexOf('app.requestSingleInstanceLock()'));
  assert.ok(mainSource.indexOf("app.setPath('sessionData', ACTIVE_PROFILE_PATH)") < mainSource.indexOf('app.requestSingleInstanceLock()'));
  assert.match(mainSource, /isTrustedTopFrame\(event, win\)/);
  for (const method of ['getContext', 'listStores', 'createStore', 'switchStore']) assert.match(preloadSource, new RegExp(method));
  for (const method of ['getPending', 'prepare', 'complete']) assert.match(preloadSource, new RegExp(method));
  assert.doesNotMatch(preloadSource, /require\(['"]node:|process\.|fs\./);
  assert.ok(packageConfig.build.files.includes('desktop/preload.cjs'));
});

test('trusted renderer check accepts the actual custom app origin and rejects other frames', () => {
  const webContents = {};
  const mainFrame = { url: 'packmaster://app/index.html' };
  const win = { webContents: { ...webContents, mainFrame }, isDestroyed: () => false };
  const eventFor = (frame = mainFrame) => ({ sender: win.webContents, senderFrame: frame });
  assert.equal(new URL(mainFrame.url).origin, 'null');
  assert.equal(isTrustedTopFrame(eventFor(), win), true);
  for (const url of [
    'https://app/index.html',
    'packmaster://evil/index.html',
    'packmaster://app:8080/index.html',
    'packmaster://user@app/index.html',
    'malformed url'
  ]) assert.equal(isTrustedTopFrame(eventFor({ url }), win), false, url);
  assert.equal(isTrustedTopFrame(eventFor({ url: mainFrame.url }), win), false, 'subframe');
  assert.equal(isTrustedTopFrame({ ...eventFor(), sender: {} }, win), false, 'other webContents');
});

test('store selector requires a confirmed and saved switch before relaunch', () => {
  assert.match(prepareSource, /window\.confirm\(/);
  assert.match(prepareSource, /window\.__pmPrepareStoreSwitch\(\)/);
  assert.equal((prepareSource.match(/window\.__pmCancelStoreSwitch\?\./g) || []).length, 2);
  assert.match(prepareSource, /ready !== true/);
  assert.match(prepareSource, /ข้อมูลจะไม่ถูกย้ายอัตโนมัติ/);
  assert.match(prepareSource, /button\.className = 'no-print'/);
  assert.match(prepareSource, /panel\.className = 'no-print'/);
  assert.match(prepareSource, /setAttribute\('aria-label', 'เลือกพื้นที่จัดเก็บ'\)/);
  assert.match(prepareSource, /event\.key === 'Escape'/);
  assert.match(pageSource, /@media print[\s\S]*?\.no-print\s*\{\s*display:\s*none\s*!important/);
});
