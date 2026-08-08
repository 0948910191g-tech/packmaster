from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

old = "        const lower = currentDistance - 6;"
new = "        const lower = currentDistance - 16;"

count = text.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly one Shopee lower-bound target, found {count}')

text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('Applied Shopee row baseline fix')
