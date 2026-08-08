import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-active-batch-bar/, 'Active Batch context bar must exist');
assert.match(html, /แก้รายการที่ต้องตรวจ/, 'Active Batch bar must expose exception-first CTA');
assert.match(html, /พิมพ์ Batch/, 'Active Batch bar must expose ready-to-print CTA');
assert.match(html, /กลับงานแพ็ก/, 'Active Batch bar must provide a safe return to Batch workspace');
assert.match(html, /เริ่มงานแพ็กใหม่/, 'Primary Batch creation copy must use operational wording');
assert.match(html, /exceptionRows\.length/, 'Active Batch bar must derive unresolved work from current exceptionRows');
assert.equal(/indexedDB\.(open|deleteDatabase)/.test(html.match(/data-pm-active-batch-bar[\s\S]{0,8000}/)?.[0] || ''), false, 'Active Batch bar must not add IndexedDB behavior');

console.log('PackMaster active Batch context contract passed');
