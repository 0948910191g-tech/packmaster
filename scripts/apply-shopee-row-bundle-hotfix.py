from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

# 1) Add bundle signature helpers before scoring.
marker = "    const scoreSkuRule = (rule, textToSearch, allRules = []) => {"
insert = """    const extractBundleSignature = (value) => {
      const compact = normalizeMatchText(value).replace(/\\s+/g, '');
      const match = compact.match(/(\\d{1,3})(?:แถม|free)(\\d{1,3})/i);
      return match ? `${parseInt(match[1], 10)}+${parseInt(match[2], 10)}` : null;
    };

    const bundleCompatible = (ruleText, searchText) => {
      const ruleBundle = extractBundleSignature(ruleText);
      const textBundle = extractBundleSignature(searchText);
      if (textBundle) return ruleBundle === textBundle;
      return !ruleBundle;
    };

""" + marker
if text.count(marker) != 1:
    raise SystemExit(f'Expected one scoreSkuRule marker, found {text.count(marker)}')
text = text.replace(marker, insert, 1)

# 2) Bundle identity is a hard discriminator during scoring.
old = """      const textConcepts = getVariantConcepts(searchArea);
      const ruleConcepts = getVariantConcepts(cleanKw);

      if (searchArea.includes(cleanKw)) {"""
new = """      const textConcepts = getVariantConcepts(searchArea);
      const ruleConcepts = getVariantConcepts(cleanKw);
      const textBundle = extractBundleSignature(searchArea);
      const ruleBundle = extractBundleSignature(cleanKw);

      if (textBundle || ruleBundle) {
        if (textBundle && ruleBundle === textBundle) {
          score += 180;
          reasons.push(`bundle:${textBundle}`);
        } else {
          score -= 240;
          hardConflict = true;
          reasons.push(textBundle ? 'bundle-mismatch' : 'missing-bundle');
        }
      }

      if (searchArea.includes(cleanKw)) {"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one scoring insertion target, found {text.count(old)}')
text = text.replace(old, new, 1)

# 3) Exact-first must not let a generic rule bypass a bundle conflict.
old = "        .filter(entry => searchArea.includes(entry.cleanKw))"
new = "        .filter(entry => searchArea.includes(entry.cleanKw) && bundleCompatible(entry.cleanKw, searchArea))"
if text.count(old) != 1:
    raise SystemExit(f'Expected one exact-match filter target, found {text.count(old)}')
text = text.replace(old, new, 1)

# 4) Shopee rows get non-overlapping midpoint boundaries.
old = """        const currentDistance = distance(rowMarker);
        const nextDistance = rowIndex < rowMarkers.length - 1 ? distance(rowMarkers[rowIndex + 1]) : footerDistance;
        const lower = currentDistance - 16;
        const upper = Number.isFinite(nextDistance) ? nextDistance - 2 : Infinity;"""
new = """        const currentDistance = distance(rowMarker);
        const previousDistance = rowIndex > 0 ? distance(rowMarkers[rowIndex - 1]) : 4;
        const nextDistance = rowIndex < rowMarkers.length - 1 ? distance(rowMarkers[rowIndex + 1]) : footerDistance;
        const lower = rowIndex === 0 ? 4 : (previousDistance + currentDistance) / 2;
        const upper = rowIndex < rowMarkers.length - 1
          ? (currentDistance + nextDistance) / 2
          : (Number.isFinite(footerDistance) ? footerDistance : Infinity);"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one Shopee boundary target, found {text.count(old)}')
text = text.replace(old, new, 1)

# 5) Bundle short names aggregate every bundle component while preserving old last-number behavior otherwise.
start = text.index("    const getAggregatedShortName = (baseName, qty) => {")
end = text.index("    const waitForLabelRender", start)
old_func = text[start:end]
new_func = """    const getAggregatedShortName = (baseName, qty, sourceKeyword = '') => {
      const cleanBaseName = String(baseName || '').trim().replace(/\\u00A0/g, ' ');
      const normalizedQty = Math.max(1, parseInt(qty, 10) || 1);
      if (normalizedQty <= 1) return cleanBaseName;

      const numberMatches = Array.from(cleanBaseName.matchAll(/\\d+/g));
      if (numberMatches.length === 0) return cleanBaseName;

      const bundleSignature = extractBundleSignature(sourceKeyword);
      if (bundleSignature) {
        const componentQtys = bundleSignature.split('+').map(value => parseInt(value, 10)).filter(Number.isFinite);
        if (componentQtys.length > 0 && numberMatches.length >= componentQtys.length) {
          const targets = numberMatches.slice(-componentQtys.length);
          const aligned = targets.every((match, index) => parseInt(match[0], 10) === componentQtys[index]);
          if (aligned) {
            let result = cleanBaseName;
            for (let index = targets.length - 1; index >= 0; index--) {
              const target = targets[index];
              const replacement = String(componentQtys[index] * normalizedQty);
              result = `${result.substring(0, target.index)}${replacement}${result.substring(target.index + target[0].length)}`;
            }
            return result;
          }
        }
      }

      const target = numberMatches[numberMatches.length - 1];
      const perItemQty = parseInt(target[0], 10);
      if (!Number.isFinite(perItemQty)) return cleanBaseName;

      const aggregatedQty = perItemQty * normalizedQty;
      return `${cleanBaseName.substring(0, target.index)}${aggregatedQty}${cleanBaseName.substring(target.index + target[0].length)}`;
    };

"""
text = text[:start] + new_func + text[end:]

# 6) Preserve the matched rule keyword through order aggregation so bundle-aware quantity math is used in production.
old = """                const baseName = match.rule.shortName.trim().replace(/\\u00A0/g, ' ');
                const currentQty = skuMap.get(baseName) || 0;
                skuMap.set(baseName, currentQty + item.qty);"""
new = """                const baseName = match.rule.shortName.trim().replace(/\\u00A0/g, ' ');
                const current = skuMap.get(baseName) || { qty: 0, sourceKeyword: match.rule.keyword || '' };
                skuMap.set(baseName, {
                    qty: current.qty + item.qty,
                    sourceKeyword: current.sourceKeyword || match.rule.keyword || ''
                });"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one skuMap aggregation target, found {text.count(old)}')
text = text.replace(old, new, 1)

old = """        skuMap.forEach((qty, baseName) => {
            finalDisplayItems.push(`• ${getAggregatedShortName(baseName, qty)}`);
        });"""
new = """        skuMap.forEach((entry, baseName) => {
            finalDisplayItems.push(`• ${getAggregatedShortName(baseName, entry.qty, entry.sourceKeyword)}`);
        });"""
if text.count(old) != 1:
    raise SystemExit(f'Expected one display aggregation target, found {text.count(old)}')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Applied Shopee row isolation + bundle aggregation hotfix')
