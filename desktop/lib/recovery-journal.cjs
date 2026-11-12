'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const JOURNAL_DIRECTORY = 'recovery';
const JOURNAL_FILENAME = 'journal.json';
const HISTORY_DIRECTORY = 'history';
const FORMAT_VERSION = 1;
const MAX_JOURNAL_BYTES = 64 * 1024 * 1024;
const MIN_FREE_BYTES = 1024 * 1024;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function validateBackup(backup) {
  if (!plainObject(backup) || backup.schema !== 'packmaster-workspace-backup' || backup.version !== 1) {
    throw new Error('Workspace backup schema or version is unsupported');
  }
  if (typeof backup.createdAt !== 'string' || Number.isNaN(Date.parse(backup.createdAt)) || typeof backup.appVersion !== 'string' || !plainObject(backup.settings)) {
    throw new Error('Workspace backup metadata is invalid');
  }
  for (const key of ['skuRules', 'batches', 'batchOrders']) {
    if (!Array.isArray(backup[key])) throw new Error(`Workspace backup ${key} must be an array`);
  }
  for (const [index, rule] of backup.skuRules.entries()) {
    if (!plainObject(rule) || typeof rule.keyword !== 'string' || !rule.keyword.trim() || typeof rule.shortName !== 'string' || !rule.shortName.trim()) {
      throw new Error(`Workspace backup skuRules[${index}] is invalid`);
    }
  }
  const batchIds = new Set();
  for (const batch of backup.batches) {
    if (!plainObject(batch) || typeof batch.id !== 'string' || !batch.id.trim() || batchIds.has(batch.id)) {
      throw new Error('Workspace backup contains an invalid or duplicate batch ID');
    }
    batchIds.add(batch.id);
  }
  const orderBatchIds = new Set();
  for (const record of backup.batchOrders) {
    if (!plainObject(record) || typeof record.batchId !== 'string' || !batchIds.has(record.batchId) || orderBatchIds.has(record.batchId) || !Array.isArray(record.orders)) {
      throw new Error('Workspace backup batch orders are invalid');
    }
    orderBatchIds.add(record.batchId);
    const orderIds = new Set();
    for (const order of record.orders) {
      if (!plainObject(order) || typeof order.id !== 'string' || !order.id.trim() || orderIds.has(order.id) || !Array.isArray(order.parsedItems)) {
        throw new Error('Workspace backup contains an invalid or duplicate order');
      }
      orderIds.add(order.id);
      for (const item of order.parsedItems) {
        if (!plainObject(item) || typeof item.text !== 'string' || !item.text.trim() || !Number.isInteger(item.qty) || item.qty < 1) {
          throw new Error('Workspace backup contains an invalid parsed item');
        }
      }
    }
  }
  for (const batchId of batchIds) {
    if (!orderBatchIds.has(batchId)) throw new Error('Workspace backup is missing batch order data');
  }
}

function serializeSnapshot({ backup, localStorageEntries }) {
  validateBackup(backup);
  if (!Array.isArray(localStorageEntries) || localStorageEntries.length > 10000) {
    throw new Error('LocalStorage entries are invalid');
  }
  let totalEntryBytes = 0;
  const seenKeys = new Set();
  for (const entry of localStorageEntries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || entry[0].length > 4096) {
      throw new Error('LocalStorage entries must be string key/value pairs');
    }
    if (seenKeys.has(entry[0])) throw new Error('LocalStorage entries contain duplicate keys');
    seenKeys.add(entry[0]);
    totalEntryBytes += Buffer.byteLength(entry[0], 'utf8') + Buffer.byteLength(entry[1], 'utf8');
  }
  if (totalEntryBytes > MAX_JOURNAL_BYTES) throw new Error('Recovery snapshot exceeds the supported size');
  const serialized = JSON.stringify({ backup, localStorageEntries });
  if (Buffer.byteLength(serialized, 'utf8') > MAX_JOURNAL_BYTES - MIN_FREE_BYTES) {
    throw new Error('Recovery snapshot exceeds the supported size');
  }
  return JSON.parse(serialized);
}

