(() => {
  'use strict';
  const registry = globalThis.PackMasterMarketplaceRegistry;
  const sync = globalThis.PackMasterRegistrySync;
  const origin = 'https://packmaster-registry.hakubaby2022.workers.dev';
  const platforms = ['TIKTOK', 'SHOPEE'];
  const element = id => document.getElementById(id);
  const label = platform => platform.toLowerCase();
  let busy = false;
  let localBackupMade = false;

  function showStatus(message, tone = '') {
    const node = element('status');
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function readLocalStore() {
    const loaded = registry.loadStore(localStorage);
    if (loaded.error) throw new Error('ทะเบียนใน Browser อ่านไม่ได้: ' + loaded.error);
    return loaded.store;
  }

  function refreshLocal() {
    const store = readLocalStore();
    for (const platform of platforms) {
      const data = store.platforms[platform];
      element(label(platform) + '-local').textContent = data
        ? 'ใน Browser: ' + data.summary.listedProductCount + ' สินค้า / '
          + data.summary.skuModelRowCount + ' แถว SKU • วันที่ ' + data.source.captureDate
        : 'ใน Browser: ยังไม่มีทะเบียน';
    }
  }

  function displayRemote(platform, response) {
    const data = response.registry;
    element(label(platform) + '-remote').textContent = data
      ? 'Cloud: ' + data.summary.listedProductCount + ' สินค้า / '
        + data.summary.skuModelRowCount + ' แถว SKU • Revision ' + response.revision
      : 'Cloud: ยังไม่มีทะเบียน • Revision ' + response.revision;
  }

  function setBusy(next) {
    busy = next;
    document.querySelectorAll('button').forEach(button => { button.disabled = next; });
  }

  async function getRemote(platform) {
    return sync.fetchRegistry(fetch.bind(window), origin, element('token').value, platform, registry);
  }

  async function checkConnection() {
    if (busy) return;
    setBusy(true);
    showStatus('กำลังตรวจข้อมูลบน Cloud...', '');
    try {
      for (const platform of platforms) {
        displayRemote(platform, await getRemote(platform));
      }
      showStatus('เชื่อมต่อ Cloudflare สำเร็จ ตรวจสอบทะเบียนทั้ง 2 แพลตฟอร์มแล้ว', 'success');
    } catch (error) {
      showStatus('ตรวจสอบไม่สำเร็จ: ' + error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function syncPlatform(platform, direction) {
    if (busy || !platforms.includes(platform) || !['pull', 'push'].includes(direction)) return;
    setBusy(true);
    showStatus('กำลังตรวจ Revision และข้อมูล ' + platform + '...', '');
    try {
      const store = readLocalStore();
      const local = store.platforms[platform] || null;
      const remote = await getRemote(platform);
      displayRemote(platform, remote);

      if (direction === 'pull') {
        if (!remote.registry) throw new Error('ไม่มีทะเบียน ' + platform + ' บน Cloud');
        if (local && Date.parse(local.source.captureDate) > Date.parse(remote.registry.source.captureDate)) {
          throw new Error('ข้อมูลใน Browser ใหม่กว่า Cloud • ปฏิเสธการแทนข้อมูล');
        }
        if (local && !localBackupMade) {
          throw new Error('กรุณากดสำรองทะเบียนใน Browser เป็น JSON ก่อนรับข้อมูล Cloud');
        }
        if (!window.confirm('รับทะเบียน ' + platform + ' จาก Cloud?\n'
          + 'Cloud: ' + remote.registry.summary.listedProductCount + ' สินค้า\n'
          + 'Browser: ' + (local?.summary?.listedProductCount || 0) + ' สินค้า\n'
          + 'จะเปลี่ยนเฉพาะทะเบียนแพลตฟอร์มนี้ ไม่กระทบออเดอร์หรือ SKU Mapping')) return;
        const updated = registry.replacePlatformRegistry(store, remote.registry);
        registry.saveStore(localStorage, updated);
        refreshLocal();
        showStatus('รับทะเบียน ' + platform + ' สำเร็จ • กลับไป Dashboard แล้วรีเฟรชหน้าเพื่อดูข้อมูล', 'success');
        return;
      }

      if (!local) throw new Error('ไม่มีทะเบียน ' + platform + ' ใน Browser สำหรับส่งขึ้น Cloud');
      if (remote.registry && Date.parse(remote.registry.source.captureDate) > Date.parse(local.source.captureDate)) {
        throw new Error('Cloud มีข้อมูลใหม่กว่า • ปฏิเสธการส่งข้อมูลเก่าทับ');
      }
      if (!window.confirm('ส่งทะเบียน ' + platform + ' ขึ้น Cloud?\n'
        + 'Browser: ' + local.summary.listedProductCount + ' สินค้า (' + local.source.captureDate + ')\n'
        + 'Cloud: ' + (remote.registry?.summary?.listedProductCount || 0) + ' สินค้า\n'
        + 'อัปเดตเฉพาะแพลตฟอร์มนี้โดยตรวจ Revision ก่อนบันทึก')) return;
      const saved = await sync.saveRegistry(fetch.bind(window), origin, element('token').value,
        platform, local, remote.revision, registry);
      displayRemote(platform, { registry: local, revision: saved.revision });
      showStatus('ส่งทะเบียน ' + platform + ' ขึ้น Cloud สำเร็จ • Revision ' + saved.revision, 'success');
    } catch (error) {
      showStatus('ซิงก์ไม่สำเร็จ: ' + error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  function backupLocal() {
    if (busy) return;
    try {
      const store = registry.validateStore(readLocalStore());
      const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'packmaster-marketplace-registry-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      localBackupMade = true;
      showStatus('สร้างไฟล์สำรองทะเบียน Marketplace แล้ว โปรดเก็บไฟล์ไว้ในพื้นที่ภายในบริษัท', 'success');
    } catch (error) {
      showStatus('สำรองข้อมูลไม่ได้: ' + error.message, 'error');
    }
  }

  element('check').addEventListener('click', checkConnection);
  element('local-backup').addEventListener('click', backupLocal);
  document.querySelectorAll('button[data-platform]').forEach(button => {
    button.addEventListener('click', () => syncPlatform(button.dataset.platform, button.dataset.direction));
  });
  try {
    refreshLocal();
  } catch (error) {
    showStatus('ทะเบียนใน Browser ไม่พร้อม: ' + error.message, 'error');
  }
})();
