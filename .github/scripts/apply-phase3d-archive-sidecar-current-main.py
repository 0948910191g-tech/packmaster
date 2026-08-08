from pathlib import Path

index_path = Path('index.html')
storage_path = Path('packmaster-storage-health.js')
html = index_path.read_text(encoding='utf-8')
storage = storage_path.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    return text.replace(old, new, 1)

# Archive module is a LocalStorage sidecar; Batch IndexedDB adapter stays frozen.
html = replace_once(
    html,
    '  <script src="./packmaster-exceptions.js"></script>\n',
    '  <script src="./packmaster-exceptions.js"></script>\n  <script src="./packmaster-archive.js"></script>\n',
    'archive script include'
)

html = replace_once(
    html,
    '      const exceptionApi = window.PackMasterExceptions;\n      const storageHealthApi = window.PackMasterStorageHealth;',
    '      const exceptionApi = window.PackMasterExceptions;\n      const archiveApi = window.PackMasterArchive;\n      const storageHealthApi = window.PackMasterStorageHealth;',
    'archive API binding'
)

old_derived = '''      const activeBatch = useMemo(() => batches.find(batch => batch.id === activeBatchId) || null, [batches, activeBatchId]);
      const visibleBatches = useMemo(() => batches.filter(batch => {
        if (batchViewFilter === 'ARCHIVED') return Boolean(batch.archivedAt);
        if (batchViewFilter === 'ACTIVE') return !batch.archivedAt;
        return true;
      }), [batches, batchViewFilter]);
      const archivedBatchCount = useMemo(() => batches.filter(batch => Boolean(batch.archivedAt)).length, [batches]);
'''
new_derived = '''      const activeBatch = useMemo(() => batches.find(batch => batch.id === activeBatchId) || null, [batches, activeBatchId]);
      const getBatchArchivedAt = (batch) => archiveApi && batch
        ? archiveApi.getArchivedAt(batch.id, batch.archivedAt || null)
        : (batch?.archivedAt || null);
      const visibleBatches = useMemo(() => batches.filter(batch => {
        const archivedAt = getBatchArchivedAt(batch);
        if (batchViewFilter === 'ARCHIVED') return Boolean(archivedAt);
        if (batchViewFilter === 'ACTIVE') return !archivedAt;
        return true;
      }), [batches, batchViewFilter]);
      const archivedBatchCount = useMemo(() => batches.filter(batch => Boolean(getBatchArchivedAt(batch))).length, [batches]);
'''
html = replace_once(html, old_derived, new_derived, 'archive derived view')

