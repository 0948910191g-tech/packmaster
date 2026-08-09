import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const assistant = require('../packmaster-keyword-assistant.js');

const normalizedIncludes = (source, candidate) => assistant
  .normalizeKeywordText(source)
  .includes(assistant.normalizeKeywordText(candidate));

test('suggests shorter contiguous identity keywords for a long unmapped product title', () => {
  const source = '(1 แถม 1) ทิชชู่เปียกเครื่องสำอาง EXCARE MAKEUP REMOVER ช่วยขจัดเมคอัพและทำความสะอาดผิว 30 แผ่นใหญ่';
  const suggestions = assistant.generateKeywordSuggestions({
    sourceText: source,
    existingRules: [],
    batchItemTexts: [source],
    maxSuggestions: 3
  });

  assert.ok(suggestions.length > 0 && suggestions.length <= 3);
  assert.ok(suggestions.some(row => row.value === 'EXCARE MAKEUP REMOVER' && row.confidence === 'recommended'));
  assert.equal(suggestions.some(row => row.value === 'EXCARE'), false, 'generic brand-only keyword must not be proposed');
  assert.ok(suggestions.every(row => normalizedIncludes(source, row.value)), 'every suggestion must stay on the contiguous exact-match path');
  assert.equal(
    suggestions.some(row => row.value === 'EXCARE MAKEUP REMOVER 30' && row.confidence === 'recommended'),
    false,
    'non-contiguous synthetic phrase must never be recommended'
  );
});

test('preserves model, percent and bundle identity values instead of rewriting them', () => {
  const model = 'HOYA V2 HAKU BLUE 1 ลัง';
  const percent = 'HOYA ALCOHOL 95% 1L';
  const bundle = 'HOYA BABY 5แถม5 สีม่วง';

  const modelSuggestions = assistant.generateKeywordSuggestions({ sourceText: model, batchItemTexts: [model] });
  const percentSuggestions = assistant.generateKeywordSuggestions({ sourceText: percent, batchItemTexts: [percent] });
  const bundleSuggestions = assistant.generateKeywordSuggestions({ sourceText: bundle, batchItemTexts: [bundle] });

  assert.ok(modelSuggestions.some(row => row.value.includes('V2')), 'V2 should remain available in a strong candidate');
  assert.ok(percentSuggestions.some(row => row.value.includes('95%')), '95% should remain available in a strong candidate');
  assert.ok(bundleSuggestions.some(row => row.value.includes('5แถม5')), 'bundle signature must not be cleaned as promo noise');

  assert.ok(modelSuggestions.every(row => normalizedIncludes(model, row.value)));
  assert.ok(percentSuggestions.every(row => normalizedIncludes(percent, row.value)));
  assert.ok(bundleSuggestions.every(row => normalizedIncludes(bundle, row.value)));
});

test('rejects generic-only candidates', () => {
  for (const value of ['HOYA', 'HAKU', 'EXCARE', 'Baby']) {
    assert.equal(assistant.isGenericCandidate(value), true, `${value} should be generic alone`);
    const suggestions = assistant.generateKeywordSuggestions({ sourceText: value, batchItemTexts: [value] });
    assert.deepEqual(suggestions, []);
  }
});

test('keeps mixed or Thai fallback windows review-only even without current collisions', () => {
  const source = 'ทิชชู่เปียก สูตรเย็น 30 แผ่น สำหรับเช็ดทำความสะอาด';
  const suggestions = assistant.generateKeywordSuggestions({ sourceText: source, batchItemTexts: [source] });
  assert.ok(suggestions.length > 0, 'mixed fallback should still be available for manual review');
  assert.ok(suggestions.every(row => row.confidence === 'review'), 'mixed fallback must never receive the recommended badge');
});

test('downgrades a short candidate when it appears across distinct sibling products', () => {
  const current = 'HOYA BABY PURPLE 5 PACK';
  const sibling = 'HOYA BABY PINK 5 PACK';
  const suggestions = assistant.generateKeywordSuggestions({
    sourceText: current,
    existingRules: [],
    batchItemTexts: [current, sibling],
    maxSuggestions: 3
  });

  const broad = suggestions.find(row => row.value === 'HOYA BABY');
  if (broad) {
    assert.equal(broad.confidence, 'review');
    assert.ok(broad.collisions > 0);
  }

  const recommended = suggestions.filter(row => row.confidence === 'recommended');
  assert.ok(recommended.every(row => !assistant.normalizeKeywordText(sibling).includes(assistant.normalizeKeywordText(row.value))));
});

test('downgrades or omits a candidate that overlaps an existing broader rule', () => {
  const source = 'EXCARE MAKEUP REMOVER 30 SHEETS';
  const suggestions = assistant.generateKeywordSuggestions({
    sourceText: source,
    existingRules: [{ id: 1, keyword: 'EXCARE MAKEUP', shortName: 'Existing' }],
    batchItemTexts: [source]
  });

  const overlapping = suggestions.find(row => row.value === 'EXCARE MAKEUP');
  if (overlapping) assert.equal(overlapping.confidence, 'review');

  assert.equal(
    suggestions.some(row => row.value === 'EXCARE MAKEUP' && row.confidence === 'recommended'),
    false
  );
});

test('is deterministic, capped, non-mutating and safe on empty input', () => {
  const source = 'HOYA V2 HAKU COOLING BLUE 30';
  const input = {
    sourceText: source,
    existingRules: [],
    batchItemTexts: [source],
    maxSuggestions: 2
  };
  const before = JSON.stringify(input);
  const first = assistant.generateKeywordSuggestions(input);
  const second = assistant.generateKeywordSuggestions(input);

  assert.deepEqual(first, second);
  assert.ok(first.length <= 2);
  assert.equal(JSON.stringify(input), before, 'helper must not mutate caller data');
  assert.deepEqual(assistant.generateKeywordSuggestions({ sourceText: '' }), []);
  assert.deepEqual(assistant.generateKeywordSuggestions({ sourceText: '   ' }), []);
});
