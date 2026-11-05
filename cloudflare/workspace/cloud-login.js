(() => {
  'use strict';
  const form = document.getElementById('login');
  const button = document.getElementById('submit');
  const input = document.getElementById('password');
  const message = document.getElementById('message');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    message.textContent = 'กำลังตรวจสอบสิทธิ์...';
    const passphrase = input.value;
    input.value = '';
    try {
      const response = await fetch('./api/workspace/session', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase })
      });
      if (!response.ok) throw new Error('รหัสไม่ถูกต้องหรือระบบยังไม่พร้อม');
      const result = await response.json();
      if (!result?.authenticated) throw new Error('เข้าสู่ระบบไม่สำเร็จ');
      window.location.replace('./index.html');
    } catch (error) {
      message.textContent = error.message || 'ไม่สามารถเชื่อมต่อระบบได้';
    } finally {
      button.disabled = false;
    }
  });
})();
