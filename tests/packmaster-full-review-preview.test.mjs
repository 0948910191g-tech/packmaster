import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-review-preview="grid"/, 'Hybrid review grid marker must exist');
assert.match(html, /data-pm-review-layout="hybrid-grid"/, 'Hybrid review layout marker must exist');
assert.match(html, /FilteredOrders\.map\(\(order,index\)=>/, 'Hybrid review must render every filtered review order');
assert.match(html, /<LabelCard order=\{order\} thermalMode=\{thermalMode\} \/>/, 'Each hybrid preview item must use the real LabelCard');
assert.equal(html.includes('reviewPreviewIndex'), false, 'Hybrid preview must not hide orders behind a single-order cursor');
assert.equal(html.includes('review-preview-prev'), false, 'Hybrid preview must not require Previous navigation');
assert.equal(html.includes('review-preview-next'), false, 'Hybrid preview must not require Next navigation');
assert.equal(html.includes('onReviewPreviewKey'), false, 'Hybrid preview must not require keyboard paging');
assert.match(html, /พรีวิวหลายใบ/, 'Multi-card preview must remain the primary review presentation');
assert.match(html, /data-pm-review-card-details/, 'Hybrid review cards must retain enhanced order details');
assert.match(html, /Print ยังใช้ข้อมูลเต็ม Batch/, 'Review UI must preserve full-Batch print scope notice');

// Critical safety: export and browser print must still render the complete active Batch.
assert.match(html, /for \(let i = 0; i < MappedOrders\.length; i\+\+\)/, 'Save PDF must still iterate all MappedOrders');
assert.match(html, /\{MappedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Print area must still render all MappedOrders');

console.log('PackMaster hybrid multi-card review preview contract passed');
