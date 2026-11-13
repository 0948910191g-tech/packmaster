import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Characterization tests for quantity-label multiplication on pack slips.
// These lock the CURRENT behaviour of getAggregatedShortName in index.html.
// They must not be "fixed" by changing index.html; if they fail, the
// multiplication behaviour has changed and that change needs review.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(workspaceRoot, 'index.html'), 'utf8');

function loadAggregatedShortName() {
  const start = html.indexOf('const extractBundleSignature =');
  const end = html.indexOf('const waitForLabelRender =', start);
  assert.ok(start !== -1 && end > start, 'index.html must contain the getAggregatedShortName helper block');

  const context = {
    Date,
    parseInt,
    Math,
    Array,
    String,
    Number,
    normalizeMatchText: (text) => String(text || '').toLowerCase().trim()
  };
  vm.createContext(context);
  const snippet = html.slice(start, end) + '\nglobalThis.getAggregatedShortName = getAggregatedShortName;';
  vm.runInContext(snippet, context);

  assert.equal(typeof context.getAggregatedShortName, 'function');
  return context.getAggregatedShortName;
}

const getAggregatedShortName = loadAggregatedShortName();

test('boss examples: x2 multiplies the trailing quantity number', () => {
  assert.equal(getAggregatedShortName('12แผ่น6ห่อ', 2), '12แผ่น12ห่อ');
  assert.equal(getAggregatedShortName('เด้ง5', 2), 'เด้ง10');
});

test('quantity 1 (or missing/invalid) returns the trimmed name unchanged', () => {
  assert.equal(getAggregatedShortName('12แผ่น6ห่อ', 1), '12แผ่น6ห่อ');
  assert.equal(getAggregatedShortName('เด้ง5', 1), 'เด้ง5');
  assert.equal(getAggregatedShortName('เด้ง5', 0), 'เด้ง5');
  assert.equal(getAggregatedShortName('เด้ง5', undefined), 'เด้ง5');
  assert.equal(getAggregatedShortName('  เด้ง5  ', 1), 'เด้ง5');
});

test('x3 and x4 multiply the trailing quantity number', () => {
  assert.equal(getAggregatedShortName('12แผ่น6ห่อ', 3), '12แผ่น18ห่อ');
  assert.equal(getAggregatedShortName('เด้ง5', 3), 'เด้ง15');
  assert.equal(getAggregatedShortName('เด้ง5', 4), 'เด้ง20');
});

test('quantity given as a numeric string is parsed', () => {
  assert.equal(getAggregatedShortName('เด้ง5', '2'), 'เด้ง10');
});

test('names without digits are returned unchanged', () => {
  assert.equal(getAggregatedShortName('ชุดทดสอบ', 2), 'ชุดทดสอบ');
});

test('names with spaces keep their spacing and multiply the trailing number', () => {
  assert.equal(getAggregatedShortName('เด้ง ม่วง 5', 2), 'เด้ง ม่วง 10');
  assert.equal(getAggregatedShortName('ชุด 3 ชิ้น 4 ซอง', 2), 'ชุด 3 ชิ้น 8 ซอง');
  assert.equal(getAggregatedShortName('เด้ง 5', 2), 'เด้ง 10');
  assert.equal(getAggregatedShortName('  เด้ง5  ', 2), 'เด้ง10');
});

test('space-separated keyword/number pairs multiply every pair', () => {
  assert.equal(getAggregatedShortName('เด้งม่วง 5 ชม 5', 2), 'เด้งม่วง 10 ชม 10');
  assert.equal(getAggregatedShortName('เด้งม่วง 5 ชม 1', 3), 'เด้งม่วง 15 ชม 3');
});

test('model-style numbers (Hoya V2, Mini 2, bare model numbers) are not multiplied', () => {
  assert.equal(getAggregatedShortName('Hoya V2 ฮากุ 1 ลัง', 2), 'Hoya V2 ฮากุ 2 ลัง');
  assert.equal(getAggregatedShortName('95 1 1', 2), '95 1 2');
  assert.equal(getAggregatedShortName('Mini 2 เด้ง 5', 2), 'Mini 2 เด้ง 10');
});

test('bundle signature in the source keyword multiplies each component', () => {
  assert.equal(getAggregatedShortName('เด้งม่วง5 ชม1', 2, '5แถม1'), 'เด้งม่วง10 ชม2');
  assert.equal(getAggregatedShortName('เด้งม่วง5 ชม1', 3, '5แถม1'), 'เด้งม่วง15 ชม3');
  assert.equal(getAggregatedShortName('เด้งม่วง5 ชม1', 1, '5แถม1'), 'เด้งม่วง5 ชม1');
});

test('bundle signature that does not align with the label falls back to per-word multiplication', () => {
  assert.equal(getAggregatedShortName('เด้งม่วง5 ชม5', 2, '5แถม1'), 'เด้งม่วง10 ชม10');
});
