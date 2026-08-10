import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const assistant = require('../packmaster-keyword-assistant.js');
const reviewKeywords = require('../packmaster-review-keyword-suggestions.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const matcherStart = html.indexOf('const normalizeMatchText');
const matcherEnd = html.indexOf('const waitForLabelRender');
assert.ok(matcherStart >= 0 && matcherEnd > matcherStart, 'Smart Matcher helper block is missing from index.html');
const matcherSource = `${html.slice(matcherStart, matcherEnd)}\n` + `\nglobalThis.__reviewKeywordMatcher = { normalizeMatchText, matchSkuRule };`;
const matcherContext = {};
vm.createContext(matcherContext);
vm.runInContext(matcherSource, matcherContext);
const { normalizeMatchText, matchSkuRule } = matcherContext.__reviewKeywordMatcher;

test('keeps existing safe suggestions first and never returns generic-only keywords', () => {
  const source = 'HOYA BABY PURPLE 5 PACK';
  const rows = reviewKeywords.generateReviewKeywordSuggestions({
    sourceText: source,
    existingRules: [],
    batchItemTexts: [source],
    maxSuggestions: 3,
    keywordAssistant: assistant,
    matchRule: matchSkuRule,
    matchNormalizer: normalizeMatchText
  });

  assert.ok(rows.length >= 1);
  assert.equal(rows.some(row => ['HOYA', 'BABY', 'PACK'].includes(String(row.value).toUpperCase())), false);
  assert.ok(rows.every(row => String(row.value).trim().length > 0));
});

test('falls back to the most specific real source identity when safe-only short candidates are empty', () => {
  const source = 'HAKU Cooling Lavender 30 Sheets SellerSKU LAV30-NEW';
  const sibling = 'HAKU Cooling Jasmine 30 Sheets SellerSKU JAS30-NEW';
  const existingRules = [
    { id: 1, keyword: 'HAKU COOLING LAVENDER', shortName: 'old-lavender' }
  ];

  const shortOnly = assistant.generateKeywordSuggestions({
    sourceText: source,
    existingRules,
    batchItemTexts: [source, sibling],
    maxSuggestions: 3,
    safeOnly: true,
    matchRule: matchSkuRule,
    matchNormalizer: normalizeMatchText
  });

  const rows = reviewKeywords.generateReviewKeywordSuggestions({
    sourceText: source,
    existingRules,
    batchItemTexts: [source, sibling],
    maxSuggestions: 3,
    keywordAssistant: assistant,
    matchRule: matchSkuRule,
    matchNormalizer: normalizeMatchText
  });

  assert.ok(rows.length >= 1, `review fallback must not be empty even when short-only result is ${JSON.stringify(shortOnly)}`);
  assert.ok(rows.some(row => /LAV30-NEW/i.test(row.value) || /Lavender.*30/i.test(row.value)), 'fallback must preserve a real discriminator from source text');
  assert.equal(rows.some(row => /JAS30-NEW/i.test(row.value)), false, 'fallback must never invent a sibling discriminator');
  assert.ok(rows.every(row => normalizeMatchText(source).includes(normalizeMatchText(row.value))), 'every recommendation must be a real contiguous source identity');
});

test('does not fabricate a keyword when no non-generic source identity can be extracted', () => {
  const rows = reviewKeywords.generateReviewKeywordSuggestions({
    sourceText: 'HOYA',
    existingRules: [],
    batchItemTexts: ['HOYA'],
    keywordAssistant: assistant,
    matchRule: matchSkuRule,
    matchNormalizer: normalizeMatchText
  });
  assert.deepEqual(rows, []);
});

test('review recommendations are advisory metadata and deterministic', () => {
  const input = {
    sourceText: 'EXCARE ADULT WIPES XXL 50 SHEETS',
    existingRules: [],
    batchItemTexts: ['EXCARE ADULT WIPES XXL 50 SHEETS'],
    maxSuggestions: 3,
    keywordAssistant: assistant,
    matchRule: matchSkuRule,
    matchNormalizer: normalizeMatchText
  };
  const first = reviewKeywords.generateReviewKeywordSuggestions(input);
  const second = reviewKeywords.generateReviewKeywordSuggestions(input);
  assert.deepEqual(first, second);
  assert.ok(first.every(row => row.autoApply !== true && row.autoSave !== true));
});