old_handlers = '''      const handleArchiveBatch = async (batch) => {
        if (!batch || !batch.id || !batchApi || !batchStorageReady) { showToast('Browser storage ยังไม่พร้อม', 'error'); return; }
        const unresolved = (batch.reviewSkuCount || 0) + (batch.reviewQtyCount || 0) + (batch.unmappedCount || 0);
        if (unresolved > 0 && !window.confirm(`Batch นี้ยังมี ${unresolved} รายการที่ต้องตรวจ\\n\\nต้องการเก็บเข้าคลังต่อหรือไม่?`)) return;
        try {
          const updated = await batchApi.archiveBatch(batch.id, new Date());
          upsertBatchMeta(updated);
          setSelectedArchivedBatchIds(prev => prev.filter(id => id !== batch.id));
          showToast('เก็บ Batch เข้าคลังแล้ว', 'success');
        } catch (err) { console.error('Archive batch failed', err); showToast('เก็บ Batch เข้าคลังไม่สำเร็จ — ข้อมูลเดิมยังอยู่', 'error'); }
      };

      const handleRestoreArchivedBatch = async (batch) => {
        if (!batch || !batch.id || !batchApi || !batchStorageReady) { showToast('Browser storage ยังไม่พร้อม', 'error'); return; }
        try {
          const updated = await batchApi.restoreArchivedBatch(batch.id, new Date());
          upsertBatchMeta(updated);
          setSelectedArchivedBatchIds(prev => prev.filter(id => id !== batch.id));
          showToast('นำ Batch กลับจากคลังแล้ว', 'success');
        } catch (err) { console.error('Restore archived batch failed', err); showToast('นำ Batch กลับไม่สำเร็จ — ข้อมูลเดิมยังอยู่', 'error'); }
      };
'''
new_handlers = '''      const handleArchiveBatch = async (batch) => {
        if (!batch || !batch.id || !archiveApi) { showToast('Local Archive module ยังไม่พร้อม', 'error'); return; }
        const unresolved = (batch.reviewSkuCount || 0) + (batch.reviewQtyCount || 0) + (batch.unmappedCount || 0);
        if (unresolved > 0 && !window.confirm(`Batch นี้ยังมี ${unresolved} รายการที่ต้องตรวจ\\n\\nต้องการเก็บเข้าคลังต่อหรือไม่?`)) return;
        try {
          archiveApi.archiveBatch(batch.id, new Date());
          setBatches(prev => [...prev]);
          setSelectedArchivedBatchIds(prev => prev.filter(id => id !== batch.id));
          showToast('เก็บ Batch เข้าคลังแล้ว', 'success');
        } catch (err) { console.error('Archive sidecar failed', err); showToast('เก็บ Batch เข้าคลังไม่สำเร็จ — ข้อมูล Batch เดิมยังอยู่', 'error'); }
      };

      const handleRestoreArchivedBatch = async (batch) => {
        if (!batch || !batch.id || !archiveApi) { showToast('Local Archive module ยังไม่พร้อม', 'error'); return; }
        try {
          archiveApi.restoreBatch(batch.id, new Date());
          setBatches(prev => [...prev]);
          setSelectedArchivedBatchIds(prev => prev.filter(id => id !== batch.id));
          showToast('นำ Batch กลับจากคลังแล้ว', 'success');
        } catch (err) { console.error('Restore archive sidecar failed', err); showToast('นำ Batch กลับไม่สำเร็จ — ข้อมูล Batch เดิมยังอยู่', 'error'); }
      };
'''
html = replace_once(html, old_handlers, new_handlers, 'archive handlers')

html = replace_once(
    html,
    '          batches,\n          storage: storageHealth.supported === null ? null : storageHealth,',
    '          batches: batches.map(batch => ({ ...batch, archivedAt: getBatchArchivedAt(batch) })),\n          storage: storageHealth.supported === null ? null : storageHealth,',
    'diagnostics effective archive state'
)

html = replace_once(
    html,
    '          const result = await storageHealthApi.cleanupArchivedReprintImages(batchApi, selectedArchivedBatchIds);',
    '          const result = await storageHealthApi.cleanupArchivedReprintImages(batchApi, selectedArchivedBatchIds, (meta) => archiveApi ? archiveApi.isArchived(meta.id, meta.archivedAt || null) : Boolean(meta.archivedAt));',
    'storage cleanup archive predicate'
)

