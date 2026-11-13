(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterRestorePreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
  const SAFETY_COPY_HINT = 'PackMaster_SafetyCopy_<วันเวลา>.json';

  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  // Thai local time (UTC+7) written out by hand, so the label does not depend on the browser locale.
  function formatBackupDate(createdAt) {
    const time = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
    if (Number.isNaN(time)) return 'ไม่ทราบวันที่';
    const shifted = new Date(time + BANGKOK_OFFSET_MS);
    const pad = (value) => String(value).padStart(2, '0');
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} `
      + `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())} น. (เวลาไทย)`;
  }

  // Summarises what a restore will do to the current data, before the user confirms.
  // currentBindingCount null means "could not be read" and is shown as unknown, never as 0.
  // loadErrors lists local stores that failed to load; they do not block the restore.
  function describeRestoreImpact({ backup, currentBindingCount = 0, loadErrors = [] }) {
    const settings = (backup && backup.settings) || {};
    const known = Number.isInteger(currentBindingCount) && currentBindingCount >= 0;
    const currentCount = known ? currentBindingCount : null;
    const currentBindingCountLabel = known ? String(currentCount) : 'ไม่ทราบจำนวน (อ่านไม่ครบ)';
    const hasBindingData = Array.isArray(settings.registryAssignments && settings.registryAssignments.entries);
    const backupBindingCount = hasBindingData ? settings.registryAssignments.entries.length : 0;
    const hasSourceFileData = isPlainObject(settings.batchSourceFiles);
    const labels = Array.isArray(loadErrors) ? loadErrors.filter(Boolean) : [];

    const warnings = [];
    if (!known) {
      warnings.push('จำนวนชื่อที่ผูกปัจจุบันไม่ทราบ เพราะทะเบียนชื่ออ่านไม่ครบ (ไม่ใช่ 0 รายการ)');
    }
    if (!hasBindingData) {
      const cleared = known ? `${currentCount} รายการ` : 'ทั้งหมด';
      warnings.push(`ไฟล์ Backup นี้ไม่มีข้อมูลชื่อที่ผูก (Backup รุ่นเก่า) การกู้คืนจะล้างชื่อที่ผูกปัจจุบัน ${cleared} และไม่มีชื่อกลับมา`);
    } else if (!known) {
      warnings.push(`ชื่อที่ผูกปัจจุบันจะถูกแทนที่ด้วยชื่อที่ผูกใน Backup ${backupBindingCount} รายการ`);
    } else if (currentCount > 0) {
      warnings.push(`ชื่อที่ผูกปัจจุบัน ${currentCount} รายการจะถูกแทนที่ด้วยชื่อที่ผูกใน Backup ${backupBindingCount} รายการ`);
    }
    if (!hasSourceFileData) {
      warnings.push('ไฟล์ Backup นี้ไม่มีชื่อไฟล์ต้นทางของ Batch (Backup รุ่นเก่า) การกู้คืนจะล้างชื่อไฟล์ต้นทางปัจจุบัน');
    }
    if (labels.length > 0) {
      warnings.push(`ข้อมูลเดิมบางส่วนอ่านไม่ครบ (${labels.join(', ')}) ไฟล์สำเนาข้อมูลเดิมจะไม่มีส่วนนั้น และการกู้คืนจะแทนที่ส่วนนั้นด้วยข้อมูลจาก Backup`);
    }

    return {
      createdAtLabel: formatBackupDate(backup && backup.createdAt),
      backupBindingCount,
      hasBindingData,
      hasSourceFileData,
      currentBindingCountKnown: known,
      currentBindingCount: currentCount,
      currentBindingCountLabel,
      willReplaceBindingCount: currentCount,
      loadErrors: labels,
      warnings
    };
  }

  function describeCurrentCount(impact) {
    return impact.currentBindingCountKnown ? `${impact.currentBindingCount} รายการ` : 'ไม่ทราบจำนวน (อ่านไม่ครบ)';
  }

  function buildRestoreConfirmMessage({ impact, summary, integrityPreview = '', recoverySafetyCopy = '', localKeyWarnings = [] }) {
    const lines = [
      'Replace Workspace ปัจจุบันด้วยไฟล์ Backup นี้หรือไม่?',
      '',
      `วันที่ Backup: ${impact.createdAtLabel}`,
      `SKU ${summary.skuRules} • Batch ${summary.batches} • Orders ${summary.orders} • ชื่อที่ผูกใน Backup: ${impact.backupBindingCount}${integrityPreview}`,
      `ชื่อที่ผูกปัจจุบันที่จะถูกแทนที่ (หายจาก Local): ${describeCurrentCount(impact)}`
    ];
    const warnings = [...impact.warnings, ...localKeyWarnings];
    if (warnings.length > 0) {
      lines.push('', ...warnings.map(text => `! ${text}`));
    }
    lines.push(
      '',
      `ก่อนเริ่ม ระบบจะให้บันทึกไฟล์สำเนาข้อมูลเดิม (${SAFETY_COPY_HINT}) ไว้ตามที่คุณเลือกบันทึกไว้`,
      'ไฟล์สำเนานี้มีรูปใบปะหน้าของลูกค้า (มีชื่อ ที่อยู่ และเบอร์โทร) ห้ามอัปโหลดขึ้น Git หรือแชร์สาธารณะ',
      '',
      'ข้อมูล Local ปัจจุบันจะถูกแทนที่ ' + recoverySafetyCopy
    );
    return lines.join('\n');
  }

  return {
    formatBackupDate,
    describeRestoreImpact,
    buildRestoreConfirmMessage
  };
});
