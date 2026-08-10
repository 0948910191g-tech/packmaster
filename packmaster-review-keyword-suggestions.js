(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterReviewKeywordSuggestions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const normalizeSpaces = (value) => String(value == null ? '' : value)
    .replace(/[\u200B-\u200F\uFEFF\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const CORRUPT_THAI_MARK = '[\uFFFD\u25A1\u25A0\u25A2\uE000-\uF8FF]';
  const THAI_DISPLAY_REPAIRS = [
    [new RegExp(`ห${CORRUPT_THAI_MARK}อ`, 'g'), 'ห่อ'],
    [new RegExp(`ทิชชู${CORRUPT_THAI_MARK}เปียก`, 'g'), 'ทิชชู่เปียก'],
    [new RegExp(`สไตล${CORRUPT_THAI_MARK}`, 'g'), 'สไตล์'],
    [new RegExp(`ญี่ปุ${CORRUPT_THAI_MARK}น`, 'g'), 'ญี่ปุ่น'],
    [new RegExp(`แผ${CORRUPT_THAI_MARK}น`, 'g'), 'แผ่น'],
    [new RegExp(`คุณค${CORRUPT_THAI_MARK}า`, 'g'), 'คุณค่า']
  ];

  const formatReviewDisplayText = (value) => {
    let text = normalizeSpaces(value);
    if (!text) return '';
    try {
      text = text.normalize('NFC');
    } catch (error) {
      // Older runtimes may not expose String#normalize; Review display can still proceed safely.
    }
    THAI_DISPLAY_REPAIRS.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });
    return text;
  };

  const METADATA_BOUNDARY = /(?:\bNICKNAME\b|\bORDER\s*(?:ID|NO)?\b|\bTRACKING\s*(?:NO)?\b|\bRECEIVER\b|\bRECIPIENT\b|\bCUSTOMER\b|\bUID\b|\bADDRESS\b|\bPHONE\b|\bTEL\b|\bCOD\b|\bQTY\s*TOTAL\b|\bTOTAL\s*QTY\b|\bQUANTITY\b|จำนวนรวม|รวมจำนวน)/i;

  const sanitizeSourceIdentity = (sourceText) => {
    let text = normalizeSpaces(sourceText);
    if (!text) return '';

    const boundary = text.match(METADATA_BOUNDARY);
    if (boundary && typeof boundary.index === 'number' && boundary.index > 0) {
      text = text.slice(0, boundary.index).trim();
    }

    text = text
      .replace(/\b(?:TH|JT|SPX)[A-Z0-9]{8,}\b/gi, ' ')
      .replace(/\b\d{10,}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  };

  const toAdvisory = (row, extra = {}) => {
    const rawValue = String(row && row.value || '').trim();
    return {
      value: rawValue,
      displayValue: formatReviewDisplayText(rawValue),
      confidence: 'recommended',
      reason: String(row && row.reason || extra.reason || 'review-safe'),
      collisions: Number(row && row.collisions) || 0,
      safety: row && row.safety || extra.safety || 'verified-current-context',
      specificity: extra.specificity || row && row.specificity || 'safe-current-context',
      autoApply: false,
      autoSave: false
    };
  };

  const generateReviewKeywordSuggestions = (input) => {
    const value = input && typeof input === 'object' ? input : {};
    const sourceText = normalizeSpaces(value.sourceText);
    const assistant = value.keywordAssistant;
    if (!sourceText || !assistant || typeof assistant.generateKeywordSuggestions !== 'function') return [];

    const maxSuggestions = Math.max(1, Math.min(3, parseInt(value.maxSuggestions, 10) || 3));
    const matchNormalizer = typeof value.matchNormalizer === 'function'
      ? value.matchNormalizer
      : (typeof assistant.normalizeKeywordText === 'function' ? assistant.normalizeKeywordText : normalizeSpaces);
    const seen = new Set();
    const output = [];

    const add = (row, extra) => {
      const advisory = toAdvisory(row, extra);
      if (!advisory.value) return;
      const key = String(matchNormalizer(advisory.value) || '').trim();
      if (!key || seen.has(key)) return;
      if (typeof assistant.isGenericCandidate === 'function' && assistant.isGenericCandidate(advisory.value)) return;
      seen.add(key);
      output.push(advisory);
    };

    const sanitizedFullSource = sanitizeSourceIdentity(sourceText);
    if (
      sanitizedFullSource &&
      typeof assistant.assessKeywordSafety === 'function' &&
      typeof value.matchRule === 'function'
    ) {
      const safety = assistant.assessKeywordSafety({
        candidate: sanitizedFullSource,
        sourceText,
        existingRules: value.existingRules,
        batchItemTexts: value.batchItemTexts,
        matchRule: value.matchRule,
        matchNormalizer
      });
      if (safety && safety.safe) {
        add(
          { value: sanitizedFullSource, reason: 'full-source-identity', collisions: 0, safety: safety.reason },
          { specificity: 'current-context-max', safety: safety.reason }
        );
      }
    }

    let compact = [];
    try {
      compact = assistant.generateKeywordSuggestions({
        sourceText,
        existingRules: value.existingRules,
        batchItemTexts: value.batchItemTexts,
        maxSuggestions,
        safeOnly: true,
        matchRule: value.matchRule,
        matchNormalizer
      });
    } catch (error) {
      compact = [];
    }

    compact.forEach((row) => add(row, { specificity: 'safe-compact' }));

    return output.slice(0, maxSuggestions);
  };

  return {
    sanitizeSourceIdentity,
    formatReviewDisplayText,
    generateReviewKeywordSuggestions
  };
});
