from pathlib import Path

INDEX = Path('index.html')
TEST = Path('tests/packmaster-smart-matcher.test.mjs')


def replace_between(text, start, end, replacement, label):
    i = text.find(start)
    j = text.find(end, i + len(start)) if i >= 0 else -1
    if i < 0 or j < 0:
        raise SystemExit(f'patch marker not found: {label}')
    return text[:i] + replacement + text[j:]


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise SystemExit(f'expected exactly one match for {label}, found {text.count(old)}')
    return text.replace(old, new, 1)


html = INDEX.read_text(encoding='utf-8')

helper_block = r'''    const normalizeRuleKeyword = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

    const normalizeMatchText = (str) => String(str || '').toLowerCase()
        .replace(/[\u200B-\u200F\uFEFF\xA0]/g, ' ')
        .replace(/[\uF700-\uF71A]/g, '')
        .replace(/\u0E33/g, 'า')
        .replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '')
        .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const COMMON_MATCH_TERMS = new Set(['hoya', 'haku', 'baby', 'wipes', 'wipe', 'ทชชเปยก', 'ผาเปยก']);
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
    const HARD_VARIANT_CONCEPTS = new Set(['VALUE_PACK', 'PLUS', 'EXTRA']);

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

    const scoreSkuRule = (rule, textToSearch, allRules = []) => {
      const searchArea = normalizeMatchText(textToSearch);
      const cleanKw = normalizeMatchText(rule && rule.keyword);
      if (!searchArea || !cleanKw) return { rule, score: -Infinity, hardConflict: true, reason: 'empty' };

      let score = 0;
      let hardConflict = false;
      const reasons = [];
      const ruleTokens = cleanKw.split(' ').filter(Boolean);
      const matchedTokens = ruleTokens.filter(token => searchArea.includes(token));
      const coverage = ruleTokens.length ? matchedTokens.length / ruleTokens.length : 0;

      if (searchArea.includes(cleanKw)) {
        score += 120;
        reasons.push('exact');
      }
      if (coverage === 1) {
        score += 70;
        reasons.push('all-terms');
      } else if (coverage >= 0.75) {
        score += 25;
        reasons.push('partial-terms');
      }

      matchedTokens.forEach(token => {
        if (COMMON_MATCH_TERMS.has(token)) {
          score += 4;
          return;
        }
        const frequency = (Array.isArray(allRules) ? allRules : []).filter(candidate =>
          normalizeMatchText(candidate && candidate.keyword).includes(token)
        ).length;
        score += frequency <= 1 ? 18 : 9;
      });

      const textPacks = extractPackTokens(searchArea);
      const rulePacks = extractPackTokens(cleanKw);
      if (rulePacks.size > 0 && textPacks.size > 0) {
        const packMatch = [...rulePacks].some(token => textPacks.has(token));
        if (packMatch) {
          score += 40;
          reasons.push('pack');
        } else {
          score -= 180;
          hardConflict = true;
          reasons.push('pack-conflict');
        }
      }

      const textConcepts = getVariantConcepts(searchArea);
      const ruleConcepts = getVariantConcepts(cleanKw);
      ruleConcepts.forEach(concept => {
        if (textConcepts.has(concept)) {
          score += 30;
          reasons.push(`concept:${concept}`);
        } else {
          score -= HARD_VARIANT_CONCEPTS.has(concept) ? 160 : 35;
          if (HARD_VARIANT_CONCEPTS.has(concept)) hardConflict = true;
          reasons.push(`missing:${concept}`);
        }
      });

      HARD_VARIANT_CONCEPTS.forEach(concept => {
        if (textConcepts.has(concept) && !ruleConcepts.has(concept)) {
          score -= 180;
          hardConflict = true;
          reasons.push(`unexpected:${concept}`);
        }
      });

      const numericRuleTokens = ruleTokens.filter(token => /^\d{1,4}$/.test(token));
      if (numericRuleTokens.some(token => searchArea.includes(token)) && [...ruleConcepts].every(concept => textConcepts.has(concept))) {
        score += 25;
        reasons.push('concept-number');
      }

      return { rule, score, hardConflict, reason: reasons.join(',') || 'weak' };
    };

    const matchSkuRule = (textToSearch, rules) => {
      const candidates = (Array.isArray(rules) ? rules : [])
        .map(rule => scoreSkuRule(rule, textToSearch, rules))
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

      if (runnerUp && !runnerUp.hardConflict && best.score - runnerUp.score < 20) {
        return { status: 'ambiguous', rule: null, score: best.score, runnerUpScore, reason: 'score-gap' };
      }

      return { status: 'matched', rule: best.rule, score: best.score, runnerUpScore, reason: best.reason };
    };

    const parseExplicitTotalQty = (fullText, platform) => {
      const text = String(fullText || '');
      if (platform === 'TIKTOK') {
        const match = text.match(/Qty\s*Total\s*:\s*(\d{1,4})/i);
        return match ? parseInt(match[1], 10) : null;
      }
      const shopeeFooter = text.match(/Shopee\s*Order\s*No\.?\s*[A-Z0-9]+\s+(\d{1,4})\s*$/i);
      return shopeeFooter ? parseInt(shopeeFooter[1], 10) : null;
    };

    const toPositionedPdfItems = (textContent) => (textContent && Array.isArray(textContent.items) ? textContent.items : [])
      .map((item, index) => ({
        text: String(item && item.str || '').trim(),
        x: Number(item && item.transform && item.transform[4]) || 0,
        y: Number(item && item.transform && item.transform[5]) || 0,
        index
      }))
      .filter(item => item.text);

    const parseTikTokPositionedItems = (rawItems, declaredTotalQty = null) => {
      const entries = (Array.isArray(rawItems) ? rawItems : []).map((item, index) => ({
        text: String(item && (item.text ?? item.str) || '').trim(),
        x: Number(item && (item.x ?? (item.transform && item.transform[4]))) || 0,
        y: Number(item && (item.y ?? (item.transform && item.transform[5]))) || 0,
        index: Number.isFinite(item && item.index) ? item.index : index
      })).filter(item => item.text);

      const hasTableSignal = normalizeMatchText(entries.map(item => item.text).join(' ')).includes('product name');
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

      if (!header) {
        return { items: [], declaredTotalQty, parserWarning: hasTableSignal, reason: hasTableSignal ? 'header-not-found' : 'no-table' };
      }

      const qtyMarkers = entries.filter(item =>
        /^\d{1,4}$/.test(item.text) && Math.abs(item.x - header.qtyX) <= 14 && Math.abs(item.y - header.y) > 5
      );
      if (qtyMarkers.length === 0) {
        return { items: [], declaredTotalQty, parserWarning: true, reason: 'qty-column-empty' };
      }

      const nearest = [...qtyMarkers].sort((a, b) => Math.abs(a.y - header.y) - Math.abs(b.y - header.y))[0];
      const direction = Math.sign(nearest.y - header.y) || 1;
      const distance = item => (item.y - header.y) * direction;
      const markers = qtyMarkers
        .filter(item => distance(item) > 4)
        .sort((a, b) => distance(a) - distance(b));

      const items = [];
      let parserWarning = false;
      markers.forEach((marker, markerIndex) => {
        const currentDistance = distance(marker);
        const previousDistance = markerIndex > 0 ? distance(markers[markerIndex - 1]) : 4;
        const nextDistance = markerIndex < markers.length - 1 ? distance(markers[markerIndex + 1]) : Infinity;
        const lower = markerIndex === 0 ? 4 : (previousDistance + currentDistance) / 2;
        const upper = Number.isFinite(nextDistance) ? (currentDistance + nextDistance) / 2 : Infinity;

        const rowEntries = entries.filter(item => {
          const d = distance(item);
          return d >= lower && d < upper && item.index !== marker.index;
        });
        const productParts = rowEntries.filter(item => item.x < header.firstSkuX - 2).sort((a, b) => a.index - b.index);
        const skuParts = rowEntries.filter(item => item.x >= header.firstSkuX - 2 && item.x < header.sellerX - 2).sort((a, b) => a.index - b.index);
        const sellerParts = rowEntries.filter(item => item.x >= header.sellerX - 2 && item.x < header.qtyX - 5).sort((a, b) => a.index - b.index);
        const productText = productParts.map(item => item.text).join(' ').trim();
        const skuText = skuParts.map(item => item.text).join(' ').trim();
        const sellerText = sellerParts.map(item => item.text).join(' ').trim();
        const text = [productText, skuText, sellerText].filter(Boolean).join(' | ');
        const qty = parseInt(marker.text, 10);

        if (!text || !Number.isFinite(qty) || qty < 1) {
          parserWarning = true;
          return;
        }
        items.push({ text, qty });
      });

      if (items.length !== markers.length) parserWarning = true;
      return { items, declaredTotalQty, parserWarning, reason: parserWarning ? 'partial-row-parse' : 'positioned-columns' };
    };

    const hasQtyWarning = (items, declaredTotalQty, parserWarning = false) => {
      if (parserWarning) return true;
      if (!Number.isFinite(declaredTotalQty)) return false;
      const sum = (Array.isArray(items) ? items : []).reduce((total, item) => total + (parseInt(item && item.qty, 10) || 0), 0);
      return sum !== declaredTotalQty;
    };

    const sanitizeSkuRule = (rule, fallbackId) => {
      if (!rule || typeof rule !== 'object') return null;
      if (typeof rule.keyword !== 'string' || typeof rule.shortName !== 'string') return null;

      const keyword = rule.keyword.trim();
      const shortName = rule.shortName.trim();
      if (!keyword || !shortName) return null;

      return { id: rule.id ?? fallbackId, keyword, shortName };
    };

    const getAggregatedShortName = (baseName, qty) => {
      const cleanBaseName = String(baseName || '').trim().replace(/\u00A0/g, ' ');
      const normalizedQty = Math.max(1, parseInt(qty, 10) || 1);
      if (normalizedQty <= 1) return cleanBaseName;

      const numberMatches = Array.from(cleanBaseName.matchAll(/\d+/g));
      if (numberMatches.length === 0) return cleanBaseName;

      const target = numberMatches[numberMatches.length - 1];
      const perItemQty = parseInt(target[0], 10);
      if (!Number.isFinite(perItemQty)) return cleanBaseName;

      const aggregatedQty = perItemQty * normalizedQty;
      return `${cleanBaseName.substring(0, target.index)}${aggregatedQty}${cleanBaseName.substring(target.index + target[0].length)}`;
    };

'''
html = replace_between(
    html,
    '    const normalizeRuleKeyword =',
    '    const waitForLabelRender =',
    helper_block,
    'smart helper block'
)

