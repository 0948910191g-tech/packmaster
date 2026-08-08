from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')
old = '    .pm-review-bottom-space { padding-bottom: 118px; }\n'
new = '    .pm-review-bottom-space { padding-bottom: 118px; animation: none; }\n'
if old not in text:
    raise SystemExit('Review bottom-space CSS anchor not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
