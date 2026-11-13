(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterRestoreSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Local keys that a workspace backup must carry (ticket 23). Field name in backup.settings -> storage key.
  const BATCH_SOURCE_FILES_KEY = 'packmasterBatchSourceFilesV1';
  const SKU_INTEGRITY_BACKUP_KEY = 'packmasterSkuIntegrityBackupV1';
  const BACKUP_LOCAL_KEYS = [
    ['batchSourceFiles', BATCH_SOURCE_FILES_KEY],
    ['skuIntegrityBackup', SKU_INTEGRITY_BACKUP_KEY]
  ];
  const SAFETY_COPY_PREFIX = 'PackMaster_SafetyCopy_';

  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const isBatchSourceFilesShape = (value) => isPlainObject(value)
    && Object.values(value).every(names => Array.isArray(names) && names.every(name => typeof name === 'string'));
  const isSkuIntegrityShape = (value) => Array.isArray(value) && value.every(isPlainObject);
  const SHAPE_CHECKS = { batchSourceFiles: isBatchSourceFilesShape, skuIntegrityBackup: isSkuIntegrityShape };

  // Reads the keys for a backup WITHOUT blocking it. A key that cannot be read, cannot be parsed or has
  // the wrong shape is stored as null and reported in `problems`, so the caller can warn the user.
  // Desktop recovery captures the raw strings separately, so nothing is lost on that path.
  function readBackupLocalKeys(storage) {
    const values = {};
    const problems = [];
    const skip = (field, key, reason) => {
      values[field] = null;
      problems.push({ field, key, message: `คีย์ ${key} ${reason} จึงไม่ถูกรวมใน backup` });
    };
    for (const [field, key] of BACKUP_LOCAL_KEYS) {
      values[field] = null;
      let raw;
      try {
        raw = storage.getItem(key);
      } catch (error) {
        skip(field, key, 'อ่านไม่ได้');
        continue;
      }
      if (raw === null || raw === undefined || raw === '') continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        skip(field, key, 'อ่านไม่ได้');
        continue;
      }
      if (parsed === null) continue;
      if (!SHAPE_CHECKS[field](parsed)) {
        skip(field, key, 'อ่านไม่ได้หรือรูปแบบไม่ถูกต้อง');
        continue;
      }
      values[field] = parsed;
    }
    return { values, problems };
  }

  // Writes every value the backup has first, and only then removes the keys the backup does not
  // have. A failed write therefore never removes data that the restore did not replace.
  function writeBackupLocalKeys(storage, settings) {
    const source = settings || {};
    for (const [field, key] of BACKUP_LOCAL_KEYS) {
      const value = source[field];
      if (value != null) storage.setItem(key, JSON.stringify(value));
    }
    for (const [field, key] of BACKUP_LOCAL_KEYS) {
      if (source[field] == null) storage.removeItem(key);
    }
  }

  function buildSafetyCopyFilename(now) {
    const date = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid safety copy date');
    // Seconds are kept so two restores in the same minute do not collide and get renamed by the browser.
    const stamp = date.toISOString().replace(/[:T]/g, '-').slice(0, 19);
    return `${SAFETY_COPY_PREFIX}${stamp}.json`;
  }

  // Downloads the current data as a file the user keeps. Throws if the browser refuses the
  // download, so the caller can stop before anything is replaced. The file contains customer label
  // images, so it must never be committed to Git.
  function downloadSafetyCopy(backup, options = {}) {
    const doc = options.documentApi || (typeof document !== 'undefined' ? document : null);
    const urls = options.urlApi || URL;
    if (!doc || !backup) throw new Error('ระบบดาวน์โหลดไฟล์สำเนาไม่พร้อม จึงยังไม่เริ่ม Restore');
    const filename = buildSafetyCopyFilename(options.now || new Date());
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = urls.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      setTimeout(() => urls.revokeObjectURL(url), 0);
    }
    return filename;
  }

  return {
    BATCH_SOURCE_FILES_KEY,
    SKU_INTEGRITY_BACKUP_KEY,
    SAFETY_COPY_PREFIX,
    readBackupLocalKeys,
    writeBackupLocalKeys,
    buildSafetyCopyFilename,
    downloadSafetyCopy
  };
});
