import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-review-preview="grid"/, 'Hybrid review grid marker must exist');
assert.match(html, /data-pm-review-layout="hybrid-grid"/, 'Hybrid review layout marker must exist');
assert.match(html, /ReviewDisplayOrders\.map\(\(order,index\)=>/, 'Hybrid review must render every presentation-scope review order');
assert.match(html, /<LabelCard order=\{order\} thermalMode=\{thermalMode\} \/>/, 'Each hybrid preview item must use the real LabelCard');
assert.equal(html.includes('reviewPreviewIndex'), false, 'Hybrid preview must not hide orders behind a single-order cursor');
assert.equal(html.includes('review-preview-prev'), false, 'Hybrid preview must not require Previous navigation');
assert.equal(html.includes('review-preview-next'), false, 'Hybrid preview must not require Next navigation');
assert.equal(html.includes('onReviewPreviewKey'), false, 'Hybrid preview must not require keyboard paging');
assert.match(html, /พรีวิวหลายใบ/, 'Multi-card preview must remain the primary review presentation');
assert.match(html, /data-pm-review-card-details/, 'Hybrid review cards must retain enhanced order details');
assert.match(html, /Print \/ Save PDF ใช้ Scope ที่ผู้ใช้เลือก/, 'Review UI must explain that output scope is explicit');

// Critical safety: display filters remain presentation-only; output scope must derive from full MappedOrders.
assert.match(html, /selectPrintOrders\(MappedOrders, mode/, 'Export/print scope must derive from full MappedOrders, not the filtered Review list');
assert.match(html, /for \(let i = 0; i < ordersToExport\.length; i\+\+\)/, 'Save PDF must iterate the selected output scope');
assert.match(html, /\{PrintScopedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Print area must render the selected output scope');
assert.equal(/MappedOrders\s*=\s*ReviewDisplayOrders/.test(html), false, 'Presentation filters must never replace full MappedOrders');

console.log('PackMaster hybrid multi-card review preview contract passed');
