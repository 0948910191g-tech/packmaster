import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

assert.doesNotMatch(
  source,
  /let pdfDocuments = \[\]/,
  'Upload must not keep every opened PDF.js document alive until the whole import finishes'
);

assert.match(
  source,
  /let pdfManifests = \[\]/,
  'Upload should keep only lightweight file/page metadata between the count and render passes'
);

assert.match(
  source,
  /await pdf\.destroy\(\)/,
  'Each temporary PDF.js document should be explicitly destroyed when its pass is complete'
);

assert.match(
  source,
  /page\.cleanup\(\)/,
  'Each rendered PDF page should release PDF.js page resources after the page image is captured'
);

assert.match(
  source,
  /const pdfImage = canvas\.toDataURL\('image\/jpeg', 0\.9\);[\s\S]*?canvas\.width = 1;[\s\S]*?canvas\.height = 1;/,
  'The temporary render canvas should be released immediately after creating the persisted page image'
);

assert.match(source, /page\.getViewport\(\{ scale: 2\.5 \}\)/, 'Phase 2 memory work must preserve current page render resolution');
assert.match(source, /canvas\.toDataURL\('image\/jpeg', 0\.9\)/, 'Phase 2 memory work must preserve current JPEG quality');

console.log('PackMaster PDF import memory guard passed');
