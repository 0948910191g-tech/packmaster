import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

const replaceOnce = (label, before, after) => {
  const first = html.indexOf(before);
  if (first < 0) throw new Error(`${label}: target snippet not found`);
  if (html.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: target snippet is not unique`);
  html = html.slice(0, first) + after + html.slice(first + before.length);
};

replaceOnce(
  'brand anchors',
  "    const COMMON_MATCH_TERMS = new Set(['hoya', 'haku', 'baby', 'wipes', 'wipe', 'ทชชเปยก', 'ผาเปยก']);\n    const RULE_UNIT_TOKENS = new Set(['หอ', 'แพค', 'pack', 'packs', 'ลัง', 'case', 'x', 'ชน', 'ชิ้น', 'แผน']);",
  "    const COMMON_MATCH_TERMS = new Set(['baby', 'wipes', 'wipe', 'ทชชเปยก', 'ผาเปยก']);\n    const BRAND_CONCEPTS = {\n      HOYA: ['hoya', 'โฮย่า'],\n      HAKU: ['haku', 'ฮากุ'],\n      EXCARE: ['excare', 'เอ็กซ์แคร์'],\n      NONO: ['nono', 'นอนโน่'],\n      SOULSI: ['soulsi', 'โซลซี่']\n    };\n    const BRAND_MATCH_TERMS = new Set(\n      Object.values(BRAND_CONCEPTS).flat().map(alias => normalizeMatchText(alias)).filter(Boolean)\n    );\n    const RULE_UNIT_TOKENS = new Set(['หอ', 'แพค', 'pack', 'packs', 'ลัง', 'case', 'x', 'ชน', 'ชิ้น', 'แผน']);"
);

replaceOnce(
  'sheet identity extraction',
  "    const extractPackTokens = (value) => {\n      const text = normalizeMatchText(value);\n      const tokens = new Set();\n      const regex = /(\\d{1,3})\\s*(หอ|แพค|packs?|ลัง|case)/g;\n      let match;\n      while ((match = regex.exec(text)) !== null) {\n        const unit = /ลัง|case/.test(match[2]) ? 'case' : 'pack';\n        tokens.add(`${parseInt(match[1], 10)}:${unit}`);\n      }\n      return tokens;\n    };",
  "    const extractPackTokens = (value) => {\n      const text = normalizeMatchText(value);\n      const tokens = new Set();\n      const regex = /(\\d{1,3})\\s*(หอ|แพค|packs?|ลัง|case)/g;\n      let match;\n      while ((match = regex.exec(text)) !== null) {\n        const unit = /ลัง|case/.test(match[2]) ? 'case' : 'pack';\n        tokens.add(`${parseInt(match[1], 10)}:${unit}`);\n      }\n      return tokens;\n    };\n\n    const extractSheetNumbers = (value) => {\n      const text = normalizeMatchText(value);\n      const numbers = new Set();\n      const regex = /(\\d{1,3})\\s*(แผน|sheets?)/g;\n      let match;\n      while ((match = regex.exec(text)) !== null) {\n        const amount = parseInt(match[1], 10);\n        if (Number.isFinite(amount)) numbers.add(amount);\n      }\n      return numbers;\n    };"
);

replaceOnce(
  'brand concept extraction',
  "    const tokenMatchesSearch = (token, searchArea) => {\n      if (!token) return false;\n      if (/^\\d{1,4}$/.test(token)) {\n        const escaped = token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\n        return new RegExp(`(^|\\\\D)${escaped}(?!\\\\d)`).test(searchArea);\n      }\n      if (/^[a-z0-9]+$/.test(token)) {\n        const escaped = token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\n        return new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])`).test(searchArea);\n      }\n      return searchArea.includes(token);\n    };",
  "    const tokenMatchesSearch = (token, searchArea) => {\n      if (!token) return false;\n      if (/^\\d{1,4}$/.test(token)) {\n        const escaped = token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\n        return new RegExp(`(^|\\\\D)${escaped}(?!\\\\d)`).test(searchArea);\n      }\n      if (/^[a-z0-9]+$/.test(token)) {\n        const escaped = token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\n        return new RegExp(`(^|[^a-z0-9])${escaped}(?![a-z0-9])`).test(searchArea);\n      }\n      return searchArea.includes(token);\n    };\n\n    const getBrandConcepts = (value) => {\n      const text = normalizeMatchText(value);\n      const brands = new Set();\n      Object.entries(BRAND_CONCEPTS).forEach(([brand, aliases]) => {\n        if (aliases.some(alias => tokenMatchesSearch(normalizeMatchText(alias), text))) brands.add(brand);\n      });\n      return brands;\n    };"
);

