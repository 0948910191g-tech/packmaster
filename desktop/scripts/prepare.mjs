import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.join(repo, 'desktop', 'app');
const vendor = path.join(output, 'vendor');

fs.mkdirSync(vendor, { recursive: true });
for (const filename of ['packmaster-marketplace-registry.json', 'packmaster-registry-assignments.json']) {
  const generatedBaseline = path.join(output, 'data', filename);
  if (fs.existsSync(generatedBaseline)) fs.rmSync(generatedBaseline);
}

const copyFile = (from, to) => {
  if (!fs.existsSync(from)) throw new Error('Required desktop asset is missing: ' + from);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

// Copy the known public product code, not the repository, Git data or user files.
for (const file of fs.readdirSync(repo)) {
  if (file.endsWith('.js') && !file.startsWith('.')) {
    copyFile(path.join(repo, file), path.join(output, file));
  }
}
copyFile(path.join(repo, 'registry-sync.html'), path.join(output, 'registry-sync.html'));

const vendorFiles = new Map([
  ['react/umd/react.production.min.js', 'react.production.min.js'],
  ['react-dom/umd/react-dom.production.min.js', 'react-dom.production.min.js'],
  ['@babel/standalone/babel.min.js', 'babel.min.js'],
  ['pdfjs-dist/build/pdf.min.js', 'pdf.min.js'],
  ['pdfjs-dist/build/pdf.worker.min.js', 'pdf.worker.min.js'],
  ['html2canvas/dist/html2canvas.min.js', 'html2canvas.min.js'],
  ['jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js']
]);
for (const [source, file] of vendorFiles) {
  copyFile(path.join(repo, 'node_modules', source), path.join(vendor, file));
}

const source = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
let desktopHtml = source;
const replacements = new Map([
  ['<script src="https://cdn.tailwindcss.com"></script>',
    '<link rel="stylesheet" href="./vendor/tailwind.css">'],
  ['<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">', ''],
  ['https://unpkg.com/react@18/umd/react.production.min.js', './vendor/react.production.min.js'],
  ['https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', './vendor/react-dom.production.min.js'],
  ['https://unpkg.com/@babel/standalone@7/babel.min.js', './vendor/babel.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', './vendor/pdf.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', './vendor/pdf.worker.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', './vendor/html2canvas.min.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', './vendor/jspdf.umd.min.js']
]);
for (const [before, after] of replacements) {
  if (!desktopHtml.includes(before)) throw new Error('Expected source asset reference not found: ' + before);
  desktopHtml = desktopHtml.replaceAll(before, after);
}

// Tailwind is precompiled, so its browser bootstrap must not run.
const runtimeTailwindConfig = /<script>\s*tailwind\.config\s*=\s*\{[^\n]*\}\s*<\/script>/;
if (!runtimeTailwindConfig.test(desktopHtml)) {
  throw new Error('Tailwind runtime configuration was not found');
}
desktopHtml = desktopHtml.replace(runtimeTailwindConfig, '');

const csp = `<meta http-equiv="Content-Security-Policy"
    content="default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; font-src 'self' data:;">`;
desktopHtml = desktopHtml.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  ' + csp);
const dataSeparationNotice = `<aside id="packmaster-desktop-data-notice" class="no-print" role="note" style="position:relative;z-index:100000;padding:10px 18px;background:#fff7d6;color:#713f12;border-bottom:1px solid #f5d36a;font:600 13px/1.5 system-ui,sans-serif;text-align:center">ข้อมูลใน Packmaster Web และ Desktop แยกเก็บกันบนคนละพื้นที่ — หากต้องการย้ายข้อมูล ให้สำรองข้อมูล Workspace (Backup) จากฝั่งต้นทาง แล้วตรวจรายการและกู้คืน (Restore) ในฝั่งปลายทางก่อนแทนที่ข้อมูลเดิม</aside>`;
if (!desktopHtml.includes('<body')) throw new Error('Expected page body was not found for Desktop data notice');
desktopHtml = desktopHtml.replace(/<body([^>]*)>/, '<body$1>\n  ' + dataSeparationNotice);
const storeManager = `<script>
(() => {
  const bridge = window.packmasterDesktop;
  if (!bridge) return;
  const button = document.createElement('button');
  button.className = 'no-print';
  Object.assign(button.style, { position: 'fixed', right: '18px', bottom: '18px', zIndex: 100001, border: '1px solid #94a3b8', borderRadius: '999px', padding: '10px 16px', background: '#0f172a', color: 'white', font: '600 13px system-ui,sans-serif', boxShadow: '0 4px 14px #0003', cursor: 'pointer' });
  button.type = 'button';
  button.setAttribute('aria-label', 'เลือกพื้นที่จัดเก็บ');
  const panel = document.createElement('div');
  panel.className = 'no-print';
  Object.assign(panel.style, { display: 'none', position: 'fixed', right: '18px', bottom: '68px', zIndex: 100002, width: 'min(380px, calc(100vw - 36px))', padding: '18px', border: '1px solid #cbd5e1', borderRadius: '12px', background: 'white', color: '#0f172a', font: '14px/1.5 system-ui,sans-serif', boxShadow: '0 8px 30px #0003' });
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'จัดการพื้นที่จัดเก็บ');
  const heading = document.createElement('strong'); heading.textContent = 'พื้นที่จัดเก็บในเครื่อง';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'เลือกพื้นที่จัดเก็บ'); select.style.cssText = 'display:block;width:100%;margin:10px 0;padding:9px;border:1px solid #94a3b8;border-radius:6px';
  const switchButton = document.createElement('button'); switchButton.type = 'button'; switchButton.textContent = 'สลับพื้นที่';
  const input = document.createElement('input'); input.type = 'text'; input.maxLength = 80; input.placeholder = 'ชื่อพื้นที่ใหม่'; input.setAttribute('aria-label', 'ชื่อพื้นที่ใหม่'); input.style.cssText = 'box-sizing:border-box;width:100%;margin:14px 0 8px;padding:9px;border:1px solid #94a3b8;border-radius:6px';
  const createButton = document.createElement('button'); createButton.type = 'button'; createButton.textContent = 'สร้างและใช้พื้นที่ใหม่';
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = 'ปิด'; closeButton.style.cssText = 'float:right';
  const message = document.createElement('p'); message.setAttribute('role', 'status'); message.style.cssText = 'min-height:1.5em;color:#b91c1c;margin:10px 0 0';
  const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;align-items:center';
  for (const item of [switchButton, createButton, closeButton]) item.style.cssText += ';padding:8px 10px;border:1px solid #94a3b8;border-radius:6px;background:#f8fafc;cursor:pointer';
  const note = document.createElement('p'); note.textContent = 'แต่ละพื้นที่เก็บข้อมูลแยกจากกัน ก่อนสลับโปรดบันทึกหรือส่งออกงานที่กำลังทำอยู่'; note.style.cssText = 'color:#475569;font-size:12px;margin:8px 0';
  actions.append(switchButton, createButton, closeButton);
  panel.append(heading, select, note, input, actions, message);
  document.body.append(button, panel);
  let activeId = 'legacy';
  const setMessage = text => { message.textContent = text || ''; };
  async function refresh() {
    const [context, stores] = await Promise.all([bridge.getContext(), bridge.listStores()]);
    activeId = context.id;
    button.textContent = 'พื้นที่: ' + context.label;
    select.replaceChildren();
    for (const store of stores) {
      const option = document.createElement('option'); option.value = store.id; option.textContent = store.label + (store.legacy ? ' (ข้อมูลเดิม)' : '');
      option.selected = store.id === activeId; select.append(option);
    }
  }
  async function prepareAndSwitch(id, label) {
    if (!window.confirm('สลับไปยัง “' + label + '” และเปิดโปรแกรมใหม่หรือไม่? โปรดบันทึกหรือส่งออกงานก่อนสลับ ข้อมูลจะไม่ถูกย้ายอัตโนมัติ')) return;
    if (typeof window.__pmPrepareStoreSwitch !== 'function') throw new Error('ยังตรวจสอบการบันทึกงานปัจจุบันไม่ได้ กรุณาลองใหม่เมื่อหน้าจอพร้อม');
    const ready = await window.__pmPrepareStoreSwitch();
    if (ready !== true) throw new Error('ยังบันทึกงานปัจจุบันไม่สำเร็จ จึงยกเลิกการสลับ');
    await bridge.switchStore({ id });
  }
  button.addEventListener('click', async () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') { setMessage(''); try { await refresh(); } catch (error) { setMessage(error.message); } }
  });
  closeButton.addEventListener('click', () => { panel.style.display = 'none'; });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { panel.style.display = 'none'; button.focus(); }
  });
  switchButton.addEventListener('click', async () => {
    const selected = select.selectedOptions[0]; if (!selected || selected.value === activeId) return;
    setMessage(''); switchButton.disabled = true;
    try { await prepareAndSwitch(selected.value, selected.textContent); } catch (error) { window.__pmCancelStoreSwitch?.(); setMessage(error.message); }
    finally { switchButton.disabled = false; }
  });
  createButton.addEventListener('click', async () => {
    const label = input.value.trim(); if (!label) { setMessage('กรุณาระบุชื่อพื้นที่'); return; }
    setMessage(''); createButton.disabled = true;
    try {
      if (!window.confirm('สร้างพื้นที่ “' + label + '” และสลับไปใช้งานหรือไม่? โปรดบันทึกหรือส่งออกงานก่อนสลับ ข้อมูลเดิมจะไม่ถูกย้าย')) return;
      if (typeof window.__pmPrepareStoreSwitch !== 'function') throw new Error('ยังตรวจสอบการบันทึกงานปัจจุบันไม่ได้ กรุณาลองใหม่เมื่อหน้าจอพร้อม');
      if (await window.__pmPrepareStoreSwitch() !== true) throw new Error('ยังบันทึกงานปัจจุบันไม่สำเร็จ จึงยกเลิกการสลับ');
      const created = await bridge.createStore({ label });
      await bridge.switchStore({ id: created.id });
    } catch (error) { window.__pmCancelStoreSwitch?.(); setMessage(error.message); await refresh().catch(() => {}); }
    finally { createButton.disabled = false; }
  });
  refresh().catch(error => { button.textContent = 'พื้นที่จัดเก็บไม่พร้อม'; button.title = error.message; });
})();
</script>`;
desktopHtml = desktopHtml.replace('</body>', storeManager + '\n</body>');
fs.writeFileSync(path.join(output, 'index.html'), desktopHtml, 'utf8');

// Build the utility classes referenced by the existing React/JSX page.
const tailwindCli = path.join(repo, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
execFileSync(process.execPath, [
  tailwindCli,
  '-c', path.join(repo, 'desktop', 'tailwind.config.cjs'),
  '-i', path.join(repo, 'desktop', 'styles', 'tailwind.input.css'),
  '-o', path.join(vendor, 'tailwind.css'),
  '--minify'
], { cwd: repo, stdio: 'inherit' });

for (const url of [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com',
  'https://unpkg.com/react',
  'https://cdnjs.cloudflare.com'
]) {
  if (desktopHtml.includes(url)) throw new Error('Desktop source still depends on CDN: ' + url);
}
console.log('Prepared offline Packmaster Desktop renderer: ' + output);
