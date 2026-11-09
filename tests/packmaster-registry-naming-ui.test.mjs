import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('all registry name rows have their own page navigation', () => {
  assert.match(html, /const \[registryNamePage, setRegistryNamePage\] = useState\(1\)/);
  assert.match(html, /visibleRegistryNameRows\.map\(\(row, index\) =>/);
  assert.match(html, /filteredRegistryNameRows\.length/);
  assert.match(html, /setRegistryNamePage\(page => Math\.min\(registryNamePageCount, page \+ 1\)\)/);
  assert.doesNotMatch(html, /\.slice\(0, 50\)\.map\(\(row, index\) =>/);
});
test('auto-generated name is not called confirmed in the registry table', () => {
  assert.match(html, /รวมชื่ออัตโนมัติ/);
  assert.match(html, /กรุณาตรวจสอบก่อนพิมพ์/);
  assert.match(html, /มีชื่อสำหรับจับคู่/);
  assert.doesNotMatch(html, /<th>ชื่อภายในที่ยืนยันแล้ว<\/th>/);
});
test('review distinguishes permanent registration and one-order correction', () => {
  assert.match(html, /บันทึกชื่อในทะเบียน \(เฉพาะ SKU ที่ระบุตัวได้\)/);
  assert.match(html, /ใช้ชื่อเฉพาะ Order นี้/);
  assert.match(html, /ไม่เพิ่มกฎเดาสินค้าอัตโนมัติ/);
});
