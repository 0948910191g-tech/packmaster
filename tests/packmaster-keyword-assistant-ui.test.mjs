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
  assert.match(html, /getSkuFixSeed\(row, text => getMatchResult\(text, row\.order\.platform\)\)/);
  assert.match(html, /sourceText:\s*seed/);
  assert.match(html, /shortName:\s*''/);
  assert.match(html, /Keyword แนะนำที่ผ่าน Safety Check/);
  assert.match(html, /data-pm-keyword-suggestion/);
  assert.match(html, /setQuickMapState\(prev\s*=>\s*\(\{\s*\.\.\.prev,\s*keyword:\s*suggestion\.value\s*\}\)\)/s);
  assert.doesNotMatch(html, /shortName:\s*suggestion\./);
});

test('Quick Mapping leaves Keyword blank until the user explicitly chooses one', () => {
  assert.match(html, /setQuickMapState\(\{\s*open:\s*true,\s*row,\s*sourceText:\s*seed,\s*keyword:\s*'',\s*shortName:\s*'',\s*suggestions\s*\}\);/s);
  assert.doesNotMatch(html, /const initialKeyword = suggestions\.length > 0 \? suggestions\[0\]\.value : '';/);
});

test('Quick Mapping generates fail-closed suggestions with the actual Smart Matcher', () => {
  assert.match(html, /generateKeywordSuggestions\(/);
  assert.match(html, /existingRules:\s*scopedRules/);
  assert.match(html, /batchItemTexts/);
  assert.match(html, /safeOnly:\s*true/);
  assert.match(html, /matchRule:\s*matchSkuRule/);
  assert.match(html, /matchNormalizer:\s*normalizeMatchText/);
});

test('persistent Quick Mapping save uses verified registry identity instead of keyword rules', () => {
  assert.match(html, /handleSaveQuickMapping/);
  assert.match(html, /saveRegistryAssignment\(order\.platform, item, shortName\)/);
  assert.match(html, /registryIdentityApi\.resolve\(marketplaceCatalogIndex, platform, item\)/);
  assert.match(html, /registryMatcherApi\.upsertAssignment\(/);
  const start = html.indexOf('const handleSaveQuickMapping');
  const end = html.indexOf('const handleOpenQuickMapInLibrary', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(html.slice(start, end), /saveSkuRule\(/);
  assert.match(html, /ยืนยัน Seller SKU และใช้/);
});
