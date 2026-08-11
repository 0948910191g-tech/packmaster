import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

assert.match(
  source,
  /const shouldBakeThermal = Boolean\(thermalMode && isExport\);/,
  'Normal Review preview must not bake a second full-size thermal JPEG; only Print/Save PDF should bake thermal pixels'
);

assert.match(
  source,
  /if \(!shouldBakeThermal\) \{[\s\S]*?setDisplayImg\(order\.pdfImage\);[\s\S]*?return;/,
  'Normal preview should reuse the original page image instead of allocating a duplicate thermal data URL'
);

assert.match(
  source,
  /filter: thermalMode && !isExport \? 'grayscale\(100%\) brightness\(80%\) contrast\(200%\)' : 'none'/,
  'Thermal Review preview should keep the same visual filter using CSS without allocating another image'
);

assert.match(
  source,
  /loading=\{isExport \? 'eager' : 'lazy'\}/,
  'Off-screen Review label images should be eligible for lazy decode on lower-spec PCs'
);

console.log('PackMaster active preview memory guard passed');
