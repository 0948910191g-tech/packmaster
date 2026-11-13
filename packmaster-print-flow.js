(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterPrintFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRINT_CONFIRM_MESSAGE = 'พิมพ์ออกครบแล้วใช่ไหม?\n\nกด "ตกลง" = ตั้งสถานะ "พิมพ์แล้ว" ให้ Batch\nกด "ยกเลิก" = ยังไม่ตั้งสถานะ (พิมพ์ซ้ำได้)';

  // Busy gate for one print/export flow. Taken synchronously so a second click cannot start
  // while the first is still preparing or waiting for the print dialog.
  function createSingleFlight() {
    let active = false;
    return {
      tryStart() {
        if (active) return false;
        active = true;
        return true;
      },
      finish() {
        active = false;
      },
      isActive() {
        return active;
      }
    };
  }

  function findOrdersWithoutImage(orders) {
    const rows = Array.isArray(orders) ? orders : [];
    return rows.filter(order => !order || !order.pdfImage);
  }

  function missingImageMessage(missingOrders) {
    const rows = Array.isArray(missingOrders) ? missingOrders : [];
    const ids = rows.slice(0, 3).map(order => (order && order.id) || '-').join(', ');
    const more = rows.length > 3 ? ` และอีก ${rows.length - 3} ออเดอร์` : '';
    return `ไม่มีรูปใบปะหน้าให้พิมพ์ ${rows.length} ออเดอร์ (${ids}${more}) — Batch นี้อาจถูกล้างรูป Reprint แล้ว จึงพิมพ์หรือ Save PDF ไม่ได้ กรุณาอัปโหลด PDF ต้นฉบับใหม่ หรือเลือก Batch ที่ยังมีรูป`;
  }

  function thermalFailureMessage(order) {
    const id = order && order.id ? order.id : '-';
    return `แปลงภาพ Thermal ไม่สำเร็จ (ออเดอร์ ${id}) จึงยังไม่พิมพ์ — ปิด Thermal แล้วลองใหม่ หรือรีโหลดหน้าแล้วลองอีกครั้ง`;
  }

  // Decides whether the rendered label images are ready to print or export.
  // status: 'ready' | 'waiting' | 'failed'. 'failed' is returned as soon as the cause is known,
  // so callers do not sit in the generic timeout.
  function evaluatePrintReadiness({ images, orders, thermalMode, thermalFailures }) {
    const rows = Array.isArray(orders) ? orders : [];
    const renderedImages = Array.isArray(images) ? images : [];

    const missing = findOrdersWithoutImage(rows);
    if (missing.length > 0) {
      return { status: 'failed', reason: 'missing-image', message: missingImageMessage(missing) };
    }
    if (thermalMode && thermalFailures && typeof thermalFailures.has === 'function') {
      const failed = rows.find(order => thermalFailures.has(order.pdfImage));
      if (failed) {
        return { status: 'failed', reason: 'thermal-failed', message: thermalFailureMessage(failed) };
      }
    }
    if (renderedImages.length !== rows.length) return { status: 'waiting' };

    const ready = renderedImages.every((image, index) => {
      const source = rows[index];
      return Boolean(image) && image.complete && image.naturalWidth > 0 &&
        (!thermalMode || !source || image.src !== source.pdfImage);
    });
    return { status: ready ? 'ready' : 'waiting' };
  }

  // Resolves once the browser print dialog has closed (afterprint), so the caller can ask the
  // operator about completion only after the dialog is gone. Rejects if window.print throws.
  // If the browser cannot report afterprint, resolves after the fallback timer.
  function waitForPrintDialogClose(win, options) {
    const opts = options || {};
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 2000;
    const setTimer = opts.setTimer || setTimeout;
    const clearTimer = opts.clearTimer || clearTimeout;
    return new Promise((resolve, reject) => {
      const canListen = typeof win.addEventListener === 'function' && typeof win.removeEventListener === 'function';
      let settled = false;
      let timer = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimer(timer);
        if (canListen) win.removeEventListener('afterprint', finish);
        resolve();
      };
      if (canListen) win.addEventListener('afterprint', finish);
      try {
        win.print();
      } catch (error) {
        if (!settled) {
          settled = true;
          if (canListen) win.removeEventListener('afterprint', finish);
          reject(error);
        }
        return;
      }
      if (!canListen) {
        finish();
        return;
      }
      if (!settled) timer = setTimer(finish, timeoutMs);
    });
  }

  return {
    PRINT_CONFIRM_MESSAGE,
    createSingleFlight,
    findOrdersWithoutImage,
    missingImageMessage,
    thermalFailureMessage,
    evaluatePrintReadiness,
    waitForPrintDialogClose
  };
});
