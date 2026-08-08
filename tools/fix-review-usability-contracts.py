from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'{label} anchor not found')
    text = text.replace(old, new, 1)

# Keep the Review completion action visible throughout long batches.
replace_once(
    '    .pm-review-action-wrap { position: sticky; bottom: 12px; z-index: 35; margin-top: 18px; padding-top: 8px; }\n',
    '    .pm-review-action-wrap { position: fixed; left: 225px; right: 20px; bottom: 12px; z-index: 45; margin-top: 0; pointer-events: none; }\n',
    'fixed Review action wrap'
)
replace_once(
    '    .pm-review-action-bar { border: 1px solid #cfdeee; background: rgba(255,255,255,.97); backdrop-filter: blur(12px); border-radius: 15px; box-shadow: 0 14px 35px rgba(7,31,61,.16); padding: 11px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n',
    '    .pm-review-action-bar { max-width: 1470px; margin: 0 auto; pointer-events: auto; border: 1px solid #cfdeee; background: rgba(255,255,255,.97); backdrop-filter: blur(12px); border-radius: 15px; box-shadow: 0 14px 35px rgba(7,31,61,.16); padding: 11px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n',
    'Review action bar sizing'
)
replace_once(
    '    @media (max-width: 1023px) { .pm-active-batch-bar { position: static; padding: 8px 10px; } .pm-active-batch-inner { align-items: flex-start; flex-direction: column; } .pm-review-action-bar { align-items: stretch; flex-direction: column; } }\n',
    '    .pm-review-bottom-space { padding-bottom: 118px; }\n    @media (max-width: 1023px) { .pm-active-batch-bar { position: static; padding: 8px 10px; } .pm-active-batch-inner { align-items: flex-start; flex-direction: column; } .pm-review-action-wrap { left: 10px; right: 10px; bottom: 10px; } .pm-review-action-bar { align-items: stretch; flex-direction: column; } .pm-review-bottom-space { padding-bottom: 168px; } }\n',
    'mobile Review action bar'
)

# Use the actual exception type names emitted by packmaster-exceptions.js.
replace_once(
    "types.some(type => type === 'SKU' || type === 'UNMAPPED')",
    "types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')",
    'Quick Mapping real exception type'
)
replace_once(
    '<option value="ALL">ทุก Exception</option><option value="SKU">SKU</option><option value="QTY">Qty</option><option value="UNMAPPED">Unmapped</option>',
    '<option value="ALL">ทุก Exception</option><option value="REVIEW_QTY">Qty</option><option value="REVIEW_SKU">SKU</option><option value="UNMAPPED">Unmapped</option>',
    'Exception filter real types'
)

# Preserve Exception-first priority in presentation only: Qty > SKU > Unmapped.
old_derived = """      const exceptionOrderIds = new Set(exceptionRows.map(row => row.order?.id).filter(Boolean));
      const ReviewDisplayOrders = exceptionMode ? FilteredOrders.filter(order => exceptionOrderIds.has(order.id)) : FilteredOrders;
"""
new_derived = """      const exceptionOrderIds = new Set(exceptionRows.map(row => row.order?.id).filter(Boolean));
      const exceptionPriorityByOrderId = new Map(exceptionRows.map((row, index) => [row.order?.id, { priority: row.primaryStatus === 'REVIEW_QTY' ? 0 : row.primaryStatus === 'REVIEW_SKU' ? 1 : 2, index }]));
      const ReviewDisplayOrders = exceptionMode ? FilteredOrders.filter(order => exceptionOrderIds.has(order.id)).sort((a, b) => {
        const left = exceptionPriorityByOrderId.get(a.id) || { priority: 99, index: Number.MAX_SAFE_INTEGER };
        const right = exceptionPriorityByOrderId.get(b.id) || { priority: 99, index: Number.MAX_SAFE_INTEGER };
        return left.priority - right.priority || left.index - right.index;
      }) : FilteredOrders;
"""
replace_once(old_derived, new_derived, 'Exception priority derived list')

# Reserve viewport space for the fixed Review action bar.
replace_once(
    '<section data-pm-view="review" className="pm-page pm-page-wide">',
    '<section data-pm-view="review" className="pm-page pm-page-wide pm-review-bottom-space">',
    'Review page bottom space'
)

path.write_text(text, encoding='utf-8')
