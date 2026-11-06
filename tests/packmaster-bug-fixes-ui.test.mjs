import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Quick Mapping dialog contains keyboard focus, closes with Escape, and restores opener focus', () => {
  assert.match(html, /quickMapDialogRef = useRef\(null\)/);
  assert.match(html, /child\.inert = true/);
  assert.match(html, /event\.key === 'Escape'[\s\S]*setQuickMapState\(\{ open: false/);
  assert.match(html, /event\.key !== 'Tab'[\s\S]*event\.shiftKey[\s\S]*last\.focus\(\)[\s\S]*first\.focus\(\)/);
  assert.match(html, /opener\?\.isConnected[\s\S]*opener\.focus\(\)/);
});

test('Quick Mapping internal-name input has a programmatic label association', () => {
  assert.match(html, /<label htmlFor="pm-quick-map-internal-name"[^>]*>ชื่อภายใน \/ ผลลัพธ์ที่จะพิมพ์<\/label><input id="pm-quick-map-internal-name"/);
});

test('PDF drop zone uses the picker handler and shares invalid-file and busy validation', () => {
  assert.match(html, /onDrop=\{event => \{ event\.preventDefault\(\);[\s\S]*handleFileUpload\(\{ target: \{ files, value: '' \} \}\)/);
  assert.match(html, /const unsupportedFiles = files\.filter\(file => !String\(file\.name \|\| ''\)\.toLowerCase\(\)\.endsWith\('\.pdf'\)\)/);
  assert.match(html, /if \(loadingStatus\.active\) \{\s*setUploadError\('กำลังประมวลผลไฟล์อยู่/);
});

test('Cloud safety copy identifies server storage and hides unsupported Cloud restore', () => {
  assert.match(html, /Batch, Orders และ Archive เก็บใน Cloud; Duplicate history และ Source filenames อยู่ใน Browser นี้/);
  assert.match(html, /!cloudMode \? <label[\s\S]*data-pm-cloud-restore-unavailable/);
  assert.match(html, /Cloud Replace Workspace ยังไม่รองรับ/);
});

test('late Cloud snapshot hydration invalidates the historical snapshot memo', () => {
  assert.match(html, /setReprintSnapshotVersion\(version => version \+ 1\)/);
  assert.match(html, /activeBatch && activeBatch\.resolvedSnapshot, reprintSnapshotApi, reprintSnapshotVersion/);
});
