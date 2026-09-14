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

  const BRAND_ANCHORS = new Set([
    'HOYA', 'HAKU', 'EXCARE', 'NONO', 'SOULSI',
    'โฮย่า', 'ฮากุ', 'เอ็กซ์แคร์', 'นอนโน่', 'โซลซี่'
  ]);

  const PRODUCT_IDENTITY_TOKENS = new Set([
    'BABY', 'ADULT', 'MAKEUP', 'REMOVER', 'WIPES', 'WIPE', 'XXL', 'COOLING', 'MENTHOL', 'JASMINE',
    'เบบี้', 'ผู้ใหญ่', 'เมคอัพ', 'รีมูฟเวอร์', 'เครื่องสำอาง', 'คูลลิ่ง', 'เย็น', 'น้ำแร่'
  ]);

  const METADATA_TOKENS = new Set([
    'NICKNAME', 'ID', 'ORDER', 'ORDERID', 'ORDERNO', 'ORDER-NO', 'TRACKING', 'TRACKINGNO', 'TRACKING-NO',
    'RECEIVER', 'RECIPIENT', 'CUSTOMER', 'USER', 'UID', 'ADDRESS', 'PHONE', 'TEL', 'COD', 'PICK-UP', 'PICKUP',
    'QTY', 'QTYTOTAL', 'TOTALQTY', 'QUANTITY', 'TOTAL', 'จำนวน', 'จำนวนรวม', 'รวมจำนวน'
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
  const isBrandAnchor = (token) => BRAND_ANCHORS.has(normalizeKeywordText(token));
  const isThaiProductIdentityToken = (token) => {
    const normalized = normalizeKeywordText(token);
    return PRODUCT_IDENTITY_TOKENS.has(normalized) || normalized.startsWith('สูตร');
  };
  const hasLongIdentifier = (token) => /\d{8,}/.test(String(token || ''));
  const isMetadataToken = (token) => {
    const normalized = normalizeKeywordText(token);
    return METADATA_TOKENS.has(normalized) || normalized.startsWith('NICKNAME') || hasLongIdentifier(normalized);
  };
  const hasMetadataNoise = (tokens) => (Array.isArray(tokens) ? tokens : []).some(isMetadataToken);

  const isGenericCandidate = (value) => {
    const normalized = normalizeKeywordText(value);
    if (!normalized) return true;
    const tokens = tokenize(normalized);
    if (tokens.length === 0) return true;
    if (hasMetadataNoise(tokens)) return true;
    if (tokens.length === 1) {
      const token = tokens[0];
      if (GENERIC_SINGLE_TOKENS.has(token)) return true;
      if (token.length < 4 && !isModelOrVariantToken(token)) return true;
    }
    return false;
  };

  const getProductRelevance = (tokens) => {
    const values = Array.isArray(tokens) ? tokens : [];
    let score = 0;
    if (values.some(isBrandAnchor)) score += 60;
    if (values.some(token => PRODUCT_IDENTITY_TOKENS.has(normalizeKeywordText(token)) || isThaiProductIdentityToken(token))) score += 30;
    if (values.some(isModelOrVariantToken)) score += 12;
    if (values.some(token => normalizeKeywordText(token) === 'ทิชชู่เปียก')) score += 12;
    return score;
  };

  const addPoolCandidate = (pool, tokens, start, end, reason, baseScore) => {
    if (start < 0 || end > tokens.length || start >= end) return;
    const windowTokens = tokens.slice(start, end);
    if (windowTokens.length === 0 || hasMetadataNoise(windowTokens)) return;
    const value = windowTokens.join(' ').trim();
    const normalized = normalizeKeywordText(value);
    if (!normalized || isGenericCandidate(value)) return;
    if (windowTokens.length === 1 && !isModelOrVariantToken(windowTokens[0])) return;

    const existing = pool.get(normalized);
    const modelBonus = windowTokens.some(isModelOrVariantToken) ? 10 : 0;
    const relevance = getProductRelevance(windowTokens);
    const score = baseScore + (windowTokens.length * 8) + modelBonus + relevance;
    if (!existing || score > existing.score) {
      pool.set(normalized, { value, normalized, reason, score, relevance });
    }
  };

  const buildCandidatePool = (sourceText) => {
    const tokens = tokenize(sourceText);
    const pool = new Map();
    if (tokens.length === 0) return [];

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

        if (end < tokens.length && !GENERIC_SINGLE_TOKENS.has(tokens[end]) && !/^\d+$/.test(tokens[end])) {
          addPoolCandidate(pool, tokens, cursor, Math.min(tokens.length, end + 1), 'identity-window', 64);
        }
      } else {
        if (cursor > 0) addPoolCandidate(pool, tokens, cursor - 1, cursor + 1, 'identity-window', 48);
        if (cursor + 1 < tokens.length) addPoolCandidate(pool, tokens, cursor, cursor + 2, 'identity-window', 50);
      }
      cursor = end;
    }

    tokens.forEach((token, index) => {
      if (!isBrandAnchor(token) || /[A-Z]/.test(token)) return;
      if (index + 3 <= tokens.length) addPoolCandidate(pool, tokens, index, index + 3, 'product-anchor-window', 86);
      if (index + 2 <= tokens.length) addPoolCandidate(pool, tokens, index, index + 2, 'product-anchor-window', 82);
    });

    const hasThaiBrandAnchor = tokens.some(token => isBrandAnchor(token) && !/[A-Z]/.test(token));
    const maxThaiWindow = Math.min(3, tokens.length);
    for (let size = maxThaiWindow; size >= 2; size -= 1) {
      for (let start = 0; start + size <= tokens.length; start += 1) {
        const windowTokens = tokens.slice(start, start + size);
        if (hasMetadataNoise(windowTokens)) continue;
        if (hasThaiBrandAnchor && !windowTokens.some(isBrandAnchor)) continue;
        const hasUsefulToken = windowTokens.some(token =>
          isStrongToken(token) || isModelOrVariantToken(token) || isThaiProductIdentityToken(token) || isBrandAnchor(token)
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
    if (isGenericCandidate(candidate.value) || hasMetadataNoise(tokenize(candidate.value))) return null;

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
    const strongReason = candidate.reason === 'identity-run' || candidate.reason === 'identity-window';
    const confidence = collisions === 0 && tokenCount >= 2 && strongReason ? 'recommended' : 'review';
    const adjustedScore = candidate.score - (sourceBatchCollisions * 25) - (ruleCollisions * 18);

    return {
      value: candidate.value,
      confidence,
      reason: candidate.reason,
      collisions,
      relevance: candidate.relevance || 0,
      _score: adjustedScore
    };
  };

  const getMatchStatus = (result) => String(result && result.status || 'unmatched');
  const getRuleIdentity = (rule, normalizer) => {
    if (!rule) return '';
    return [
      String(rule.id == null ? '' : rule.id),
      normalizer(rule.keyword || ''),
      normalizer(rule.shortName || '')
    ].join('::');
  };

  const assessKeywordSafety = (input) => {
    const value = input && typeof input === 'object' ? input : {};
    const candidate = String(value.candidate == null ? '' : value.candidate).trim();
    const sourceText = String(value.sourceText == null ? '' : value.sourceText).trim();
    const existingRules = Array.isArray(value.existingRules) ? value.existingRules : [];
    const batchItemTexts = Array.isArray(value.batchItemTexts) ? value.batchItemTexts : [];
    const matchRule = value.matchRule;
    const matchNormalizer = typeof value.matchNormalizer === 'function' ? value.matchNormalizer : normalizeKeywordText;

    if (!candidate || !sourceText) return { safe: false, reason: 'empty' };
    if (typeof matchRule !== 'function') return { safe: false, reason: 'matcher-unavailable' };
    if (isGenericCandidate(candidate) || hasMetadataNoise(tokenize(candidate))) {
      return { safe: false, reason: 'metadata-or-generic' };
    }

    const candidateNormalized = matchNormalizer(candidate);
    const sourceNormalized = matchNormalizer(sourceText);
    if (!candidateNormalized || !sourceNormalized || !sourceNormalized.includes(candidateNormalized)) {
      return { safe: false, reason: 'not-source-identity' };
    }

    const duplicateKeywordRule = existingRules.find(rule =>
      matchNormalizer(rule && rule.keyword || '') === candidateNormalized
    );
    if (duplicateKeywordRule) {
      return { safe: false, reason: 'duplicate-keyword', rule: duplicateKeywordRule };
    }

    const candidateRule = {
      id: '__PACKMASTER_KEYWORD_SAFETY_CANDIDATE__',
      keyword: candidate,
      shortName: '__PACKMASTER_KEYWORD_SAFETY_CANDIDATE__'
    };
    const candidateIdentity = getRuleIdentity(candidateRule, matchNormalizer);
    const rulesWithCandidate = [...existingRules, candidateRule];

    const isCandidateResult = (result) =>
      getRuleIdentity(result && result.rule, matchNormalizer) === candidateIdentity;

    try {
      const sourceResult = matchRule(sourceText, rulesWithCandidate) || {};
      if (getMatchStatus(sourceResult) !== 'matched' || !isCandidateResult(sourceResult)) {
        return { safe: false, reason: 'source-not-unique' };
      }

      const probeMap = new Map();
      existingRules.forEach(rule => {
        const text = String(rule && rule.keyword || '').trim();
        const normalized = matchNormalizer(text);
        if (text && normalized && normalized !== sourceNormalized) probeMap.set(normalized, text);
      });
      batchItemTexts.forEach(textValue => {
        const text = String(textValue || '').trim();
        const normalized = matchNormalizer(text);
        if (text && normalized && normalized !== sourceNormalized) probeMap.set(normalized, text);
      });

      for (const probeText of probeMap.values()) {
        const before = matchRule(probeText, existingRules) || {};
        const after = matchRule(probeText, rulesWithCandidate) || {};
        const beforeStatus = getMatchStatus(before);
        const afterStatus = getMatchStatus(after);
        const beforeRule = getRuleIdentity(before.rule, matchNormalizer);
        const afterRule = getRuleIdentity(after.rule, matchNormalizer);

        if (beforeStatus !== afterStatus || beforeRule !== afterRule) {
          return { safe: false, reason: 'routing-change', probe: probeText };
        }

        if (beforeStatus !== 'matched') {
          const candidateOnly = matchRule(probeText, [candidateRule]) || {};
          if (getMatchStatus(candidateOnly) === 'matched' && isCandidateResult(candidateOnly)) {
            return { safe: false, reason: 'cross-match', probe: probeText };
          }
        }
      }
    } catch (error) {
      return { safe: false, reason: 'matcher-error' };
    }

    return { safe: true, reason: 'verified-current-context' };
  };

  const reasonRank = (row) => {
    if (row.reason === 'identity-run' || row.reason === 'product-anchor-window') return 3;
    if (row.reason === 'identity-window') return 2;
    return 1;
  };

  const generateKeywordSuggestions = (input) => {
    const value = input && typeof input === 'object' ? input : {};
    const sourceText = String(value.sourceText == null ? '' : value.sourceText).trim();
    if (!sourceText) return [];

    const sourceNormalized = normalizeKeywordText(sourceText);
    if (!sourceNormalized) return [];

    const maxSuggestions = Math.max(1, Math.min(3, parseInt(value.maxSuggestions, 10) || 3));
    const pool = buildCandidatePool(sourceText);
    let evaluated = pool
      .map(candidate => evaluateCandidate(
        candidate,
        sourceNormalized,
        value.existingRules,
        value.batchItemTexts
      ))
      .filter(Boolean)
      .filter(row => !isGenericCandidate(row.value));

    if (value.safeOnly) {
      evaluated = evaluated
        .map(row => {
          const safety = assessKeywordSafety({
            candidate: row.value,
            sourceText,
            existingRules: value.existingRules,
            batchItemTexts: value.batchItemTexts,
            matchRule: value.matchRule,
            matchNormalizer: value.matchNormalizer
          });
          if (!safety.safe) return null;
          return { ...row, confidence: 'recommended', safety: safety.reason };
        })
        .filter(Boolean);
    }

    evaluated.sort((a, b) => {
      const byReason = reasonRank(b) - reasonRank(a);
      if (byReason !== 0) return byReason;
      const byRelevance = (b.relevance || 0) - (a.relevance || 0);
      if (byRelevance !== 0) return byRelevance;
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
        collisions: row.collisions,
        safety: row.safety || null
      });
      if (output.length >= maxSuggestions) break;
    }
    return output;
  };

  return {
    normalizeKeywordText,
    isGenericCandidate,
    assessKeywordSafety,
    generateKeywordSuggestions
  };
});
