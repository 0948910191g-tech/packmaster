import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');

const helperStart = html.indexOf('const normalizeRuleKeyword');
const helperEnd = html.indexOf('const waitForLabelRender');
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'หา helper block ใน index.html ไม่เจอ');

const helperSource = `${html.slice(helperStart, helperEnd)}\n` + `
globalThis.__packmasterHelpers = {
  normalizeRuleKeyword,
  normalizeMatchText,
  hasQuantityNumber,
  findDuplicateRule,
  getAggregatedShortName
};`;

const context = {};
vm.createContext(context);
vm.runInContext(helperSource, context);
const {
  normalizeMatchText,
  hasQuantityNumber,
  findDuplicateRule,
  getAggregatedShortName
} = context.__packmasterHelpers;

// PDF ภาษาไทยบางไฟล์ใช้ private-use glyph แทนวรรณยุกต์ เช่น \uF70A
assert.equal(
  normalizeMatchText('ฮากุเบบี้ -ยกลัง36ห\uF70Aอ'),
  normalizeMatchText('ฮากุเบบี้-ยกลัง36ห่อ'),
  'keyword ภาษาไทยควร match ได้แม้ PDF ใช้ Thai private-use mark'
);

assert.equal(hasQuantityNumber('ฮากุ 1 ลัง'), true, 'Base SKU ที่มีจำนวนต้องผ่าน');
assert.equal(hasQuantityNumber('ของแถม'), false, 'Base SKU ที่ไม่มีเลขจำนวนต้องถูกเตือน/บล็อก');

const rules = [
  { id: 1, keyword: 'Hoya 24', shortName: 'เด้งม่วง 1 ลัง' },
  { id: 2, keyword: 'ฮากุ เบบี้ 36', shortName: 'ฮากุ 1 ลัง' }
];
assert.equal(findDuplicateRule(rules, '  hoya   24  ')?.id, 1, 'Keyword ซ้ำต่าง case/ช่องว่างต้องตรวจพบ');
assert.equal(findDuplicateRule(rules, 'Hoya 24', 1), null, 'ตอนแก้รายการเดิมต้องไม่ชนกับตัวเอง');

assert.equal(
  getAggregatedShortName('Hoya V2 ฮากุ 1 ลัง', 2),
  'Hoya V2 ฮากุ 2 ลัง',
  'สูตรรวมจำนวนเดิมต้องไม่แก้เลขรุ่นก่อนหน้า'
);

console.log('PackMaster guardrail regression tests passed');
