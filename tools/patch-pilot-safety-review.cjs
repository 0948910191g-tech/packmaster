const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../index.html');
let html = fs.readFileSync(file, 'utf8');

const replaceOnce = (from, to, label) => {
  if (html.includes(to)) return;
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  html = html.replace(from, to);
};

replaceOnce(
  '        const seed = pilotSafetyApi.getSkuFixSeed(row);',
  '        const seed = pilotSafetyApi.getSkuFixSeed(row, getMatchResult);',
  'safe multi-SKU resolver'
);

replaceOnce(
  '            const updated = batchApi.buildBatchMeta(activeBatch, reviewSummary, { now: new Date() });',
  '            const updated = batchApi.buildBatchMeta(activeBatch, reviewSummary, { printedAt: printBlocked ? null : activeBatch.printedAt, now: new Date() });',
  'invalidate stale completed state'
);

fs.writeFileSync(file, html);
console.log('Safety self-review patch applied');
