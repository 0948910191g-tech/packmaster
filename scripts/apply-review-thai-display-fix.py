from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        '<div className="mt-1 text-xs font-bold leading-5 text-slate-700 break-words">{quickMapState.sourceText}</div>',
        '<div className="mt-1 text-xs font-bold leading-5 text-slate-700 break-words">{reviewKeywordSuggestionsApi?.formatReviewDisplayText ? reviewKeywordSuggestionsApi.formatReviewDisplayText(quickMapState.sourceText) : quickMapState.sourceText}</div>'
    ),
    (
        '<input value={quickMapState.keyword} onChange={(e)=>setQuickMapState(prev=>({ ...prev, keyword:e.target.value }))} className="pm-input" />',
        '<input value={reviewKeywordSuggestionsApi?.formatReviewDisplayText ? reviewKeywordSuggestionsApi.formatReviewDisplayText(quickMapState.keyword) : quickMapState.keyword} onChange={(e)=>setQuickMapState(prev=>({ ...prev, keyword:e.target.value }))} className="pm-input" />'
    ),
    (
        '<span className="text-xs font-black text-slate-800 break-words">{suggestion.value}</span>',
        '<span className="text-xs font-black text-slate-800 break-words">{suggestion.displayValue || suggestion.value}</span>'
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one anchor, found {count}: {old[:100]}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Applied Review Thai display cleanup wiring')