matcher_block = r'''      const getMatchResult = useCallback((textToSearch) => {
        return matchSkuRule(textToSearch, skuRules);
      }, [skuRules]);

'''
html = replace_between(
    html,
    '      const getMatchedRule = useCallback(',
    '      const handleFileUpload =',
    matcher_block,
    'matcher callback'
)

html = replace_once(
    html,
    "              const textContent = await page.getTextContent();\n              const fullText = textContent.items.map(item => item.str).join(' ');",
    "              const textContent = await page.getTextContent();\n              const fullText = textContent.items.map(item => item.str).join(' ');\n              const positionedItems = toPositionedPdfItems(textContent);",
    'positioned pdf items'
)

html = replace_once(
    html,
    "              let platform = 'SHOPEE';\n              if (fullText.match(/Order\\s*ID/i) || fullText.match(/In\\s*transit/i) || fullText.match(/TikTok/i)) platform = 'TIKTOK';\n\n              let zone = fullText;",
    "              let platform = 'SHOPEE';\n              if (fullText.match(/Order\\s*ID/i) || fullText.match(/In\\s*transit/i) || fullText.match(/TikTok/i)) platform = 'TIKTOK';\n              const declaredTotalQty = parseExplicitTotalQty(fullText, platform);\n              let parserWarning = false;\n\n              let zone = fullText;",
    'declared total qty'
)

