(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterKeywordAssistant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GENERIC_SINGLE_TOKENS = new Set([
    'HOYA', 'HAKU', 'EXCARE', 'BABY', 'WIPE', 'WIPES', 'WET', 'PACK', 'PACKS',
    'สูตร', 'กลิ่น', 'ห่อ', 'แผ่น', 'ชิ้น', 'ลัง', 'สินค้า', 'ทิชชู่', 'ทิชชู่เปียก'
  ]);

  const normalizeKeywordText = (value) => String(value == null ? '' : value)
    .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, ' ')
    .replace(/[“”"'`]/g, ' ')
    .replace(/[()[\]{}|,:;]+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const tokenize = (value) => normalizeKeywordText(value)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  const isBundleToken = (token) => /\d+\s*แถม\s*\d+/i.test(token) || /^\d+[xX]\d+$/.test(token);
  const isLatinIdentityToken = (token) => /[A-Z]/i.test(token) && /[A-Z0-9%]/i.test(token) && token.length >= 2;
  const isModelOrVariantToken = (token) => /\d/.test(token) || token.includes('%') || isBundleToken(token);
  const isStrongToken = (token) => isLatinIdentityToken(token) || isBundleToken(token);

  const isGenericCandidate = (value) => {
    const normalized = normalizeKeywordText(value);
    if (!normalized) return true;
    const tokens = tokenize(normalized);
    if (tokens.length === 0) return true;
    if (tokens.length === 1) {
      const token = tokens[0];
      if (GENERIC_SINGLE_TOKENS.has(token)) return true;
      if (token.length < 4 && !isModelOrVariantToken(token)) return true;
    }
    return false;
  };

  const addPoolCandidate = (pool, tokens, start, end, reason, baseScore) => {
    if (start < 0 || end > tokens.length || start >= end) return;
    const windowTokens = tokens.slice(start, end);
    if (windowTokens.length === 0) return;
    const value = windowTokens.join(' ').trim();
    const normalized = normalizeKeywordText(value);
    if (!normalized || isGenericCandidate(value)) return;
    if (windowTokens.length === 1 && !isModelOrVariantToken(windowTokens[0])) return;

    const existing = pool.get(normalized);
    const modelBonus = windowTokens.some(isModelOrVariantToken) ? 10 : 0;
    const score = baseScore + (windowTokens.length * 8) + modelBonus;
    if (!existing || score > existing.score) {
      pool.set(normalized, { value, normalized, reason, score });
    }
  };

  const buildCandidatePool = (sourceText) => {
    const tokens = tokenize(sourceText);
    const pool = new Map();
    if (tokens.length === 0) return [];

    // Strong Latin / alphanumeric runs are the safest source of compact exact-match keywords.
    let cursor = 0;
    while (cursor < tokens.length) {
      if (!isStrongToken(tokens[cursor])) {
        cursor += 1;
        continue;
      }
      let end = cursor + 1;
      while (end < tokens.length && isStrongToken(tokens[end])) end += 1;
      const runLength = end - cursor;

      if (runLength >= 2) {
        const maxWindow = Math.min(5, runLength);
        for (let size = maxWindow; size >= 2; size -= 1) {
          for (let start = cursor; start + size <= end; start += 1) {
            addPoolCandidate(pool, tokens, start, start + size, 'identity-run', 70);
          }
        }

        // Include one immediate non-generic neighbor when it adds product identity.
        if (end < tokens.length && !GENERIC_SINGLE_TOKENS.has(tokens[end]) && !/^\d+$/.test(tokens[end])) {
          addPoolCandidate(pool, tokens, cursor, Math.min(tokens.length, end + 1), 'identity-window', 64);
        }
      } else {
        // A single strong token needs local context; never suggest a lone generic brand.
        if (cursor > 0) addPoolCandidate(pool, tokens, cursor - 1, cursor + 1, 'identity-window', 48);
        if (cursor + 1 < tokens.length) addPoolCandidate(pool, tokens, cursor, cursor + 2, 'identity-window', 50);
      }
      cursor = end;
    }

    // Conservative mixed/Thai windows. These rank below strong identity runs and must pass collision checks.
    const maxThaiWindow = Math.min(4, tokens.length);
    for (let size = maxThaiWindow; size >= 2; size -= 1) {
      for (let start = 0; start + size <= tokens.length; start += 1) {
        const windowTokens = tokens.slice(start, start + size);
        const hasUsefulToken = windowTokens.some(token =>
          isStrongToken(token) || isModelOrVariantToken(token) || (token.length >= 5 && !GENERIC_SINGLE_TOKENS.has(token))
        );
        if (!hasUsefulToken) continue;
        addPoolCandidate(pool, tokens, start, start + size, 'mixed-window', 28);
      }
    }

    return Array.from(pool.values());
  };

  const uniqueNormalizedTexts = (values) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizeKeywordText)
      .filter(Boolean)
  ));

  const evaluateCandidate = (candidate, sourceNormalized, existingRules, batchItemTexts) => {
    if (!sourceNormalized.includes(candidate.normalized)) return null;

    const normalizedBatchTexts = uniqueNormalizedTexts(batchItemTexts);
    const matchingBatchTexts = normalizedBatchTexts.filter(text => text.includes(candidate.normalized));
    const sourceBatchCollisions = Math.max(0, matchingBatchTexts.filter(text => text !== sourceNormalized).length);

    let ruleCollisions = 0;
    for (const rule of Array.isArray(existingRules) ? existingRules : []) {
      const ruleKeyword = normalizeKeywordText(rule && rule.keyword);
      if (!ruleKeyword) continue;
      if (
        ruleKeyword === candidate.normalized ||
        ruleKeyword.includes(candidate.normalized) ||
        candidate.normalized.includes(ruleKeyword)
      ) {
        ruleCollisions += 1;
      }
    }

    const collisions = sourceBatchCollisions + ruleCollisions;
    const tokenCount = tokenize(candidate.value).length;
    const confidence = collisions === 0 && tokenCount >= 2 ? 'recommended' : 'review';
    const adjustedScore = candidate.score - (sourceBatchCollisions * 25) - (ruleCollisions * 18);

    return {
      value: candidate.value,
      confidence,
      reason: candidate.reason,
      collisions,
      _score: adjustedScore
    };
  };

  const generateKeywordSuggestions = (input) => {
    const value = input && typeof input === 'object' ? input : {};
    const sourceText = String(value.sourceText == null ? '' : value.sourceText).trim();
    if (!sourceText) return [];

    const sourceNormalized = normalizeKeywordText(sourceText);
    if (!sourceNormalized) return [];

    const maxSuggestions = Math.max(1, Math.min(3, parseInt(value.maxSuggestions, 10) || 3));
    const pool = buildCandidatePool(sourceText);
    const evaluated = pool
      .map(candidate => evaluateCandidate(
        candidate,
        sourceNormalized,
        value.existingRules,
        value.batchItemTexts
      ))
      .filter(Boolean)
      .filter(row => !isGenericCandidate(row.value));

    evaluated.sort((a, b) => {
      const confidenceRank = (row) => row.confidence === 'recommended' ? 1 : 0;
      const byConfidence = confidenceRank(b) - confidenceRank(a);
      if (byConfidence !== 0) return byConfidence;
      const byScore = b._score - a._score;
      if (byScore !== 0) return byScore;
      const byLength = b.value.length - a.value.length;
      if (byLength !== 0) return byLength;
      return a.value.localeCompare(b.value, 'th');
    });

    const seen = new Set();
    const output = [];
    for (const row of evaluated) {
      const normalized = normalizeKeywordText(row.value);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      output.push({
        value: row.value,
        confidence: row.confidence,
        reason: row.reason,
        collisions: row.collisions
      });
      if (output.length >= maxSuggestions) break;
    }
    return output;
  };

  return {
    normalizeKeywordText,
    isGenericCandidate,
    generateKeywordSuggestions
  };
});
