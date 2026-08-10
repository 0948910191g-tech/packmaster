import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /for \(const \{ file, pdf \} of pdfDocuments\)/, 'PDF processing must retain the source file reference');
assert.match(html, /sourceFileName:\s*file\.name/, 'new orders must record the source PDF filename');
assert.match(html, /sourcePage:\s*i/, 'new orders must record the 1-based PDF page');
assert.match(html, /data-pm-source-reference/, 'Review/Quick Mapping must expose source traceability');
assert.match(html, /order\.sourceFileName/, 'Review must display/search source filename');
assert.match(html, /order\.sourcePage/, 'Review must display source page');

const matcherBlockStart = html.indexOf('const getMatchResult');
const uploadStart = html.indexOf('const handleFileUpload');
const matcherBlock = html.slice(matcherBlockStart, uploadStart);
assert.doesNotMatch(matcherBlock, /sourceFileName|sourcePage/, 'source metadata must never enter matcher input');

console.log('PackMaster source traceability contract passed');
