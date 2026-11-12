'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const LEGACY_STORE_ID = 'legacy';
const CATALOG_NAME = 'store-catalog.json';
const STORE_ID_PATTERN = /^store_[a-f0-9]{32}$/;

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function assertRealDirectory(directory, description) {
  const info = fs.lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${description} must be a real directory, not a symlink or junction`);
  }
}

function assertContainedPath(basePath, candidate) {
  if (!isWithin(basePath, candidate)) throw new Error('Store profile path escapes the base profile');
  let current = basePath;
  const relative = path.relative(basePath, candidate);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        throw new Error('Store profile path cannot contain symlinks or junctions');
      }
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') break;
      throw error;
    }
  }
  const canonicalBase = fs.realpathSync.native(basePath);
  let probe = candidate;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) throw new Error('Store profile path cannot be resolved');
    probe = parent;
  }
  const canonicalProbe = fs.realpathSync.native(probe);
  if (canonicalProbe !== canonicalBase && !isWithin(canonicalBase, canonicalProbe)) {
    throw new Error('Store profile path resolves outside the base profile');
  }
}

function readCatalogState(basePath) {
  const file = path.join(basePath, CATALOG_NAME);
  if (!fs.existsSync(file)) return { stores: [], preferredStoreId: undefined };
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Store catalog cannot be a symlink');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error('Store catalog is malformed and was left untouched: ' + error.message);
  }
  if (!parsed || parsed.schema !== 'packmaster-desktop-store-catalog' || parsed.version !== 1 || !Array.isArray(parsed.stores)) {
    throw new Error('Store catalog has an unsupported format and was left untouched');
  }
  if (parsed.preferredStoreId !== undefined &&
      (typeof parsed.preferredStoreId !== 'string' ||
       (parsed.preferredStoreId !== LEGACY_STORE_ID && !STORE_ID_PATTERN.test(parsed.preferredStoreId)))) {
    throw new Error('Store catalog has an invalid preferred store and was left untouched');
  }
  const seen = new Set();
  for (const store of parsed.stores) {
    if (!store || typeof store.id !== 'string' || !STORE_ID_PATTERN.test(store.id) ||
        typeof store.label !== 'string' || !store.label.trim() || store.label.length > 80 || seen.has(store.id)) {
      throw new Error('Store catalog has invalid entries and was left untouched');
    }
    seen.add(store.id);
  }
  if (parsed.preferredStoreId !== undefined && parsed.preferredStoreId !== LEGACY_STORE_ID && !seen.has(parsed.preferredStoreId)) {
    throw new Error('Store catalog preferred store is not registered and was left untouched');
  }
  return { stores: parsed.stores, preferredStoreId: parsed.preferredStoreId };
}

function readCatalog(basePath) { return readCatalogState(basePath).stores; }

function writeCatalog(basePath, stores, preferredStoreId) {
  const file = path.join(basePath, CATALOG_NAME);
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Store catalog cannot be a symlink');
  const temporary = path.join(basePath, `.${CATALOG_NAME}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    const document = { schema: 'packmaster-desktop-store-catalog', version: 1, stores };
    if (preferredStoreId !== undefined) document.preferredStoreId = preferredStoreId;
    fs.writeFileSync(fd, JSON.stringify(document, null, 2) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function validateBase(basePath) {
  const resolved = path.resolve(basePath);
  assertRealDirectory(resolved, 'Base profile');
  return resolved;
}

function listStores(basePath) {
  const base = validateBase(basePath);
  return [
    { id: LEGACY_STORE_ID, label: 'พื้นที่เดิม (ยังไม่ระบุร้าน)', legacy: true },
    ...readCatalog(base).map(store => ({ ...store, legacy: false }))
  ];
}

function createStore({ basePath, label }) {
  const base = validateBase(basePath);
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 80) {
    throw new Error('Store label must contain 1 to 80 characters');
  }
  const lockPath = path.join(base, '.store-catalog.lock');
  const lockToken = crypto.randomBytes(24).toString('hex');
  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(lockFd, lockToken, 'utf8');
    fs.fsyncSync(lockFd);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another Packmaster process is changing the store catalog; try again shortly');
    throw error;
  }
  try {
    const catalog = readCatalogState(base);
    const stores = catalog.stores;
    const storesRoot = path.join(base, 'stores');
    if (fs.existsSync(storesRoot)) assertRealDirectory(storesRoot, 'Store directory');
    else fs.mkdirSync(storesRoot);
    const id = 'store_' + crypto.randomBytes(16).toString('hex');
    const profilePath = path.join(storesRoot, id);
    assertContainedPath(base, profilePath);
    fs.mkdirSync(profilePath);
    const store = { id, label: label.trim() };
    writeCatalog(base, [...stores, store], catalog.preferredStoreId);
    return { ...store, profilePath };
  } catch (error) {
    // Keep the empty directory for diagnosis; never remove profile data implicitly.
    throw error;
  } finally {
    fs.closeSync(lockFd);
    try {
      const info = fs.lstatSync(lockPath);
      if (info.isFile() && !info.isSymbolicLink() && fs.readFileSync(lockPath, 'utf8') === lockToken) fs.unlinkSync(lockPath);
    } catch {}
  }
}

function withCatalogLock(basePath, update) {
  const base = validateBase(basePath);
  const lockPath = path.join(base, '.store-catalog.lock');
  const lockToken = crypto.randomBytes(24).toString('hex');
  const lockFd = fs.openSync(lockPath, 'wx', 0o600);
  try {
    fs.writeFileSync(lockFd, lockToken, 'utf8');
    fs.fsyncSync(lockFd);
    const catalog = readCatalogState(base);
    return update(catalog);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another Packmaster process is changing the store catalog; try again shortly');
    throw error;
  } finally {
    fs.closeSync(lockFd);
    try {
      const info = fs.lstatSync(lockPath);
      if (info.isFile() && !info.isSymbolicLink() && fs.readFileSync(lockPath, 'utf8') === lockToken) fs.unlinkSync(lockPath);
    } catch {}
  }
}

function getPreferredStore(basePath) {
  const base = validateBase(basePath);
  return readCatalogState(base).preferredStoreId ?? null;
}

function setPreferredStore(basePath, storeId) {
  const base = validateBase(basePath);
  if (storeId !== LEGACY_STORE_ID && (typeof storeId !== 'string' || !STORE_ID_PATTERN.test(storeId))) {
    throw new Error('Invalid preferred store id');
  }
  return withCatalogLock(base, catalog => {
    if (storeId !== LEGACY_STORE_ID && !catalog.stores.some(store => store.id === storeId)) throw new Error('Preferred store is not registered');
    writeCatalog(base, catalog.stores, storeId);
    return storeId;
  });
}

function resolveStoreProfile(basePath, storeId) {
  const base = validateBase(basePath);
  if (storeId === LEGACY_STORE_ID) return base;
  if (typeof storeId !== 'string' || !STORE_ID_PATTERN.test(storeId)) throw new Error('Invalid store id');
  const store = readCatalog(base).find(entry => entry.id === storeId);
  if (!store) throw new Error('Store id was not found in the base profile catalog');
  const profilePath = path.join(base, 'stores', storeId);
  assertContainedPath(base, profilePath);
  if (fs.existsSync(profilePath)) assertRealDirectory(profilePath, 'Store profile');
  else throw new Error('Store profile directory is missing');
  return profilePath;
}

module.exports = {
  CATALOG_NAME,
  LEGACY_STORE_ID,
  createStore,
  getPreferredStore,
  listStores,
  resolveStoreProfile,
  setPreferredStore
};
