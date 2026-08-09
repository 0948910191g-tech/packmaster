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

test('Quick Mapping keeps safe seed/manual shortName behavior and only offers selectable suggestions', () => {
  assert.match(html, /getSkuFixSeed\(row, getMatchResult\)/, 'safe seed must remain the source for Quick Mapping');
  assert.match(html, /shortName:\s*''/, 'Quick Mapping shortName must remain blank initially');
  assert.match(html, /Keyword แนะนำ/);
  assert.match(html, /data-pm-keyword-suggestion/);
  assert.match(html, /confidence === ['"]recommended['"]/);
  assert.match(html, /setQuickMapState\(prev\s*=>\s*\(\{\s*\.\.\.prev,\s*keyword:\s*suggestion\.value\s*\}\)\)/s);
  assert.doesNotMatch(html, /shortName:\s*suggestion\./, 'suggestion click must not guess internal shortName');
  assert.match(html, /ยังไม่มี Keyword สั้นที่ระบบแนะนำได้อย่างปลอดภัย/);
});

test('manual save and library handoff still use the ordinary existing SKU rule path', () => {
  assert.match(html, /handleSaveQuickMapping/);
  assert.match(html, /saveSkuRule\(\{\s*keyword,\s*shortName\s*\}/s);
  assert.match(html, /setNewRule\(\{\s*keyword:\s*seed,\s*shortName:\s*String\(quickMapState\.shortName/s);
  assert.match(html, /disabled=\{!quickMapState\.keyword\.trim\(\) \|\| !quickMapState\.shortName\.trim\(\)\}/);
});

test('suggestions are ephemeral and generated from current SKU rules plus active batch item text', () => {
  assert.match(html, /generateKeywordSuggestions\(/);
  assert.match(html, /existingRules:\s*skuRules/);
  assert.match(html, /batchItemTexts/);
  assert.doesNotMatch(html, /localStorage\.setItem\([^\n]*keywordSuggestions/i);
});
