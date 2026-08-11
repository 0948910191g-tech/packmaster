import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

assert.doesNotMatch(
  source,
  /\{ReviewDisplayOrders\.map\(\(order,index\)=>/,
  'Label/grid preview must not mount every filtered order at once; use the paginated visible slice'
);
assert.match(
  source,
  /\{visibleReviewDisplayOrders\.map\(\(order,index\)=>/,
  'Label/grid preview should reuse the paginated visible order slice'
);

assert.doesNotMatch(
  source,
  /\{MappedOrders\.map\(\(order\) => \(\s*<div key=\{`render-arena-/s,
  'Idle UI must not mount an export LabelCard for every order'
);
assert.match(
  source,
  /exportRenderOrder\s*&&/,
  'Export rendering should mount only the current order while Save PDF is running'
);

assert.match(
  source,
  /printRenderActive\s*&&/,
  'Print LabelCards should only mount during an active print session'
);

assert.match(
  source,
  /thermalImagePromiseCache\s*=\s*new Map\(\)/,
  'Thermal image conversion should be shared so duplicate LabelCard mounts do not recreate full-size canvases'
);

console.log('PackMaster batch memory hardening regression guard passed');
