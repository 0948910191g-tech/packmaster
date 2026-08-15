import fs from 'node:fs';

const file = 'index.html';
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  [
`      MIX: ['mix', 'คละ'],
      NONO: ['nono'],
      ALCOHOL: ['alcohol', 'alc', 'แอลกอฮอล']
    };
    const HARD_VARIANT_CONCEPTS = new Set(['VALUE_PACK', 'PLUS', 'EXTRA', 'MENTHOL', 'LAVENDER', 'JASMINE', 'MIX']);`,
`      MIX: ['mix', 'คละ'],
      PURPLE: ['สีม่วง', 'เด้งม่วง'],
      PINK: ['สีชมพู', 'ชมพู', 'เด้งชม'],
      NONO: ['nono'],
      ALCOHOL: ['alcohol', 'alc', 'แอลกอฮอล']
    };
    const HARD_VARIANT_CONCEPTS = new Set(['VALUE_PACK', 'PLUS', 'EXTRA', 'MENTHOL', 'LAVENDER', 'JASMINE', 'MIX', 'PURPLE', 'PINK']);`
  ],
  [
`    const scoreSkuRule = (rule, textToSearch, allRules = []) => {`,
`    const scoreSkuRule = (rule, textToSearch, allRules = [], options = {}) => {`
  ],
  [
`      const textConcepts = getVariantConcepts(searchArea);
      const ruleConcepts = getVariantConcepts(cleanKw);`,
`      const textConcepts = getVariantConcepts(searchArea);
      const ruleConcepts = getVariantConcepts(cleanKw);
      if (options && options.includeOutputVariantConcepts) {
        getVariantConcepts(rule && rule.shortName).forEach(concept => ruleConcepts.add(concept));
      }`
  ],
  [
`        .map(rule => scoreSkuRule(rule, structuredIdentity, rules))`,
`        .map(rule => scoreSkuRule(rule, structuredIdentity, rules, { includeOutputVariantConcepts: true }))`
  ],
  [
`        if (structuredMatch && structuredMatch.status === 'matched' &&
            normalizeOutputIdentity(structuredMatch.rule && structuredMatch.rule.shortName) !== normalizeOutputIdentity(exactRule && exactRule.shortName)) {
          return structuredMatch;
        }

        return { status: 'matched', rule: exactRule, score: 1000, runnerUpScore: 0, reason: 'exact-longest' };`,
`        if (structuredMatch && structuredMatch.status === 'matched' &&
            normalizeOutputIdentity(structuredMatch.rule && structuredMatch.rule.shortName) !== normalizeOutputIdentity(exactRule && exactRule.shortName)) {
          return structuredMatch;
        }

        const structuredIdentity = getStructuredMarketplaceIdentity(textToSearch);
        if (structuredIdentity) {
          const exactStructuredScore = scoreSkuRule(
            exactRule,
            structuredIdentity,
            rules,
            { includeOutputVariantConcepts: true }
          );
          if (exactStructuredScore.hardConflict) {
            return {
              status: 'ambiguous',
              rule: null,
              score: exactStructuredScore.score,
              runnerUpScore: structuredMatch ? structuredMatch.runnerUpScore : 0,
              reason: 'structured-exact-conflict:' + exactStructuredScore.reason
            };
          }
        }

        return { status: 'matched', rule: exactRule, score: 1000, runnerUpScore: 0, reason: 'exact-longest' };`
  ]
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) {
    throw new Error(`Expected matcher block not found:\n${before.slice(0, 160)}`);
  }
  source = source.replace(before, after);
}

fs.writeFileSync(file, source);
