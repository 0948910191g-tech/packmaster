from pathlib import Path

index_path = Path('index.html')
html = index_path.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    return text.replace(old, new, 1)

html = replace_once(
    html,
    '              const duplicate = duplicateApi.findExactFileDuplicate(fileHash, activeBatch?.sourceFiles || []);',
    '              const knownFingerprints = duplicateApi.getKnownFingerprints(activeBatchId, orders.length > 0 ? (activeBatch?.sourceFiles || []) : []);\n              const duplicate = duplicateApi.findExactFileDuplicate(fileHash, knownFingerprints);',
    'duplicate read path'
)

old_block = '''            if (activeBatch && acceptedSourceFiles.length > 0) {
              const nextMeta = {
                ...activeBatch,
                sourceFiles: [...(Array.isArray(activeBatch.sourceFiles) ? activeBatch.sourceFiles : []), ...acceptedSourceFiles],
                printedAt: null,
                updatedAt: new Date().toISOString()
              };
              upsertBatchMeta(nextMeta);
              if (batchStorageReady && batchApi) {
                try {
                  await batchApi.saveBatch(nextMeta, [...orders, ...allNewOrders]);
                } catch (sourceSaveError) {
                  console.error('Save source fingerprint failed', sourceSaveError);
                  showToast('นำเข้าได้ แต่บันทึกประวัติไฟล์ซ้ำไม่สำเร็จ — กรุณา Backup ก่อนสลับ Batch', 'error');
                }
              }
            }
'''
new_block = '''            if (duplicateApi && acceptedSourceFiles.length > 0) {
              try {
                duplicateApi.appendBatchFingerprints(activeBatchId, acceptedSourceFiles);
              } catch (fingerprintSaveError) {
                console.error('Save duplicate fingerprint sidecar failed', fingerprintSaveError);
                showToast('นำเข้าได้ แต่บันทึกประวัติไฟล์ซ้ำใน LocalStorage ไม่สำเร็จ — กรุณา Backup ก่อนสลับ Batch', 'error');
              }
            }
'''
html = replace_once(html, old_block, new_block, 'remove IndexedDB fingerprint write')

html = replace_once(
    html,
    '          await batchApi.deleteBatch(batch.id);\n          setBatches(prev => prev.filter(item => item.id !== batch.id));',
    '''          await batchApi.deleteBatch(batch.id);
          if (duplicateApi) {
            try { duplicateApi.clearBatchFingerprints(batch.id); }
            catch (fingerprintError) { console.warn('Clear duplicate fingerprint sidecar failed', fingerprintError); }
          }
          setBatches(prev => prev.filter(item => item.id !== batch.id));''',
    'delete sidecar cleanup'
)

html = replace_once(
    html,
    "        showToast('ล้าง Orders ใน Batch เรียบร้อย', 'success');\n      };",
    '''        if (duplicateApi && activeBatchId) {
          try { duplicateApi.clearBatchFingerprints(activeBatchId); }
          catch (fingerprintError) { console.warn('Clear duplicate fingerprint sidecar failed', fingerprintError); }
        }
        showToast('ล้าง Orders ใน Batch เรียบร้อย', 'success');
      };''',
    'clear active batch sidecar'
)

html = replace_once(
    html,
    '            settings: { thermalMode },\n            appVersion: document.title',
    '            settings: {\n              thermalMode,\n              duplicateFingerprints: duplicateApi ? duplicateApi.exportFingerprintStore() : {}\n            },\n            appVersion: document.title',
    'backup sidecar settings'
)

html = replace_once(
    html,
    '          const backup = workspaceApi.validateBackup(parsed);\n          const summary = workspaceApi.getBackupSummary(backup);',
    '''          const backup = workspaceApi.validateBackup(parsed);
          if (duplicateApi) duplicateApi.validateFingerprintStore(backup.settings.duplicateFingerprints || {});
          const summary = workspaceApi.getBackupSummary(backup);''',
    'restore sidecar prevalidation'
)

html = replace_once(
    html,
    '        const previousThermalMode = thermalMode;\n        let safetyBackup = null;',
    '        const previousThermalMode = thermalMode;\n        const previousDuplicateFingerprints = duplicateApi ? duplicateApi.exportFingerprintStore() : {};\n        let safetyBackup = null;',
    'previous duplicate snapshot'
)

html = replace_once(
    html,
    '            settings: { thermalMode: previousThermalMode },\n            appVersion: document.title',
    '            settings: {\n              thermalMode: previousThermalMode,\n              duplicateFingerprints: previousDuplicateFingerprints\n            },\n            appVersion: document.title',
    'safety backup sidecar settings'
)

html = replace_once(
    html,
    '          await workspaceApi.replaceWorkspaceBatches(backup, batchApi);\n\n          setSkuRules(restoredRules);',
    '''          await workspaceApi.replaceWorkspaceBatches(backup, batchApi);
          if (duplicateApi) duplicateApi.replaceFingerprintStore(backup.settings.duplicateFingerprints || {});

          setSkuRules(restoredRules);''',
    'restore sidecar'
)

html = replace_once(
    html,
    '              await workspaceApi.replaceWorkspaceBatches(safetyBackup, batchApi);\n              const previousBatches = await batchApi.listBatches();',
    '''              await workspaceApi.replaceWorkspaceBatches(safetyBackup, batchApi);
              if (duplicateApi) duplicateApi.replaceFingerprintStore(previousDuplicateFingerprints);
              const previousBatches = await batchApi.listBatches();''',
    'rollback sidecar'
)

index_path.write_text(html, encoding='utf-8')
print('Phase 3B sidecar patch applied on current main safely')
