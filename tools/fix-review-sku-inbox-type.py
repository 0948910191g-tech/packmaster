from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')
old = "(currentException.types||[]).some(type=>type==='SKU'||type==='UNMAPPED')"
new = "(currentException.types||[]).some(type=>type==='REVIEW_SKU'||type==='UNMAPPED')"
if old not in text:
    raise SystemExit('Exception Inbox SKU action anchor not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
