(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PackMasterDesktopRecovery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const sensitiveKey = /(?:auth|token|secret|password|credential)/i;

  function captureLocalStorageEntries(storage) {
    const entries = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key !== 'string' || sensitiveKey.test(key)) continue;
      entries.push([key, storage.getItem(key)]);
    }
    return entries;
  }

  function validateEntries(entries) {
    if (!Array.isArray(entries)) throw new Error('Recovery LocalStorage snapshot is invalid');
    const seen = new Set();
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' ||
          (entry[1] !== null && typeof entry[1] !== 'string') || sensitiveKey.test(entry[0]) || seen.has(entry[0])) {
        throw new Error('Recovery LocalStorage snapshot contains an invalid entry');
      }
      seen.add(entry[0]);
    }
  }

  function restoreLocalStorageEntries(storage, entries) {
    validateEntries(entries);
    const expected = new Set(entries.map(([key]) => key));
    const remove = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && !sensitiveKey.test(key) && !expected.has(key)) remove.push(key);
    }
    for (const key of remove) storage.removeItem(key);
    for (const [key, value] of entries) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  }

  async function runRestore({ bridge, backup, localStorageEntries, replace, apply, onPrepared }) {
    if (typeof replace !== 'function' || typeof apply !== 'function') throw new Error('Restore handlers are unavailable');
    const recovery = bridge && bridge.recovery;
    let prepared = null;
    if (recovery) {
      const result = await recovery.prepare({ backup, localStorageEntries });
      if (!result || typeof result.id !== 'string' || !result.id) throw new Error('Desktop recovery snapshot was not confirmed');
      prepared = result;
      if (typeof onPrepared === 'function') onPrepared(prepared);
    }
    await replace();
    await apply();
    if (prepared) await recovery.complete({ id: prepared.id });
    return prepared;
  }

  async function completeRecovery(bridge, id) {
    if (bridge && bridge.recovery && id) await bridge.recovery.complete({ id });
  }

  async function reloadIfRecoveryPending({ bridge, id, reload }) {
    if (!id) return false;
    try {
      const pending = await bridge.recovery.getPending();
      if (!pending) return false;
    } catch {
      // If pending state cannot be checked, restart into the fail-closed gate.
    }
    if (typeof reload === 'function') reload();
    return true;
  }

  async function recoverPending({ bridge, storage, replace, reload }) {
    const recovery = bridge && bridge.recovery;
    if (!recovery) return { recovered: false, pending: null };
    const pending = await recovery.getPending();
    if (!pending) return { recovered: false, pending: null };
    if (typeof pending.id !== 'string' || !pending.backup) throw new Error('Pending recovery snapshot is invalid');
    validateEntries(pending.localStorageEntries);
    await replace(pending.backup);
    restoreLocalStorageEntries(storage, pending.localStorageEntries);
    await recovery.complete({ id: pending.id });
    if (typeof reload === 'function') reload();
    return { recovered: true, pending };
  }

  function storeOwnershipPrompt(source, target) {
    if (!target || typeof target.id !== 'string' || !target.id) return null;
    if (source && typeof source.id === 'string' && source.id === target.id) return null;
    const sourceLabel = source && typeof source.label === 'string' && source.label
      ? `${source.label} (${source.id || 'รหัสไม่ทราบ'})` : 'ไม่ทราบ Store ต้นทาง';
    const targetLabel = target.label || target.id;
    return `ไฟล์ Backup นี้มาจาก ${sourceLabel}\n\nกำลังกู้คืนลง Store ปัจจุบัน: ${targetLabel} (${target.id})\n\nตรวจสอบเจ้าของข้อมูลแล้วและต้องการย้ายข้อมูลนี้หรือไม่?`;
  }

  function confirmStoreOwnership(source, target, confirmFn) {
    const prompt = storeOwnershipPrompt(source, target);
    return !prompt || (typeof confirmFn === 'function' && Boolean(confirmFn(prompt)));
  }

  function createStartupGate({ bridge, document, storage, reload, isDesktop = false }) {
    const recovery = bridge && bridge.recovery;
    if (!recovery && !isDesktop) return { ready: Promise.resolve(), isBlocked: () => false, getState: () => 'ready' };
    let state = 'checking';
    let pending = null;
    let error = null;
    let resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    const overlay = document.createElement('section');
    overlay.id = 'packmaster-desktop-recovery-gate';
    overlay.className = 'no-print';
    overlay.setAttribute('data-pm-desktop-recovery-gate', '');
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pm-recovery-title');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647', display: 'grid',
      placeItems: 'center', padding: '24px', background: '#f4f7fb', color: '#172554',
      font: '16px/1.6 system-ui, sans-serif'
    });
    document.body.appendChild(overlay);

    const render = () => {
      overlay.replaceChildren();
      const card = document.createElement('div');
      Object.assign(card.style, { maxWidth: '620px', padding: '32px', background: '#fff',
        border: '1px solid #cbd5e1', borderRadius: '16px', boxShadow: '0 24px 60px #0f172a22' });
      const heading = document.createElement('h1');
      heading.id = 'pm-recovery-title';
      heading.textContent = state === 'checking' ? 'กำลังตรวจสอบข้อมูลกู้คืน' : 'พบข้อมูลกู้คืน Workspace';
      const message = document.createElement('p');
      message.textContent = state === 'unavailable'
        ? 'ไม่พบช่องทางกู้คืนที่ปลอดภัยของ Desktop จึงปิดกั้นการใช้งานไว้ กรุณาปิดและเปิดโปรแกรมใหม่'
        : state === 'checking'
        ? 'กำลังตรวจสอบ snapshot ก่อนเปิดใช้งาน เพื่อป้องกันข้อมูลเดิมถูกเขียนทับ'
        : error
          ? `กู้คืนยังไม่สำเร็จ ข้อมูล snapshot ยังคงอยู่: ${error.message || error}`
          : 'มี snapshot ที่บันทึกไว้ก่อนเริ่ม Replace Workspace กรุณากู้คืนก่อนใช้งานต่อ';
      card.append(heading, message);
      if (state === 'pending' || state === 'error') {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-pm-desktop-recovery-restore', '');
        button.textContent = state === 'error' ? 'ตรวจสอบ / ลองอีกครั้ง' : 'กู้คืนข้อมูลที่บันทึกไว้';
        Object.assign(button.style, { padding: '12px 18px', border: '0', borderRadius: '10px',
          background: '#1d4ed8', color: '#fff', font: '700 15px system-ui', cursor: 'pointer' });
        button.addEventListener('click', async () => {
          button.disabled = true;
          error = null;
          state = 'recovering';
          render();
          try {
            await recoverPending({ bridge, storage, replace: backup => {
              const workspace = globalThis.PackMasterWorkspace;
              const batches = globalThis.PackMasterBatch;
              if (!workspace || !batches) throw new Error('โมดูลกู้คืน Batch ยังไม่พร้อม');
              return workspace.replaceWorkspaceBatches(backup, batches);
            }, reload });
            state = 'ready';
            overlay.remove();
            resolveReady();
          } catch (caught) {
            error = caught;
            state = 'error';
            render();
          }
        });
        card.appendChild(button);
      }
      if (state === 'recovering') message.textContent = 'กำลังกู้คืน Batch และการตั้งค่าที่บันทึกไว้…';
      overlay.appendChild(card);
    };

    const checkPending = async () => {
      state = 'checking';
      error = null;
      render();
      try {
        if (!recovery) throw new Error('Desktop recovery bridge unavailable');
        pending = await recovery.getPending();
        if (!pending) {
          state = 'ready';
          overlay.remove();
          resolveReady();
        } else {
          state = 'pending';
          render();
        }
      } catch (caught) {
        error = caught;
        state = recovery ? 'error' : 'unavailable';
        render();
      }
    };
    render();
    checkPending();
    return { ready, isBlocked: () => state !== 'ready', getState: () => state, checkPending };
  }

  return { captureLocalStorageEntries, restoreLocalStorageEntries, runRestore, completeRecovery, reloadIfRecoveryPending,
    recoverPending, storeOwnershipPrompt, confirmStoreOwnership, createStartupGate };
});