old_bulk = '''      const handleDeleteSelectedArchived = async () => {
        if (!batchApi || !batchStorageReady || selectedArchivedBatchIds.length === 0) return;
        if (!window.confirm(`ลบ Batch ที่เก็บเข้าคลังแล้ว ${selectedArchivedBatchIds.length} รายการถาวรจาก Browser นี้หรือไม่?\\n\\nการลบนี้ย้อนกลับไม่ได้ เว้นแต่มี Workspace Backup`)) return;
        try {
          const result = await batchApi.deleteArchivedBatches(selectedArchivedBatchIds);
          const removed = new Set(selectedArchivedBatchIds);
          setBatches(prev => prev.filter(batch => !removed.has(batch.id) || !batch.archivedAt));
          setSelectedArchivedBatchIds([]);
          showToast(`ลบ Archived Batch แล้ว ${result.deleted} รายการ`, 'success');
        } catch (err) { console.error('Delete archived batches failed', err); showToast('ลบ Archived Batch ไม่สำเร็จ — ข้อมูลที่ลบไม่สำเร็จยังอยู่', 'error'); }
      };
'''
new_bulk = '''      const handleDeleteSelectedArchived = async () => {
        if (!batchApi || !batchStorageReady || selectedArchivedBatchIds.length === 0) return;
        const deletableIds = selectedArchivedBatchIds.filter(batchId => {
          const batch = batches.find(row => row.id === batchId);
          return batch && Boolean(getBatchArchivedAt(batch));
        });
        if (deletableIds.length === 0) { setSelectedArchivedBatchIds([]); return; }
        if (!window.confirm(`ลบ Batch ที่เก็บเข้าคลังแล้ว ${deletableIds.length} รายการถาวรจาก Browser นี้หรือไม่?\\n\\nการลบนี้ย้อนกลับไม่ได้ เว้นแต่มี Workspace Backup`)) return;
        const deletedIds = [];
        try {
          for (const batchId of deletableIds) {
            await batchApi.deleteBatch(batchId);
            if (archiveApi) archiveApi.clearBatchArchive(batchId);
            if (duplicateApi) duplicateApi.clearBatchFingerprints(batchId);
            deletedIds.push(batchId);
          }
          const removed = new Set(deletedIds);
          setBatches(prev => prev.filter(batch => !removed.has(batch.id)));
          setSelectedArchivedBatchIds([]);
          showToast(`ลบ Archived Batch แล้ว ${deletedIds.length} รายการ`, 'success');
        } catch (err) {
          if (deletedIds.length > 0) {
            const removed = new Set(deletedIds);
            setBatches(prev => prev.filter(batch => !removed.has(batch.id)));
            setSelectedArchivedBatchIds(prev => prev.filter(id => !removed.has(id)));
          }
          console.error('Delete archived batches failed', err);
          showToast(`ลบ Archived Batch ได้ ${deletedIds.length} รายการก่อนพบปัญหา — รายการที่ยังไม่ลบยังอยู่`, 'error');
        }
      };
'''
html = replace_once(html, old_bulk, new_bulk, 'bulk archived delete')

html = replace_once(
    html,
    '''          if (duplicateApi) {
            try { duplicateApi.clearBatchFingerprints(batch.id); }
            catch (fingerprintError) { console.warn('Clear duplicate fingerprint sidecar failed', fingerprintError); }
          }
          setBatches(prev => prev.filter(item => item.id !== batch.id));''',
    '''          if (duplicateApi) {
            try { duplicateApi.clearBatchFingerprints(batch.id); }
            catch (fingerprintError) { console.warn('Clear duplicate fingerprint sidecar failed', fingerprintError); }
          }
          if (archiveApi) {
            try { archiveApi.clearBatchArchive(batch.id); }
            catch (archiveError) { console.warn('Clear archive sidecar failed', archiveError); }
          }
          setBatches(prev => prev.filter(item => item.id !== batch.id));''',
    'single delete archive cleanup'
)

html = replace_once(
    html,
    '''              thermalMode,
              duplicateFingerprints: duplicateApi ? duplicateApi.exportFingerprintStore() : {}
            },''',
    '''              thermalMode,
              duplicateFingerprints: duplicateApi ? duplicateApi.exportFingerprintStore() : {},
              archiveState: archiveApi ? archiveApi.exportArchiveStore() : {}
            },''',
    'workspace backup archive state'
)

html = replace_once(
    html,
    '''          const backup = workspaceApi.validateBackup(parsed);
          if (duplicateApi) duplicateApi.validateFingerprintStore(backup.settings.duplicateFingerprints || {});
          const summary = workspaceApi.getBackupSummary(backup);''',
    '''          const backup = workspaceApi.validateBackup(parsed);
          if (duplicateApi) duplicateApi.validateFingerprintStore(backup.settings.duplicateFingerprints || {});
          if (archiveApi) archiveApi.validateArchiveStore(backup.settings.archiveState || {});
          const summary = workspaceApi.getBackupSummary(backup);''',
    'workspace archive prevalidation'
)