html = replace_once(
    html,
    "              let parsedItems = [];\n\n              if (platform === 'SHOPEE') {",
    "              let parsedItems = [];\n\n              if (platform === 'TIKTOK') {\n                  const tikTokResult = parseTikTokPositionedItems(positionedItems, declaredTotalQty);\n                  parsedItems = tikTokResult.items;\n                  parserWarning = tikTokResult.parserWarning;\n              }\n\n              if (platform === 'SHOPEE') {",
    'tiktok positioned parser'
)

html = replace_once(
    html,
    "              if (parsedItems.length === 0) {",
    "              if (parsedItems.length === 0 && platform !== 'TIKTOK') {",
    'disable unsafe TikTok fallback'
)

html = replace_between(
    html,
    "              if (parsedItems.length === 1 && platform !== 'TIKTOK') {",
    '              const trackingMatch =',
    '',
    'remove qty overwrite'
)

html = replace_once(
    html,
    "                          existingOrder.parsedItems.push(...parsedItems);\n                      }",
    "                          existingOrder.parsedItems.push(...parsedItems);\n                      }\n                      if (Number.isFinite(declaredTotalQty)) existingOrder.declaredTotalQty = declaredTotalQty;\n                      existingOrder.parserWarning = Boolean(existingOrder.parserWarning || parserWarning);",
    'merge continuation safety metadata'
)

