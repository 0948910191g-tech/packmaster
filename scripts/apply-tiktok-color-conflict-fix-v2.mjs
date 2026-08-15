import fs from 'node:fs';

const file = 'index.html';
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  [
"    const HARD_VARIANT_CONCEPTS = new Set(['VALUE_PACK', 'PLUS', 'EXTRA', 'MENTHOL', 'LAVENDER', 'JASMINE', 'MIX', 'PURPLE', 'PINK']);",
"    const HARD_VARIANT_CONCEPTS = new Set(['VALUE_PACK', 'PLUS', 'EXTRA', 'MENTHOL', 'LAVENDER', 'JASMINE', 'MIX']);\n    const STRUCTURED_COLOR_CONCEPTS = new Set(['PURPLE', 'PINK']);"
  ],
  [
`      const textBundle = extractBundleSignature(searchArea);
      const ruleBundle = extractBundleSignature(cleanKw);

      if (textBundle || ruleBundle) {`,
`      const textBundle = extractBundleSignature(searchArea);
      const ruleBundle = extractBundleSignature(cleanKw);

      if (options && options.includeOutputVariantConcepts) {
        const textColors = [...STRUCTURED_COLOR_CONCEPTS].filter(concept => textConcepts.has(concept));
        const ruleColors = [...STRUCTURED_COLOR_CONCEPTS].filter(concept => ruleConcepts.has(concept));
        if (textColors.length > 0 && ruleColors.length > 0 && !ruleColors.some(concept => textConcepts.has(concept))) {
          score -= 240;
          hardConflict = true;
          reasons.push('seller-color-conflict');
        }
      }

      if (textBundle || ruleBundle) {`
  ]
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error('Expected matcher block not found');
  source = source.replace(before, after);
}

fs.writeFileSync(file, source);
