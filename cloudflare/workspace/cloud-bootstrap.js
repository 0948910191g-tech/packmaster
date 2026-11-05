// First-party Cloud build bootstrap; the local GitHub Pages build does not load this file.
(async () => {
  'use strict';
  const status = document.getElementById('boot-status');
  const fail = (text, showLogin = true) => {
    if (status) {
      status.innerHTML = `<div style="text-align:center;padding:24px;">
        <div style="margin-bottom:12px;color:#991b1b;font-size:14px;font-weight:700;">${text}</div>
        ${showLogin ? '<a href="./login" style="display:inline-block;padding:10px 20px;background:#5b4bd6;color:#fff;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;box-shadow:0 4px 12px rgba(91,75,214,.3);">เข้าสู่ระบบ PackMaster</a>' : ''}
      </div>`;
      status.setAttribute('role', 'alert');
    }
  };
  try {
    const response = await fetch('./api/workspace/session', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store'
    });
    if (response.status === 401) {
      window.location.replace('./login');
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
    console.warn('Cloud bootstrap session check failed, redirecting to login:', error?.name || 'error');
    if (window.location.pathname !== '/login') {
      window.location.replace('./login');
    } else {
      fail('เชื่อม Cloud Workspace ไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง');
    }
  }
})();
