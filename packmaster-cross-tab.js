(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterCrossTab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STALE_WRITE_CODE = 'stale_local_write';
  const STALE_LOCAL_MESSAGE = 'ข้อมูลชื่อหรือทะเบียนถูกแก้จากอีกแท็บหรืออีกหน้าต่างแล้ว กรุณาโหลดหน้าใหม่และตรวจรายการก่อนบันทึก';
  const STALE_BATCH_MESSAGE = 'Batch นี้ถูกแก้จากอีกแท็บแล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึกต่อ';

  function createStaleError(message) {
    const error = new Error(message);
    error.code = STALE_WRITE_CODE;
    return error;
  }

  function sameState(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  // Re-read the latest persisted naming + registry state right before a write.
  // Refuses the write when it no longer matches what this tab last loaded, so a
  // stale tab can never overwrite another tab's edit. Returns the latest state
  // (the write must be built from it, not from the in-memory copy).
  function readLocalNamingState({ storage, matcherApi, registryApi, expectedAssignments, expectedRegistry, message = STALE_LOCAL_MESSAGE }) {
    if (!storage || !matcherApi || !registryApi) throw new Error('Local storage modules are unavailable');
    let latestAssignments;
    try {
      latestAssignments = matcherApi.loadLocalAssignments(storage);
    } catch (error) {
      throw new Error('ข้อมูลชื่อถาวรอ่านไม่ได้ กรุณากู้คืนข้อมูลจาก Backup ก่อน แล้วจึงบันทึกใหม่');
    }
    const latestRegistry = registryApi.loadStore(storage);
    if (latestRegistry.error || !latestRegistry.store) {
      throw createStaleError('ทะเบียน Local เปลี่ยนหรืออ่านไม่ครบ กรุณาโหลดทะเบียนใหม่และเลือกแถวอีกครั้ง');
    }
    // Missing in-memory state is a load problem, not a concurrent change: say so instead.
    if (!expectedAssignments || !expectedRegistry) throw new Error('ข้อมูลชื่อหรือทะเบียนยังโหลดไม่ครบ กรุณาโหลดหน้าใหม่');
    // Whole-store comparison (including local products), except updatedAt: an empty store is stamped with "now" on every read.
    const withoutStamp = store => {
      const { updatedAt, ...rest } = registryApi.validateStore(store);
      return rest;
    };
    const assignmentsMatch = sameState(latestAssignments, matcherApi.validateAssignments(expectedAssignments));
    const registryMatch = sameState(withoutStamp(latestRegistry.store), withoutStamp(expectedRegistry));
    if (!assignmentsMatch || !registryMatch) throw createStaleError(message);
    return { assignments: latestAssignments, store: latestRegistry.store };
  }

  // Decide what a tab should do before writing one raw localStorage value it owns.
  //  - stored text already equals the new text: adopt it (no write), e.g. after a restore wrote the same text
  //  - stored text differs from what this tab last wrote/recorded: another tab changed it, so refuse
  //  - otherwise: write (this includes the first write after mount, when nothing is recorded yet)
  function decideRawWrite({ storedRaw, knownRaw, nextRaw }) {
    if (storedRaw === nextRaw) return { action: 'adopt' };
    if (knownRaw !== null && knownRaw !== undefined && storedRaw !== knownRaw) return { action: 'stale' };
    return { action: 'write' };
  }

  // Batch orders live in IndexedDB, which has no storage event. Before writing a batch this
  // tab already knows, compare the stored updatedAt with the version this tab last saved.
  // A missing stored row means another tab deleted it, so writing would resurrect it.
  function assertBatchNotChangedElsewhere(storedMeta, knownUpdatedAt) {
    if (!storedMeta || storedMeta.updatedAt !== knownUpdatedAt) throw createStaleError(STALE_BATCH_MESSAGE);
  }

  // Wraps the IndexedDB batch API. Every batch this tab loads or saves is remembered
  // with its updatedAt; a later save first re-reads the stored batch and refuses if
  // another tab saved it since. Saves run one at a time so this tab never races itself.
  function createBatchVersionGuard(rawBatchApi) {
    if (!rawBatchApi) return rawBatchApi;
    const knownUpdatedAt = new Map();
    let queue = Promise.resolve();
    const enqueue = task => {
      const run = queue.then(task);
      queue = run.catch(() => {});
      return run;
    };
    return {
      ...rawBatchApi,
      // Loads go through the same queue as saves, so a load can never record an older version
      // after a save that was already in flight has written a newer one.
      loadBatch(batchId, options) {
        return enqueue(async () => {
          const loaded = await rawBatchApi.loadBatch(batchId, options);
          if (loaded && loaded.meta) knownUpdatedAt.set(batchId, loaded.meta.updatedAt);
          return loaded;
        });
      },
      saveBatch(meta, orders) {
        return enqueue(async () => {
          if (meta && knownUpdatedAt.has(meta.id)) {
            // listBatches reads only the small metadata rows, not the (large) orders array.
            const rows = await rawBatchApi.listBatches();
            const current = (Array.isArray(rows) ? rows : []).find(row => row && row.id === meta.id) || null;
            assertBatchNotChangedElsewhere(current, knownUpdatedAt.get(meta.id));
          }
          const stored = await rawBatchApi.saveBatch(meta, orders);
          if (stored && stored.id) knownUpdatedAt.set(stored.id, stored.updatedAt);
          return stored;
        });
      },
      deleteBatch(batchId) {
        return enqueue(async () => {
          const result = await rawBatchApi.deleteBatch(batchId);
          knownUpdatedAt.delete(batchId);
          return result;
        });
      }
    };
  }

  // Calls onChange(key) when another tab changes one of `keys`. A null key means
  // the other tab cleared storage. Returns a function that removes the listener.
  function watchLocalDataChanges(win, keys, onChange) {
    if (!win || typeof win.addEventListener !== 'function') return () => {};
    const watched = new Set(keys);
    const handler = event => {
      if (event.key === null || watched.has(event.key)) onChange(event.key);
    };
    win.addEventListener('storage', handler);
    return () => win.removeEventListener('storage', handler);
  }

  return {
    STALE_WRITE_CODE,
    STALE_LOCAL_MESSAGE,
    STALE_BATCH_MESSAGE,
    readLocalNamingState,
    decideRawWrite,
    assertBatchNotChangedElsewhere,
    createBatchVersionGuard,
    watchLocalDataChanges
  };
});
