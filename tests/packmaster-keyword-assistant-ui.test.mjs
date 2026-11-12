import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');

test('loads the local Keyword Assistant helper before the app uses it', () => {
  assert.match(html, /<script src="\.\/packmaster-keyword-assistant\.js"><\/script>/);
  assert.match(html, /const keywordAssistantApi = window\.PackMasterKeywordAssistant;/);
});

test('Quick Mapping keeps the exact safe seed as source identity and never guesses shortName', () => {
  assert.match(html, /getSkuFixSeed\(row, getMatchResult\)/);
  assert.match(html, /sourceText:\s*seed/);
  assert.match(html, /shortName:\s*''/);
  assert.match(html, /บันทึกชื่อจาก SKU ที่ตรงทะเบียน|ยืนยันและผูกคู่ SKU\/ข้อความใน Local/);
  assert.doesNotMatch(html, /shortName:\s*suggestion\./);
});

test('Quick Mapping leaves Keyword blank until the user explicitly chooses one', () => {
  assert.match(html, /setQuickMapState\(\{\s*open:\s*true,\s*row,\s*sourceText:\s*seed,\s*itemIndex:\s*getReviewSourceItemIndex\(row, seed\),\s*keyword:\s*'',\s*shortName:\s*'',\s*suggestions\s*\}\);/s);
  assert.doesNotMatch(html, /const initialKeyword = suggestions\.length > 0 \? suggestions\[0\]\.value : '';/);
});

test('Quick Mapping generates fail-closed suggestions with the actual Smart Matcher', () => {
  assert.match(html, /generateKeywordSuggestions\(/);
  assert.match(html, /existingRules:\s*skuRules/);
  assert.match(html, /batchItemTexts/);
  assert.match(html, /safeOnly:\s*true/);
  assert.match(html, /matchRule:\s*matchSkuRule/);
  assert.match(html, /matchNormalizer:\s*normalizeMatchText/);
});

test('persistent Quick Mapping save confirms registry assignment directly', () => {
  assert.match(html, /handleSaveQuickMapping/);
  assert.match(html, /saveRegistryAssignment\(order\.platform,\s*item,\s*quickMapState\.shortName\)/);
  assert.match(html, /บันทึกชื่อจาก SKU ที่ตรงทะเบียน|ยืนยันและผูกคู่ SKU\/ข้อความใน Local/);
});