html = replace_once(
    html,
    "                          orderId: currentOrderId,\n                          isContinuation: true ",
    "                          orderId: currentOrderId,\n                          declaredTotalQty: null,\n                          parserWarning: false,\n                          isContinuation: true ",
    'continuation metadata'
)

html = replace_once(
    html,
    "                  platform,\n                  orderId: currentOrderId \n              });",
    "                  platform,\n                  orderId: currentOrderId,\n                  declaredTotalQty,\n                  parserWarning\n              });",
    'new order metadata'
)

mapped_block = r'''      const MappedOrders = useMemo(() => orders.map(o => {
        if (o.parsedItems.length === 0) {
            if (o.isContinuation) return { ...o, displayItems: [], originalQty: 0, qtyWarning: false };
            const failedItems = o.parserWarning ? ['⚠️ ตรวจสอบ SKU', '⚠️ ตรวจสอบ Qty'] : [];
            return { ...o, displayItems: failedItems, originalQty: 0, qtyWarning: Boolean(o.parserWarning) };
        }

        const skuMap = new Map();
        let hasUnmatched = false;
        let hasAmbiguous = false;

        o.parsedItems.forEach(item => {
            const match = getMatchResult(item.text);
            if (match.status === 'matched' && match.rule) {
                const baseName = match.rule.shortName.trim().replace(/\u00A0/g, ' ');
                const currentQty = skuMap.get(baseName) || 0;
                skuMap.set(baseName, currentQty + item.qty);
            } else if (match.status === 'ambiguous') {
                hasAmbiguous = true;
            } else {
                hasUnmatched = true;
            }
        });

        const finalDisplayItems = [];
        skuMap.forEach((qty, baseName) => {
            finalDisplayItems.push(`• ${getAggregatedShortName(baseName, qty)}`);
        });

        if (hasAmbiguous || o.parserWarning) finalDisplayItems.push('• ⚠️ ตรวจสอบ SKU');
        if (hasUnmatched) finalDisplayItems.push('• ยังไม่ตั้งชื่อ');

        const totalQty = o.parsedItems.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);
        const qtyWarning = hasQtyWarning(o.parsedItems, o.declaredTotalQty, o.parserWarning);
        if (qtyWarning) finalDisplayItems.push('• ⚠️ ตรวจสอบ Qty');

        if (finalDisplayItems.length === 0) {
            finalDisplayItems.push('ยังไม่ตั้งชื่อ (เพิ่มกฎ SKU)');
        }
        if (finalDisplayItems.length === 1 && finalDisplayItems[0].startsWith('• ')) {
            finalDisplayItems[0] = finalDisplayItems[0].substring(2);
        }

        return { ...o, displayItems: finalDisplayItems, originalQty: totalQty, qtyWarning };
      }), [orders, getMatchResult]);

'''
html = replace_between(
    html,
    '      const MappedOrders = useMemo(() => orders.map(o => {',
    '      const handleExportPDF =',
    mapped_block,
    'mapped orders'
)

