from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

needle = "    const matchSkuRule = (textToSearch, rules) => {"
helper = "    const normalizeOutputIdentity = (value) => normalizeMatchText(value).replace(/\\s+/g, '');\n\n"
if 'const normalizeOutputIdentity = ' not in text:
    if needle not in text:
        raise SystemExit('matchSkuRule marker not found')
    text = text.replace(needle, helper + needle, 1)

old_exact = "        const outputs = new Set(longest.map(entry => String(entry.rule && entry.rule.shortName || '').trim()));"
new_exact = "        const outputs = new Set(longest.map(entry => normalizeOutputIdentity(entry.rule && entry.rule.shortName)));"
if old_exact in text:
    text = text.replace(old_exact, new_exact, 1)
elif new_exact not in text:
    raise SystemExit('exact output comparison not found')

old_runner = "          String(runnerUp.rule && runnerUp.rule.shortName || '').trim() !== String(best.rule && best.rule.shortName || '').trim() &&"
new_runner = "          normalizeOutputIdentity(runnerUp.rule && runnerUp.rule.shortName) !== normalizeOutputIdentity(best.rule && best.rule.shortName) &&"
if old_runner in text:
    text = text.replace(old_runner, new_runner, 1)
elif new_runner not in text:
    raise SystemExit('runner-up output comparison not found')

path.write_text(text, encoding='utf-8')
