from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')
start = text.index('    const normalizeMatchText = ')
end = text.index('    const parseExplicitTotalQty = ', start)

new_block = r'''    const normalizeMatchText = (str) => String(str || '').toLowerCase()
        .replace(/[\u200B-\u200F\uFEFF\xA0]/g, ' ')
        .replace(/[\uF700-\uF71A]/g, '')
        .replace(/\u0E33/g, 'า')
        .replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '')
        .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\bbb\b/g, 'baby');

    const COMMON_MATCH_TERMS = new Set(['hoya', 'haku', 'baby', 'wipes', 'wipe', 'ทชชเปยก', 'ผาเปยก']);
    const RULE_UNIT_TOKENS = new Set(['หอ', 'แพค', 'pack', 'packs', 'ลัง', 'case', 'x', 'ชน', 'ชิ้น', 'แผน']);
    const VARIANT_CONCEPTS = {
      VALUE_PACK: ['value pack', 'valuepack', 'แวลู', 'แวล'],
      PLUS: ['plus', 'พลส', 'พลัส'],
      COOLING: ['cooling', 'คูลลิง', 'คูลลิ่ง', 'สูตรเย็น', 'เย็นติดแอร', 'ติดแอร'],
      EXTRA: ['extra', 'เอ็กซตรา', 'เอกซตรา', 'เอ็กซ์ตร้า'],
      MENTHOL: ['menthol', 'เมนทอล'],
      LAVENDER: ['lavender', 'ลาเวนเดอร'],
      JASMINE: ['jasmine', 'มะลิ'],
      MIX: ['mix', 'คละ'],
      NONO: ['nono'],
      ALCOHOL: ['alcohol', 'alc', 'แอลกอฮอล']
    };
    const HARD_VARIANT_CONCEPTS = new Set(['VALUE_PACK', 'PLUS', 'EXTRA', 'MENTHOL', 'LAVENDER', 'JASMINE', 'MIX']);

    const getVariantConcepts = (value) => {
      const text = normalizeMatchText(value);
      const concepts = new Set();
      Object.entries(VARIANT_CONCEPTS).forEach(([concept, aliases]) => {
        if (aliases.some(alias => text.includes(normalizeMatchText(alias)))) concepts.add(concept);
      });
      return concepts;
    };

    const extractPackTokens = (value) => {
      const text = normalizeMatchText(value);
      const tokens = new Set();
      const regex = /(\d{1,3})\s*(หอ|แพค|packs?|ลัง|case)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const unit = /ลัง|case/.test(match[2]) ? 'case' : 'pack';
        tokens.add(`${parseInt(match[1], 10)}:${unit}`);
      }
      return tokens;
    };

    const tokenMatchesSearch = (token, searchArea) => {
      if (!token) return false;
      if (/^\d{1,4}$/.test(token)) {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|\\D)${escaped}(?!\\d)`).test(searchArea);
      }
      if (/^[a-z0-9]+$/.test(token)) {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])`).test(searchArea);
      }
      return searchArea.includes(token);
    };

    const extractRulePackNumbers = (value) => {
      const clean = normalizeMatchText(value);
      const explicit = extractPackTokens(clean);
      if (explicit.size > 0) {
        return new Set([...explicit].map(token => parseInt(token.split(':')[0], 10)).filter(Number.isFinite));
      }
      const trailing = clean.match(/(?:^|\D)(\d{1,3})\s*$/);
      return trailing ? new Set([parseInt(trailing[1], 10)]) : new Set();
    };

    const extractTextPackNumbers = (value) => new Set(
      [...extractPackTokens(value)].map(token => parseInt(token.split(':')[0], 10)).filter(Number.isFinite)
    );

    const scoreSkuRule = (rule, textToSearch, allRules = []) => {
      const searchArea = normalizeMatchText(textToSearch);
      const cleanKw = normalizeMatchText(rule && rule.keyword);
      if (!searchArea || !cleanKw) return { rule, score: -Infinity, hardConflict: true, reason: 'empty' };

      let score = 0;
      let hardConflict = false;
      const reasons = [];
      const ruleTokens = cleanKw.split(' ').filter(Boolean);
      const matchedTokens = ruleTokens.filter(token => tokenMatchesSearch(token, searchArea));
      const coverage = ruleTokens.length ? matchedTokens.length / ruleTokens.length : 0;
      const textConcepts = getVariantConcepts(searchArea);
      const ruleConcepts = getVariantConcepts(cleanKw);

      if (searchArea.includes(cleanKw)) {
        score += 140;
        reasons.push('exact');
      }
      if (coverage === 1) {
        score += 70;
        reasons.push('all-terms');
      } else if (coverage >= 0.75) {
        score += 25;
        reasons.push('partial-terms');
      }

      const specificTokens = ruleTokens.filter(token =>
        !/^\d{1,4}$/.test(token) && !COMMON_MATCH_TERMS.has(token) && !RULE_UNIT_TOKENS.has(token)
      );
      const matchedSpecific = specificTokens.filter(token => tokenMatchesSearch(token, searchArea));
      const hasConceptIdentity = [...ruleConcepts].some(concept => textConcepts.has(concept));
      if (specificTokens.length > 0 && matchedSpecific.length === 0 && !hasConceptIdentity) {
        score -= 220;
        hardConflict = true;
        reasons.push('identity-miss');
      }

      matchedTokens.forEach(token => {
        if (COMMON_MATCH_TERMS.has(token)) {
          score += 4;
          return;
        }
        if (/^\d{1,4}$/.test(token)) {
          score += 8;
          return;
        }
        const frequency = (Array.isArray(allRules) ? allRules : []).filter(candidate =>
          tokenMatchesSearch(token, normalizeMatchText(candidate && candidate.keyword))
        ).length;
        score += frequency <= 1 ? 18 : 9;
      });

      const textPackNumbers = extractTextPackNumbers(searchArea);
      const rulePackNumbers = extractRulePackNumbers(cleanKw);
      if (rulePackNumbers.size > 0 && textPackNumbers.size > 0) {
        const packMatch = [...rulePackNumbers].some(number => textPackNumbers.has(number));
        if (packMatch) {
          score += 50;
          reasons.push('pack');
        } else {
          score -= 200;
          hardConflict = true;
          reasons.push('pack-conflict');
        }
      }

      ruleConcepts.forEach(concept => {
        if (textConcepts.has(concept)) {
          score += 40;
          reasons.push(`concept:${concept}`);
        } else {
          score -= HARD_VARIANT_CONCEPTS.has(concept) ? 160 : 35;
          if (HARD_VARIANT_CONCEPTS.has(concept)) hardConflict = true;
          reasons.push(`missing:${concept}`);
        }
      });

      HARD_VARIANT_CONCEPTS.forEach(concept => {
        if (textConcepts.has(concept) && !ruleConcepts.has(concept)) {
          score -= 200;
          hardConflict = true;
          reasons.push(`unexpected:${concept}`);
        }
      });

      const coolingFamilyConcepts = new Set(['MENTHOL', 'LAVENDER', 'JASMINE', 'EXTRA', 'MIX']);
      if (textConcepts.has('COOLING') && !ruleConcepts.has('COOLING') &&
          ![...ruleConcepts].some(concept => coolingFamilyConcepts.has(concept)) &&
          ruleTokens.includes('haku')) {
        score -= 180;
        hardConflict = true;
        reasons.push('cooling-generic-conflict');
      }

      const numericRuleTokens = ruleTokens.filter(token => /^\d{1,4}$/.test(token));
      if (numericRuleTokens.some(token => tokenMatchesSearch(token, searchArea)) &&
          [...ruleConcepts].every(concept => textConcepts.has(concept))) {
        score += 20;
        reasons.push('concept-number');
      }

      return { rule, score, hardConflict, reason: reasons.join(',') || 'weak' };
    };

    const matchSkuRule = (textToSearch, rules) => {
      const searchArea = normalizeMatchText(textToSearch);
      const normalizedRules = (Array.isArray(rules) ? rules : [])
        .map(rule => ({ rule, cleanKw: normalizeMatchText(rule && rule.keyword) }))
        .filter(entry => entry.cleanKw);

      const exactMatches = normalizedRules
        .filter(entry => searchArea.includes(entry.cleanKw))
        .sort((a, b) => b.cleanKw.length - a.cleanKw.length);

      if (exactMatches.length > 0) {
        const longestLength = exactMatches[0].cleanKw.length;
        const longest = exactMatches.filter(entry => entry.cleanKw.length === longestLength);
        const outputs = new Set(longest.map(entry => String(entry.rule && entry.rule.shortName || '').trim()));
        if (outputs.size > 1) {
          return { status: 'ambiguous', rule: null, score: 1000, runnerUpScore: 1000, reason: 'exact-conflict' };
        }
        return { status: 'matched', rule: longest[0].rule, score: 1000, runnerUpScore: 0, reason: 'exact-longest' };
      }

      const candidates = normalizedRules
        .map(entry => scoreSkuRule(entry.rule, textToSearch, rules))
        .filter(candidate => Number.isFinite(candidate.score))
        .sort((a, b) => b.score - a.score);

      if (candidates.length === 0) {
        return { status: 'unmatched', rule: null, score: 0, runnerUpScore: 0, reason: 'no-rules' };
      }

      const best = candidates[0];
      const runnerUp = candidates[1] || null;
      const runnerUpScore = runnerUp ? runnerUp.score : -Infinity;

      if (best.hardConflict || best.score < 80) {
        return { status: 'unmatched', rule: null, score: best.score, runnerUpScore, reason: best.reason };
      }

      if (runnerUp && !runnerUp.hardConflict &&
          String(runnerUp.rule && runnerUp.rule.shortName || '').trim() !== String(best.rule && best.rule.shortName || '').trim() &&
          best.score - runnerUp.score < 20) {
        return { status: 'ambiguous', rule: null, score: best.score, runnerUpScore, reason: 'score-gap' };
      }

      return { status: 'matched', rule: best.rule, score: best.score, runnerUpScore, reason: best.reason };
    };

'''