test_result_block = r'''      const testResult = useMemo(() => {
        if (!testInput) return null;
        const match = getMatchResult(testInput);
        const totalQty = parseInt(testQty, 10) || 1;
        if (match.status === 'ambiguous') return '⚠️ ตรวจสอบ SKU';
        if (match.status !== 'matched' || !match.rule) return 'ไม่พบคีย์เวิร์ด';
        const baseName = match.rule.shortName.trim().replace(/\u00A0/g, ' ');
        return getAggregatedShortName(baseName, totalQty);
      }, [testInput, testQty, getMatchResult]);

'''
html = replace_between(
    html,
    '      const testResult = useMemo(() => {',
    '      return (',
    test_result_block,
    'test result smart match'
)

html = replace_once(
    html,
    "{testInput ? (testResult !== 'ยังไม่ตั้งชื่อ (เพิ่มกฎ SKU)' && testResult !== 'ไม่พบคีย์เวิร์ด' ?",
    "{testInput ? (testResult !== 'ยังไม่ตั้งชื่อ (เพิ่มกฎ SKU)' && testResult !== 'ไม่พบคีย์เวิร์ด' && testResult !== '⚠️ ตรวจสอบ SKU' ?",
    'settings warning display'
)

html = replace_once(
    html,
    "<span className=\"text-sm font-bold text-red-500 bg-red-50 px-4 py-2 rounded-xl\">ไม่พบคีย์เวิร์ด</span>",
    "<span className=\"text-sm font-bold text-red-500 bg-red-50 px-4 py-2 rounded-xl\">{testResult}</span>",
    'settings warning text'
)

html = replace_once(
    html,
    "                                {order.originalQty > 0 ? order.originalQty : '-'}\n                              </td>",
    "                                {order.originalQty > 0 ? order.originalQty : '-'}\n                                {order.qtyWarning && <div className=\"mt-1 text-[10px] font-black text-red-500\">⚠️ ตรวจสอบ Qty</div>}\n                              </td>",
    'preview qty warning'
)

html = replace_once(
    html,
    "${text.includes('ยังไม่ตั้งชื่อ') ? 'text-red-500 bg-red-50' : 'text-blue-900 bg-blue-100/50'}",
    "${text.includes('ยังไม่ตั้งชื่อ') || text.includes('ตรวจสอบ') ? 'text-red-500 bg-red-50' : 'text-blue-900 bg-blue-100/50'}",
    'preview sku warning style'
)

INDEX.write_text(html, encoding='utf-8')

# The score-gap regression should use two equally strong candidates; the safety gate must refuse to guess.
test = TEST.read_text(encoding='utf-8')
test = replace_once(
    test,
    "  { id: 'a', keyword: 'HOYA baby 5', shortName: 'A5' },\n  { id: 'b', keyword: 'HOYA wipes 5', shortName: 'B5' }",
    "  { id: 'a', keyword: 'HOYA baby wipes 5', shortName: 'A5' },\n  { id: 'b', keyword: 'HOYA baby wipes 5', shortName: 'B5' }",
    'ambiguous regression fixture'
)
TEST.write_text(test, encoding='utf-8')

print('Smart Matcher patch applied successfully')