html = replace_once(
    html,
    '''        const previousThermalMode = thermalMode;
        const previousDuplicateFingerprints = duplicateApi ? duplicateApi.exportFingerprintStore() : {};
        let safetyBackup = null;''',
    '''        const previousThermalMode = thermalMode;
        const previousDuplicateFingerprints = duplicateApi ? duplicateApi.exportFingerprintStore() : {};
        const previousArchiveState = archiveApi ? archiveApi.exportArchiveStore() : {};
        let safetyBackup = null;''',
    'workspace previous archive state'
)

html = replace_once(
    html,
    '''              thermalMode: previousThermalMode,
              duplicateFingerprints: previousDuplicateFingerprints
            },''',
    '''              thermalMode: previousThermalMode,
              duplicateFingerprints: previousDuplicateFingerprints,
              archiveState: previousArchiveState
            },''',
    'workspace safety archive state'
)

html = replace_once(
    html,
    '''          await workspaceApi.replaceWorkspaceBatches(backup, batchApi);
          if (duplicateApi) duplicateApi.replaceFingerprintStore(backup.settings.duplicateFingerprints || {});

          setSkuRules(restoredRules);''',
    '''          await workspaceApi.replaceWorkspaceBatches(backup, batchApi);
          if (duplicateApi) duplicateApi.replaceFingerprintStore(backup.settings.duplicateFingerprints || {});
          if (archiveApi) archiveApi.replaceArchiveStore(backup.settings.archiveState || {});

          setSkuRules(restoredRules);''',
    'workspace restore archive state'
)

html = replace_once(
    html,
    '''              await workspaceApi.replaceWorkspaceBatches(safetyBackup, batchApi);
              if (duplicateApi) duplicateApi.replaceFingerprintStore(previousDuplicateFingerprints);
              const previousBatches = await batchApi.listBatches();''',
    '''              await workspaceApi.replaceWorkspaceBatches(safetyBackup, batchApi);
              if (duplicateApi) duplicateApi.replaceFingerprintStore(previousDuplicateFingerprints);
              if (archiveApi) archiveApi.replaceArchiveStore(previousArchiveState);
              const previousBatches = await batchApi.listBatches();''',
    'workspace rollback archive state'
)

# Batch cards consume effective archive state (sidecar first, legacy metadata fallback).
html = replace_once(html, '{batch.archivedAt ? (', '{getBatchArchivedAt(batch) ? (', 'archive card action conditional')
html = replace_once(html, '{batch.archivedAt && <button onClick={() => handleRestoreArchivedBatch(batch)}', '{getBatchArchivedAt(batch) && <button onClick={() => handleRestoreArchivedBatch(batch)}', 'archive restore button conditional')

# Storage Health must never decide archival status from IndexedDB metadata alone.
storage = replace_once(
    storage,
    '  const cleanupArchivedReprintImages = async (batchApi, batchIds) => {',
    '  const cleanupArchivedReprintImages = async (batchApi, batchIds, isArchived) => {',
    'storage cleanup signature'
)
storage = replace_once(
    storage,
    '''    if (!batchApi || typeof batchApi.loadBatch !== 'function' || typeof batchApi.saveBatch !== 'function') {
      throw new Error('Local Batch API is required');
    }

    const ids =''',
    '''    if (!batchApi || typeof batchApi.loadBatch !== 'function' || typeof batchApi.saveBatch !== 'function') {
      throw new Error('Local Batch API is required');
    }
    if (typeof isArchived !== 'function') {
      throw new Error('Archive state predicate is required for safe cleanup');
    }

    const ids =''',
    'storage cleanup predicate guard'
)
storage = replace_once(
    storage,
    '''      const loaded = await batchApi.loadBatch(batchId);
      if (!loaded || !loaded.meta || !loaded.meta.archivedAt) {
        skippedBatches += 1;
        continue;
      }
''',
    '''      const loaded = await batchApi.loadBatch(batchId);
      if (!loaded || !loaded.meta || !isArchived(loaded.meta)) {
        skippedBatches += 1;
        continue;
      }
''',
    'storage cleanup archive decision'
)

index_path.write_text(html, encoding='utf-8')
storage_path.write_text(storage, encoding='utf-8')
print('Phase 3D archive sidecar correction applied on current main')