text = text[:start] + new_block + text[end:]

old_header = r'''      const hasTableSignal = normalizeMatchText(entries.map(item => item.text).join(' ')).includes('product name');
      const qtyHeaders = entries.filter(item => normalizeMatchText(item.text) === 'qty');
      let header = null;

      for (const qtyHeader of qtyHeaders) {
        const sameLine = entries.filter(item => Math.abs(item.y - qtyHeader.y) <= 5);
        const normalized = sameLine.map(item => normalizeMatchText(item.text));
        const skuHeaders = sameLine.filter(item => normalizeMatchText(item.text) === 'sku').sort((a, b) => a.x - b.x);
        const sellerHeader = sameLine.find(item => normalizeMatchText(item.text) === 'seller');
        if (normalized.includes('product') && normalized.includes('name') && skuHeaders.length >= 1 && sellerHeader) {
          header = {
            y: qtyHeader.y,
            qtyX: qtyHeader.x,
            firstSkuX: skuHeaders[0].x,
            sellerX: sellerHeader.x
          };
          break;
        }
      }
'''

new_header = r'''      const hasTableSignal = normalizeMatchText(entries.map(item => item.text).join(' ')).includes('product name');
      const qtyHeaders = entries.filter(item => normalizeMatchText(item.text) === 'qty');
      let header = null;

      for (const qtyHeader of qtyHeaders) {
        const sameLine = entries.filter(item => Math.abs(item.y - qtyHeader.y) <= 5);
        const lineText = normalizeMatchText(sameLine.map(item => item.text).join(' '));
        const sellerHeader = sameLine.find(item => normalizeMatchText(item.text).includes('seller'));
        const skuHeaders = sameLine
          .filter(item => /(^|\s)sku($|\s)/.test(normalizeMatchText(item.text)))
          .sort((a, b) => a.x - b.x);
        const firstSkuHeader = sellerHeader
          ? (skuHeaders.find(item => item.x < sellerHeader.x - 1) || skuHeaders[0])
          : skuHeaders[0];

        if (lineText.includes('product name') && firstSkuHeader && sellerHeader && qtyHeader.x > sellerHeader.x) {
          header = {
            y: qtyHeader.y,
            qtyX: qtyHeader.x,
            firstSkuX: firstSkuHeader.x,
            sellerX: sellerHeader.x
          };
          break;
        }
      }
'''

if old_header not in text:
    if new_header not in text:
        raise SystemExit('TikTok header block not found')
else:
    text = text.replace(old_header, new_header, 1)

path.write_text(text, encoding='utf-8')
