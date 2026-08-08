from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

helper = r'''    const parseShopeePositionedItems = (rawItems, declaredTotalQty = null) => {
      const entries = (Array.isArray(rawItems) ? rawItems : []).map((item, index) => ({
        text: String(item && (item.text ?? item.str) || '').trim(),
        x: Number(item && (item.x ?? (item.transform && item.transform[4]))) || 0,
        y: Number(item && (item.y ?? (item.transform && item.transform[5]))) || 0,
        index: Number.isFinite(item && item.index) ? item.index : index
      })).filter(item => item.text);

      const hashHeaders = entries.filter(item => normalizeMatchText(item.text) === '#');
      let header = null;

      for (const hashHeader of hashHeaders) {
        const sameLine = entries.filter(item => Math.abs(item.y - hashHeader.y) <= 6).sort((a, b) => a.x - b.x);
        const lineText = normalizeMatchText(sameLine.map(item => item.text).join(' '));
        if (!lineText.includes('ชอสนคา') || !lineText.includes('จานวน')) continue;

        const nonHash = sameLine.filter(item => item.index !== hashHeader.index);
        const productHeader = nonHash.find(item => normalizeMatchText(item.text).includes('ชอสนคา')) || nonHash[0];
        const qtyHeader = [...nonHash].reverse().find(item => normalizeMatchText(item.text).includes('จานวน')) || nonHash[nonHash.length - 1];
        if (!productHeader || !qtyHeader || qtyHeader.x <= productHeader.x) continue;

        header = {
          y: hashHeader.y,
          rowX: hashHeader.x,
          productX: productHeader.x,
          qtyX: qtyHeader.x
        };
        break;
      }

      const hasTableSignal = entries.some(item => normalizeMatchText(item.text) === '#') &&
        normalizeMatchText(entries.map(item => item.text).join(' ')).includes('ชอสนคา');

      if (!header) {
        return { items: [], declaredTotalQty, parserWarning: hasTableSignal, reason: hasTableSignal ? 'header-not-found' : 'no-table' };
      }

      const rowCandidates = entries.filter(item =>
        /^\d{1,2}$/.test(item.text) && Math.abs(item.x - header.rowX) <= 16 && Math.abs(item.y - header.y) > 5
      );
      if (rowCandidates.length === 0) {
        return { items: [], declaredTotalQty, parserWarning: true, reason: 'row-index-empty' };
      }

      const nearest = [...rowCandidates].sort((a, b) => Math.abs(a.y - header.y) - Math.abs(b.y - header.y))[0];
      const direction = Math.sign(nearest.y - header.y) || 1;
      const distance = item => (item.y - header.y) * direction;
      const sortedRows = rowCandidates.filter(item => distance(item) > 4).sort((a, b) => distance(a) - distance(b));
      const rowMarkers = [];
      let expected = 1;
      for (const candidate of sortedRows) {
        const rowNumber = parseInt(candidate.text, 10);
        if (rowNumber === expected) {
          rowMarkers.push(candidate);
          expected += 1;
        }
      }

      if (rowMarkers.length === 0) {
        return { items: [], declaredTotalQty, parserWarning: true, reason: 'row-sequence-empty' };
      }

      const footerDistances = entries
        .filter(item => {
          const normalized = normalizeMatchText(item.text);
          return normalized.includes('shopee order') || normalized.includes('powered by');
        })
        .map(distance)
        .filter(value => value > distance(rowMarkers[rowMarkers.length - 1]));
      const footerDistance = footerDistances.length ? Math.min(...footerDistances) : Infinity;

      const items = [];
      let parserWarning = false;

      rowMarkers.forEach((rowMarker, rowIndex) => {
        const currentDistance = distance(rowMarker);
        const nextDistance = rowIndex < rowMarkers.length - 1 ? distance(rowMarkers[rowIndex + 1]) : footerDistance;
        const lower = currentDistance - 6;
        const upper = Number.isFinite(nextDistance) ? nextDistance - 2 : Infinity;
        const rowEntries = entries.filter(item => {
          const d = distance(item);
          return d >= lower && d < upper && item.index !== rowMarker.index;
        });

        const qtyCandidates = rowEntries.filter(item =>
          /^\d{1,4}$/.test(item.text) && Math.abs(item.x - header.qtyX) <= 22
        ).sort((a, b) => {
          const aDistance = Math.abs(distance(a) - currentDistance) + Math.abs(a.x - header.qtyX) / 10;
          const bDistance = Math.abs(distance(b) - currentDistance) + Math.abs(b.x - header.qtyX) / 10;
          return aDistance - bDistance;
        });
        const qtyItem = qtyCandidates[0] || null;
        const qty = qtyItem ? parseInt(qtyItem.text, 10) : NaN;

        const productParts = rowEntries
          .filter(item => item.index !== (qtyItem && qtyItem.index) && item.x >= header.productX - 6 && item.x < header.qtyX - 8)
          .sort((a, b) => distance(a) - distance(b) || a.x - b.x || a.index - b.index);
        const productText = productParts.map(item => item.text).join(' ').trim();

        if (!productText || !Number.isFinite(qty) || qty < 1) {
          parserWarning = true;
          return;
        }
        items.push({ text: productText, qty });
      });

      if (items.length !== rowMarkers.length) parserWarning = true;
      return { items, declaredTotalQty, parserWarning, reason: parserWarning ? 'partial-row-parse' : 'positioned-columns' };
    };

'''

if '    const parseShopeePositionedItems = ' not in text:
    marker = '    const hasQtyWarning = '
    if marker not in text:
        raise SystemExit('hasQtyWarning marker not found')
    text = text.replace(marker, helper + marker, 1)

if 'const shopeePositionedResult = parseShopeePositionedItems' not in text:
    start_marker = "              if (platform === 'SHOPEE') {\n"
    start_pos = text.find(start_marker)
    if start_pos < 0:
        raise SystemExit('Shopee parser start not found')

    start_replacement = start_marker + r'''                  const shopeePositionedResult = parseShopeePositionedItems(positionedItems, declaredTotalQty);
                  if (shopeePositionedResult.items.length > 0 || shopeePositionedResult.parserWarning) {
                      parsedItems = shopeePositionedResult.items;
                      parserWarning = shopeePositionedResult.parserWarning;
                  } else {
'''
    text = text[:start_pos] + text[start_pos:].replace(start_marker, start_replacement, 1)

    fallback_marker = "              }\n\n              if (parsedItems.length === 0 && platform !== 'TIKTOK') {"
    fallback_pos = text.find(fallback_marker, start_pos)
    if fallback_pos < 0:
        raise SystemExit('Shopee parser end/fallback marker not found')
    fallback_replacement = "                  }\n              }\n\n              if (parsedItems.length === 0 && platform !== 'TIKTOK' && !parserWarning) {"
    text = text[:fallback_pos] + text[fallback_pos:].replace(fallback_marker, fallback_replacement, 1)

path.write_text(text, encoding='utf-8')
