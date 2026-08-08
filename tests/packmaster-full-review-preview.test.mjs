import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-review-preview="full"/, 'Full review preview marker must exist');
assert.match(html, /FilteredOrders\.map\(\(order,index\)=>/, 'Full preview must render every filtered review order');
assert.match(html, /<LabelCard order=\{order\} thermalMode=\{thermalMode\} \/>/, 'Each full preview item must use the real LabelCard');
assert.equal(html.includes('reviewPreviewIndex'), false, 'Full preview must not hide orders behind a single-order cursor');
assert.equal(html.includes('review-preview-prev'), false, 'Full preview must not require Previous navigation');
assert.equal(html.includes('review-preview-next'), false, 'Full preview must not require Next navigation');
assert.equal(html.includes('onReviewPreviewKey'), false, 'Full preview must not require keyboard paging');
assert.match(html, /พรีวิวเต็มหน้า/, 'Full preview must remain the primary review presentation');
assert.match(html, /Print ยังใช้ข้อมูลเต็ม Batch/, 'Review UI must preserve full-Batch print scope notice');

// Critical safety: export and browser print must still render the complete active Batch.
assert.match(html, /for \(let i = 0; i < MappedOrders\.length; i\+\+\)/, 'Save PDF must still iterate all MappedOrders');
assert.match(html, /\{MappedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Print area must still render all MappedOrders');

console.log('PackMaster all full review previews contract passed');
