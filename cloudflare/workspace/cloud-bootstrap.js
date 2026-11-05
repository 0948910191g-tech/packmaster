// First-party Cloud build bootstrap; the local GitHub Pages build does not load this file.
(async () => {
  'use strict';
  const status = document.getElementById('boot-status');
  const fail = text => {
    if (status) {
      status.textContent = text;
      status.setAttribute('role', 'alert');
    }
  };
  try {
    const response = await fetch('./api/workspace/session', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error'
    });
    if (response.status === 401) {
      window.location.replace('./login.html');
      return;
    }
    if (!response.ok) throw new Error('Cloud Workspace session check failed');
    const session = await response.json();
    if (!session?.authenticated) throw new Error('Cloud session is invalid');
    if (!window.PackMasterBatch || !window.PackMasterCloudClient) {
      throw new Error('PackMaster Cloud libraries are unavailable');
    }
    window.PackMasterCloud = window.PackMasterCloudClient.createClient({
      baseUrl: window.location.origin + '/',
      session: true,
      fetchImpl: window.fetch.bind(window),
      batchHelpers: window.PackMasterBatch
    });
    const app = document.createElement('script');
    app.src = './app.js';
    app.addEventListener('load', () => status?.remove(), { once: true });
    app.addEventListener('error', () => fail('Cloud PackMaster โหลดโปรแกรมไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ'), { once: true });
    document.body.appendChild(app);
  } catch (error) {
    fail('เชื่อม Cloud Workspace ไม่สำเร็จ — ข้อมูลเครื่องนี้จะไม่ถูกบันทึกแทนข้อมูลกลาง');
    console.error('Cloud bootstrap blocked:', error?.name || 'error');
  }
})();
