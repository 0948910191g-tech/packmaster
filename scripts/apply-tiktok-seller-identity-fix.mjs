import fs from 'node:fs';

const file = 'index.html';
let source = fs.readFileSync(file, 'utf8');

if (source.includes('const getStructuredMarketplaceIdentity = (textToSearch) => {')) {
  console.log('TikTok structured identity fix already applied');
  process.exit(0);
}

const matcherAnchor = '    const matchSkuRule = (textToSearch, rules) => {';
if (!source.includes(matcherAnchor)) throw new Error('matchSkuRule anchor not found');

const helpers = `    const getStructuredMarketplaceIdentity = (textToSearch) => {
      const raw = String(textToSearch || '');
      if (!raw.includes('|')) return '';

      const parts = raw.split('|').map(part => part.trim()).filter(Boolean);
      if (parts.length < 2) return '';

      const productText = parts[0];
      const identityParts = parts.slice(1);
      const productConcepts = getVariantConcepts(productText);
      const productPackTokens = extractPackTokens(productText);
      const bundleSignature = extractBundleSignature(productText);
      const structuredParts = [...identityParts];

      productPackTokens.forEach(token => {
        const [amount, unit] = token.split(':');
        if (!amount) return;
        structuredParts.push(\`\${amount} \${unit === 'case' ? 'ลัง' : 'ห่อ'}\`);
      });

      productConcepts.forEach(concept => {
        const aliases = VARIANT_CONCEPTS[concept];
        if (Array.isArray(aliases) && aliases[0]) structuredParts.push(aliases[0]);
      });

      if (bundleSignature) {
        const [left, right] = bundleSignature.split('+');
        if (left && right) structuredParts.push(\`\${left}แถม\${right}\`);
      }

      return structuredParts.join(' ').trim();
    };

    const getConfidentStructuredMatch = (textToSearch, rules) => {
      const structuredIdentity = getStructuredMarketplaceIdentity(textToSearch);
      if (!structuredIdentity) return null;

      const candidates = (Array.isArray(rules) ? rules : [])
        .map(rule => scoreSkuRule(rule, structuredIdentity, rules))
        .filter(candidate => Number.isFinite(candidate.score))
        .sort((a, b) => b.score - a.score);
      if (candidates.length === 0) return null;

      const best = candidates[0];
      const runnerUp = candidates[1] || null;
      const runnerUpScore = runnerUp ? runnerUp.score : -Infinity;
      if (best.hardConflict || best.score < 120) return null;

      if (runnerUp && !runnerUp.hardConflict &&
          normalizeOutputIdentity(runnerUp.rule && runnerUp.rule.shortName) !== normalizeOutputIdentity(best.rule && best.rule.shortName) &&
          best.score - runnerUp.score < 20) {
        return { status: 'ambiguous', rule: null, score: best.score, runnerUpScore, reason: 'structured-score-gap' };
      }

      return {
        status: 'matched',
        rule: best.rule,
        score: best.score,
        runnerUpScore,
        reason: \`structured-field-identity:\${best.reason}\`
      };
    };
`;

source = source.replace(matcherAnchor, `${helpers}\n${matcherAnchor}`);

const oldExactReturn = `        if (outputs.size > 1) {
          return { status: 'ambiguous', rule: null, score: 1000, runnerUpScore: 1000, reason: 'exact-conflict' };
        }
        return { status: 'matched', rule: longest[0].rule, score: 1000, runnerUpScore: 0, reason: 'exact-longest' };`;

const newExactReturn = `        if (outputs.size > 1) {
          return { status: 'ambiguous', rule: null, score: 1000, runnerUpScore: 1000, reason: 'exact-conflict' };
        }

        const exactRule = longest[0].rule;
        const structuredMatch = getConfidentStructuredMatch(textToSearch, rules);
        if (structuredMatch && structuredMatch.status === 'ambiguous') return structuredMatch;
        if (structuredMatch && structuredMatch.status === 'matched' &&
            normalizeOutputIdentity(structuredMatch.rule && structuredMatch.rule.shortName) !== normalizeOutputIdentity(exactRule && exactRule.shortName)) {
          return structuredMatch;
        }

        return { status: 'matched', rule: exactRule, score: 1000, runnerUpScore: 0, reason: 'exact-longest' };`;

if (!source.includes(oldExactReturn)) throw new Error('exact-longest return block not found');
source = source.replace(oldExactReturn, newExactReturn);

fs.writeFileSync(file, source);
console.log('Applied TikTok structured Seller SKU identity guard');
