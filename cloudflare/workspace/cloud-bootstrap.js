// First-party Cloud build bootstrap; the local GitHub Pages build does not load this file.
(async () => {
  'use strict';
  const status = document.getElementById('boot-status');
  const loadApp = () => {
    if (document.querySelector('script[src="./app.js"]')) return;
    const app = document.createElement('script');
    app.src = './app.js';
    app.addEventListener('load', () => status?.remove(), { once: true });
    app.addEventListener('error', () => {
      if (status) status.textContent = 'โหลดโปรแกรม PackMaster ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ';
    }, { once: true });
    document.body.appendChild(app);
  };

  try {
    const response = await fetch('./api/workspace/session', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store'
    });
    if (response.ok) {
      const session = await response.json();
      if (session?.authenticated && window.PackMasterBatch && window.PackMasterCloudClient) {
        window.PackMasterCloud = window.PackMasterCloudClient.createClient({
          baseUrl: window.location.origin + '/',
          session: true,
          fetchImpl: window.fetch.bind(window),
          batchHelpers: window.PackMasterBatch
        });
      }
    }
  } catch (error) {
    console.warn('Cloud Workspace session check:', error?.name || 'offline');
  } finally {
    loadApp();
  }
})();
