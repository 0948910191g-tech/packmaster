(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterSaveGuards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Result of saving an upload into the Batch. Success wording is used only when the save really persisted.
  function uploadSaveOutcome({ saved, saveProblem, orderCount, cloudMode } = {}) {
    const count = Number(orderCount) || 0;
    if (saved === true) {
      return {
        tone: 'success',
        unsaved: false,
        message: cloudMode ? `บันทึก Cloud สำเร็จแล้ว ${count} ใบ` : `เพิ่มข้อมูลสำเร็จ ${count} ใบ`
      };
    }
    const problem = String(saveProblem || '').trim() || 'Browser storage ยังไม่พร้อม';
    return {
      tone: 'error',
      unsaved: true,
      message: `ยังไม่ได้บันทึกลง Batch (${problem}) — ออเดอร์ ${count} ใบยังไม่ถูกบันทึกถาวร อย่าปิดหน้านี้ ไฟล์นี้ยังไม่ถูกจำว่านำเข้าแล้ว`
    };
  }

  // Tracks whether edits made in this page have reached storage. Each edit or save attempt takes a sequence
  // number. Only the newest attempt can clear the dirty flag, so an older save finishing late cannot hide newer edits.
  function createSaveTracker() {
    let counter = 0;
    let latest = 0;
    let dirty = false;
    return {
      begin() {
        counter += 1;
        latest = counter;
        dirty = true;
        return latest;
      },
      succeed(seq) {
        if (seq === latest) dirty = false;
        return !dirty;
      },
      // Only the newest attempt can mark dirty, symmetric with succeed(seq).
      fail(seq) {
        if (seq === latest) dirty = true;
        return dirty;
      },
      // The batch was left, or its contents were confirmed saved: nothing is pending for this page.
      // A new sequence makes every older attempt stale, so a late result cannot re-dirty the page.
      reset() {
        counter += 1;
        latest = counter;
        dirty = false;
      },
      isDirty() {
        return dirty;
      }
    };
  }

  // Local mode only: the batch currently open in the editor cannot be archived or deleted, because its
  // in-memory orders would then be written back to a removed batch. Cloud has its own checks.
  function openBatchGuardMessage({ cloudMode, activeBatchId, batchIds, action } = {}) {
    if (cloudMode || !activeBatchId) return '';
    const ids = Array.isArray(batchIds) ? batchIds : [batchIds];
    if (!ids.includes(activeBatchId)) return '';
    const verb = action === 'archive' ? 'เก็บเข้าคลัง' : 'ลบ';
    return `Batch ที่เปิดอยู่${verb}ไม่ได้ — กด "กลับรายการ Batch" ในหน้าอัปโหลดก่อน แล้วค่อยทำรายการนี้`;
  }

  // A print or Save PDF flow is in progress. Batch changes that would move the labels under it must wait.
  function flightGuardMessage(flight, action) {
    if (!flight || typeof flight.isActive !== 'function' || !flight.isActive()) return '';
    return `กำลังพิมพ์หรือ Save PDF อยู่ — รอให้เสร็จก่อน แล้วค่อย${action || 'ทำรายการนี้'}`;
  }

  return {
    uploadSaveOutcome,
    createSaveTracker,
    openBatchGuardMessage,
    flightGuardMessage
  };
});