replaceOnce(
  'trailing pack identity',
  "      const trailing = clean.match(/(?:^|\\D)(\\d{1,3})\\s*$/);",
  "      const trailing = clean.match(/(?:^|\\s)(\\d{1,3})\\s*$/);"
);

replaceOnce(
  'score identity setup',
  "      const textConcepts = getVariantConcepts(searchArea);\n      const ruleConcepts = getVariantConcepts(cleanKw);\n      if (options && options.includeOutputVariantConcepts) {\n        getVariantConcepts(rule && rule.shortName).forEach(concept => ruleConcepts.add(concept));\n      }\n      const textBundle = extractBundleSignature(searchArea);\n      const ruleBundle = extractBundleSignature(cleanKw);",
  "      const textConcepts = getVariantConcepts(searchArea);\n      const ruleConcepts = getVariantConcepts(cleanKw);\n      if (options && options.includeOutputVariantConcepts) {\n        getVariantConcepts(rule && rule.shortName).forEach(concept => ruleConcepts.add(concept));\n      }\n      const textBrands = getBrandConcepts(searchArea);\n      const ruleBrands = getBrandConcepts(cleanKw);\n      const sharedBrand = [...ruleBrands].some(brand => textBrands.has(brand));\n      const hasBrandIdentity = ruleBrands.size > 0 && textBrands.size > 0 && sharedBrand;\n      const textBundle = extractBundleSignature(searchArea);\n      const ruleBundle = extractBundleSignature(cleanKw);\n\n      if (ruleBrands.size > 0 && textBrands.size > 0 && !sharedBrand) {\n        score -= 320;\n        hardConflict = true;\n        reasons.push('brand-conflict');\n      }"
);

replaceOnce(
  'specific token brand exclusion',
  "      const specificTokens = ruleTokens.filter(token =>\n        !/^\\d{1,4}$/.test(token) && !COMMON_MATCH_TERMS.has(token) && !RULE_UNIT_TOKENS.has(token)\n      );",
  "      const specificTokens = ruleTokens.filter(token =>\n        !/^\\d{1,4}$/.test(token) &&\n        !COMMON_MATCH_TERMS.has(token) &&\n        !BRAND_MATCH_TERMS.has(token) &&\n        !RULE_UNIT_TOKENS.has(token)\n      );"
);

replaceOnce(
  'pack compatibility and sheet conflict',
  "      const textPackNumbers = extractTextPackNumbers(searchArea);\n      const rulePackNumbers = extractRulePackNumbers(cleanKw);\n      if (rulePackNumbers.size > 0 && textPackNumbers.size > 0) {\n        const packMatch = [...rulePackNumbers].some(number => textPackNumbers.has(number));\n        if (packMatch) {\n          score += 50;\n          reasons.push('pack');\n        } else {\n          score -= 200;\n          hardConflict = true;\n          reasons.push('pack-conflict');\n        }\n      }",
  "      const textPackNumbers = extractTextPackNumbers(searchArea);\n      const textSheetNumbers = extractSheetNumbers(searchArea);\n      const rulePackNumbers = extractRulePackNumbers(cleanKw);\n      let hasPackIdentity = false;\n      if (rulePackNumbers.size > 0 && textPackNumbers.size > 0) {\n        const packMatch = [...rulePackNumbers].some(number => textPackNumbers.has(number));\n        if (packMatch) {\n          hasPackIdentity = true;\n          score += 50;\n          reasons.push('pack');\n        } else {\n          score -= 200;\n          hardConflict = true;\n          reasons.push('pack-conflict');\n        }\n      } else if (rulePackNumbers.size > 0 && [...rulePackNumbers].some(number => textSheetNumbers.has(number))) {\n        score -= 220;\n        hardConflict = true;\n        reasons.push('pack-vs-sheet-conflict');\n      }"
);

replaceOnce(
  'strong identity contract',
  "      const numericRuleTokens = ruleTokens.filter(token => /^\\d{1,4}$/.test(token));\n      if (numericRuleTokens.some(token => tokenMatchesSearch(token, searchArea)) &&\n          [...ruleConcepts].every(concept => textConcepts.has(concept))) {\n        score += 20;\n        reasons.push('concept-number');\n      }\n\n      return { rule, score, hardConflict, reason: reasons.join(',') || 'weak' };",
  "      const numericRuleTokens = ruleTokens.filter(token => /^\\d{1,4}$/.test(token));\n      if (numericRuleTokens.some(token => tokenMatchesSearch(token, searchArea)) &&\n          [...ruleConcepts].every(concept => textConcepts.has(concept))) {\n        score += 20;\n        reasons.push('concept-number');\n      }\n\n      const hasCommonFamilyIdentity = matchedTokens.some(token => token === 'baby');\n      const strongIdentity = Boolean(\n        (textBundle && ruleBundle === textBundle) ||\n        hasConceptIdentity ||\n        matchedSpecific.length > 0 ||\n        (hasBrandIdentity && hasCommonFamilyIdentity && hasPackIdentity)\n      );\n\n      return { rule, score, hardConflict, strongIdentity, reason: reasons.join(',') || 'weak' };"
);