function assertNoSymlink(profilePath, targetPath, fsOps) {
  const absoluteProfile = path.resolve(profilePath);
  const absoluteTarget = path.resolve(targetPath);
  const relative = path.relative(absoluteProfile, absoluteTarget);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Recovery journal path must stay inside the active profile');
  }
  for (const candidate of [absoluteProfile, ...relative.split(path.sep).filter(Boolean).reduce((paths, part) => {
    paths.push(path.join(paths.length ? paths[paths.length - 1] : absoluteProfile, part));
    return paths;
  }, [])]) {
    try {
      const info = fsOps.lstatSync(candidate);
      if (info.isSymbolicLink()) throw new Error('Recovery profile path cannot contain symlinks or junctions');
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
      throw error;
    }
  }
}

function createRecoveryJournal({ profilePath, storeId, fsOps = {} }) {
  if (typeof profilePath !== 'string' || !path.isAbsolute(profilePath)) throw new Error('Active profile path is invalid');
  if (typeof storeId !== 'string' || !storeId || storeId.length > 128) throw new Error('Active store ID is invalid');

  const ops = Object.create(fs);
  Object.assign(ops, fsOps);
  const journalDirectory = path.join(path.resolve(profilePath), JOURNAL_DIRECTORY);
  const journalPath = path.join(journalDirectory, JOURNAL_FILENAME);
  const historyDirectory = path.join(journalDirectory, HISTORY_DIRECTORY);

  function validateStoredSnapshot(snapshot) {
    if (!plainObject(snapshot) || snapshot.storeId !== storeId || typeof snapshot.id !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(snapshot.id)) throw new Error('Recovery journal store binding is invalid');
    serializeSnapshot({ backup: snapshot.backup, localStorageEntries: snapshot.localStorageEntries });
  }

  function ensureHistoryDirectory() {
    assertNoSymlink(profilePath, historyDirectory, ops);
    try { ops.mkdirSync(historyDirectory); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    assertNoSymlink(profilePath, historyDirectory, ops);
    if (!ops.lstatSync(historyDirectory).isDirectory()) throw new Error('Recovery history directory is invalid');
  }

  function ensureDirectory() {
    assertNoSymlink(profilePath, journalDirectory, ops);
    try { ops.mkdirSync(journalDirectory); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    assertNoSymlink(profilePath, journalPath, ops);
    const directoryInfo = ops.lstatSync(journalDirectory);
    if (!directoryInfo.isDirectory()) throw new Error('Recovery journal directory is invalid');
  }

  function readJournal() {
    ensureDirectory();
    try {
      const raw = ops.readFileSync(journalPath, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > MAX_JOURNAL_BYTES) throw new Error('Recovery journal is too large');
      const journal = JSON.parse(raw);
      if (!plainObject(journal) || journal.formatVersion !== FORMAT_VERSION || journal.storeId !== storeId ||
          !plainObject(journal.snapshot) || !['pending', 'completed'].includes(journal.phase)) {
        throw new Error('Recovery journal is invalid');
      }
      validateStoredSnapshot(journal.snapshot);
      return journal;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  function atomicWrite(journal) {
    const contents = JSON.stringify(journal);
    const bytes = Buffer.byteLength(contents, 'utf8');
    if (bytes > MAX_JOURNAL_BYTES) throw new Error('Recovery snapshot exceeds the supported size');
    ensureDirectory();
    if (typeof ops.statfsSync === 'function') {
      const stats = ops.statfsSync(journalDirectory);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (!Number.isFinite(freeBytes) || freeBytes < bytes + MIN_FREE_BYTES) throw Object.assign(new Error('Insufficient disk space for recovery snapshot'), { code: 'ENOSPC' });
    }
    const tempPath = path.join(journalDirectory, `.journal-${randomUUID()}.tmp`);
    assertNoSymlink(profilePath, tempPath, ops);
    let descriptor;
    try {
      descriptor = ops.openSync(tempPath, 'wx', 0o600);
      ops.writeFileSync(descriptor, contents, { encoding: 'utf8' });
      ops.fsyncSync(descriptor);
      ops.closeSync(descriptor);
      descriptor = undefined;
      ops.renameSync(tempPath, journalPath);
      // File contents are flushed before the atomic rename. Directory fsync is
      // not supported on every Windows filesystem, so it is intentionally omitted.
    } catch (error) {
      if (descriptor !== undefined) {
        try { ops.closeSync(descriptor); } catch {}
      }
      try { ops.unlinkSync(tempPath); } catch {}
      throw error;
    }
  }

  function archiveCompletedSnapshot(journal) {
    if (!journal || journal.phase !== 'completed') return;
    const snapshot = journal.snapshot;
    validateStoredSnapshot(snapshot);
    ensureHistoryDirectory();
    const archivePath = path.join(historyDirectory, `${snapshot.id}.json`);
    assertNoSymlink(profilePath, archivePath, ops);
    const archiveContents = JSON.stringify({
      formatVersion: FORMAT_VERSION,
      storeId,
      phase: 'completed',
      updatedAt: journal.updatedAt,
      snapshot
    });
    try {
      const existing = JSON.parse(ops.readFileSync(archivePath, 'utf8'));
      if (!plainObject(existing) || existing.formatVersion !== FORMAT_VERSION || existing.storeId !== storeId ||
          existing.phase !== 'completed' || JSON.stringify(existing.snapshot) !== JSON.stringify(snapshot)) {
        throw new Error('Existing recovery history entry does not match the completed snapshot');
      }
      validateStoredSnapshot(existing.snapshot);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (typeof ops.statfsSync === 'function') {
      const stats = ops.statfsSync(historyDirectory);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (!Number.isFinite(freeBytes) || freeBytes < Buffer.byteLength(archiveContents, 'utf8') + MIN_FREE_BYTES) {
        throw Object.assign(new Error('Insufficient disk space to retain the completed recovery snapshot'), { code: 'ENOSPC' });
      }
    }
    const temporaryPath = path.join(historyDirectory, `.${snapshot.id}-${randomUUID()}.tmp`);
    assertNoSymlink(profilePath, temporaryPath, ops);
    let descriptor;
    try {
      descriptor = ops.openSync(temporaryPath, 'wx', 0o600);
      ops.writeFileSync(descriptor, archiveContents, { encoding: 'utf8' });
      ops.fsyncSync(descriptor);
      ops.closeSync(descriptor);
      descriptor = undefined;
      // linkSync creates the immutable archive name only if it does not exist.
      ops.linkSync(temporaryPath, archivePath);
      ops.unlinkSync(temporaryPath);
    } catch (error) {
      if (descriptor !== undefined) {
        try { ops.closeSync(descriptor); } catch {}
      }
      try { ops.unlinkSync(temporaryPath); } catch {}
      throw error;
    }
  }

  return {
    getPending() {
      const journal = readJournal();
      if (!journal || journal.phase !== 'pending') return null;
      return {
        id: journal.snapshot.id,
        storeId,
        backup: journal.snapshot.backup,
        localStorageEntries: journal.snapshot.localStorageEntries
      };
    },
    prepare(payload) {
      const snapshotData = serializeSnapshot(payload);
      const existing = readJournal();
      if (existing && existing.phase === 'pending') throw new Error('A recovery snapshot is already pending');
      archiveCompletedSnapshot(existing);
      const id = randomUUID();
      atomicWrite({
        formatVersion: FORMAT_VERSION,
        storeId,
        phase: 'pending',
        updatedAt: new Date().toISOString(),
        snapshot: { id, storeId, ...snapshotData }
      });
      return { id };
    },
    complete(payload) {
      if (!plainObject(payload) || typeof payload.id !== 'string') throw new Error('Recovery snapshot ID is required');
      const journal = readJournal();
      if (!journal || journal.phase !== 'pending' || journal.snapshot.id !== payload.id) {
        throw new Error('Recovery snapshot ID does not match the pending snapshot');
      }
      atomicWrite({ ...journal, phase: 'completed', updatedAt: new Date().toISOString() });
      return { success: true };
    }
  };
}

module.exports = { createRecoveryJournal };
