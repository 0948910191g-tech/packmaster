import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

// Shared layout tokens / shell contract.
assert.match(html, /--pm-header-h:\s*82px/, 'V4 must define desktop header height token');
assert.match(html, /--pm-header-h-mobile:\s*68px/, 'V4 must define mobile header height token');
assert.match(html, /--pm-page-pad-x:/, 'V4 must define shared page horizontal padding');
assert.match(html, /--pm-section-gap:/, 'V4 must define shared section gap');
assert.match(html, /--pm-content-wide:/, 'V4 must define shared wide content width');
assert.match(html, /\.pm-page-actions\s*\{/, 'V4 must provide a shared page action group');
assert.match(html, /\.pm-section-stack\s*\{/, 'V4 must provide shared vertical section rhythm');

// Only the global command header should own the top sticky behavior.
assert.match(html, /\.pm-command-header\s*\{[^}]*position:\s*sticky/s, 'Global command header must remain sticky');
assert.match(html, /\.pm-active-batch-bar\s*\{[^}]*position:\s*static/s, 'Active Batch context must be normal document flow');
assert.doesNotMatch(html, /\.pm-active-batch-bar\s*\{[^}]*position:\s*sticky/s, 'Active Batch context must not overlay page content');

// Review completion actions must not cover label cards while scrolling.
assert.match(html, /\.pm-review-action-wrap\s*\{[^}]*position:\s*static/s, 'Review action dock must be normal document flow');
assert.doesNotMatch(html, /\.pm-review-action-wrap\s*\{[^}]*position:\s*fixed/s, 'Review action dock must not be fixed over content');
assert.doesNotMatch(html, /className="pm-page pm-page-wide pm-review-bottom-space"/, 'Review page must not require fixed-dock bottom compensation');

// SKU page retains the intended operational two-column layout.
assert.match(html, /data-pm-sku-layout/, 'SKU page must expose the V4 two-column layout marker');
assert.match(html, /\.pm-sku-layout\s*\{[^}]*grid-template-columns:\s*minmax\(320px,\s*360px\)\s+minmax\(0,\s*1fr\)/s, 'Desktop SKU layout must use a bounded editor column plus flexible library');

// Review flow remains structurally identifiable for browser smoke.
assert.match(html, /data-pm-review-layout/, 'Review page must expose the V4 layout marker');
assert.match(html, /data-pm-review-action-dock/, 'Review completion action dock must expose a stable marker');

// Output safety now uses explicit scope; layout must not collapse back to implicit filtered printing.
assert.match(html, /for \(let i = 0; i < ordersToExport\.length; i\+\+\)/, 'Save PDF must iterate explicit selected output scope');
assert.match(html, /PrintScopedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Browser print must render explicit selected output scope');
assert.match(html, /selectPrintOrders\(MappedOrders, mode/, 'Output scope must derive from full mapped Batch data');

console.log('PackMaster Layout V4 contract passed');