replaceOnce(
  'structured brand fallback',
  "      const productText = parts[0];\n      const identityParts = parts.slice(1);\n      const productConcepts = getVariantConcepts(productText);\n      const productPackTokens = extractPackTokens(productText);\n      const bundleSignature = extractBundleSignature(productText);\n      const structuredParts = [...identityParts];",
  "      const productText = parts[0];\n      const identityParts = parts.slice(1);\n      const productConcepts = getVariantConcepts(productText);\n      const productPackTokens = extractPackTokens(productText);\n      const bundleSignature = extractBundleSignature(productText);\n      const identityBrands = getBrandConcepts(identityParts.join(' '));\n      const productBrands = getBrandConcepts(productText);\n      const structuredParts = [...identityParts];\n\n      if (identityBrands.size === 0) {\n        productBrands.forEach(brand => {\n          const aliases = BRAND_CONCEPTS[brand];\n          if (Array.isArray(aliases) && aliases[0]) structuredParts.push(aliases[0]);\n        });\n      }"
);

replaceOnce(
  'structured strong identity requirement',
  "      if (best.hardConflict || best.score < 120) return null;",
  "      if (best.hardConflict || !best.strongIdentity || best.score < 120) return null;"
);

replaceOnce(
  'exact identity gate',
  "        const structuredIdentity = getStructuredMarketplaceIdentity(textToSearch);\n        if (structuredIdentity) {\n          const exactStructuredScore = scoreSkuRule(\n            exactRule,\n            structuredIdentity,\n            rules,\n            { includeOutputVariantConcepts: true }\n          );\n          if (exactStructuredScore.hardConflict) {\n            return {\n              status: 'ambiguous',\n              rule: null,\n              score: exactStructuredScore.score,\n              runnerUpScore: structuredMatch ? structuredMatch.runnerUpScore : 0,\n              reason: 'structured-exact-conflict:' + exactStructuredScore.reason\n            };\n          }\n        }\n\n        return { status: 'matched', rule: exactRule, score: 1000, runnerUpScore: 0, reason: 'exact-longest' };",
  "        const structuredIdentity = getStructuredMarketplaceIdentity(textToSearch);\n        const exactSafetyText = structuredIdentity || textToSearch;\n        const exactSafetyScore = scoreSkuRule(\n          exactRule,\n          exactSafetyText,\n          rules,\n          { includeOutputVariantConcepts: true }\n        );\n        if (exactSafetyScore.hardConflict) {\n          const failClosedToUnmatched = /brand-conflict|pack-vs-sheet-conflict/.test(exactSafetyScore.reason);\n          return {\n            status: failClosedToUnmatched ? 'unmatched' : 'ambiguous',\n            rule: null,\n            score: exactSafetyScore.score,\n            runnerUpScore: structuredMatch ? structuredMatch.runnerUpScore : 0,\n            reason: 'structured-exact-conflict:' + exactSafetyScore.reason\n          };\n        }\n        if (!exactSafetyScore.strongIdentity) {\n          return {\n            status: 'unmatched',\n            rule: null,\n            score: exactSafetyScore.score,\n            runnerUpScore: structuredMatch ? structuredMatch.runnerUpScore : 0,\n            reason: 'exact-weak-identity:' + exactSafetyScore.reason\n          };\n        }\n\n        return { status: 'matched', rule: exactRule, score: 1000, runnerUpScore: 0, reason: 'exact-longest' };"
);

replaceOnce(
  'fuzzy fail closed',
  "      if (best.hardConflict || best.score < 80) {\n        return { status: 'unmatched', rule: null, score: best.score, runnerUpScore, reason: best.reason };\n      }",
  "      if (best.hardConflict || !best.strongIdentity || best.score < 80) {\n        const reason = !best.hardConflict && !best.strongIdentity ? `weak-identity:${best.reason}` : best.reason;\n        return { status: 'unmatched', rule: null, score: best.score, runnerUpScore, reason };\n      }"
);

fs.writeFileSync(file, html);
console.log('Matcher safety reset patch applied to index.html');
