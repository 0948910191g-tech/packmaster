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
  assert.match(html, /getSkuFixSeed\(row, getMatchResult\)/, 'safe seed must remain the source for Quick Mapping');
  assert.match(html, /sourceText:\s*seed/, 'Quick Mapping must preserve the exact unresolved SKU seed for later safety checks');
  assert.match(html, /shortName:\s*''/, 'Quick Mapping shortName must remain blank initially');
  assert.match(html, /Keyword แนะนำที่ผ่าน Safety Check/);
  assert.match(html, /data-pm-keyword-suggestion/);
  assert.match(html, /confidence === ['"]recommended['"]/);
  assert.match(html, /ปลอดภัย/);
  assert.match(html, /setQuickMapState\(prev\s*=>\s*\(\{\s*\.\.\.prev,\s*keyword:\s*suggestion\.value\s*\}\)\)/s);
  assert.doesNotMatch(html, /shortName:\s*suggestion\./, 'suggestion click must not guess internal shortName');
  assert.match(html, /ไม่มี Keyword ที่ผ่าน Safety Check กับคลังและ Batch ปัจจุบัน/);
});

test('Quick Mapping auto-selects the first verified suggestion and never defaults to the unsafe source seed', () => {
  assert.match(html, /const initialKeyword = suggestions\.length > 0 \? suggestions\[0\]\.value : '';/,
    'Quick Mapping must default to a verified suggestion only');
  assert.match(html, /setQuickMapState\(\{\s*open:\s*true,\s*row,\s*sourceText:\s*seed,\s*keyword:\s*initialKeyword,\s*shortName:\s*'',\s*suggestions\s*\}\);/s,
    'the selected Keyword must be the verified initial suggestion');
  assert.doesNotMatch(html, /setQuickMapState\(\{\s*open:\s*true,\s*row,\s*sourceText:\s*seed,\s*keyword:\s*seed,\s*shortName:\s*'',\s*suggestions\s*\}\);/s,
    'unsafe source text must not remain the default save candidate');
});

test('Quick Mapping generates fail-closed suggestions with the actual Smart Matcher', () => {
  assert.match(html, /generateKeywordSuggestions\(/);
  assert.match(html, /existingRules:\s*skuRules/);
  assert.match(html, /batchItemTexts/);
  assert.match(html, /safeOnly:\s*true/);
  assert.match(html, /matchRule:\s*matchSkuRule/);
  assert.match(html, /matchNormalizer:\s*normalizeMatchText/);
  assert.doesNotMatch(html, /localStorage\.setItem\([^\n]*keywordSuggestions/i);
});

test('manual Quick Mapping save rechecks the same source identity before creating a rule', () => {
  assert.match(html, /handleSaveQuickMapping/);
  assert.match(html, /assessKeywordSafety\(\{/);
  assert.match(html, /candidate:\s*keyword/);
  assert.match(html, /sourceText:\s*String\(quickMapState\.sourceText\s*\|\|\s*''\)/);
  assert.match(html, /matchRule:\s*matchSkuRule/);
  assert.match(html, /matchNormalizer:\s*normalizeMatchText/);
  assert.match(html, /if\s*\(!safety\.safe\)/);
  assert.match(html, /saveSkuRule\(\{\s*keyword,\s*shortName\s*\}/s);
  assert.match(html, /setNewRule\(\{\s*keyword:\s*seed,\s*shortName:\s*String\(quickMapState\.shortName/s);
  assert.match(html, /disabled=\{!quickMapState\.keyword\.trim\(\) \|\| !quickMapState\.shortName\.trim\(\)\}/);
});

test('ordinary SKU rule save blocks normalized exact keyword duplicates', () => {
  assert.match(html, /duplicateKeywordRule/);
  assert.match(html, /normalizeMatchText\(rule\.keyword\)\s*===\s*normalizeMatchText\(cleanKeyword\)/);
  assert.match(html, /Keyword นี้มีอยู่แล้วในคลังคำศัพท์/);
});
