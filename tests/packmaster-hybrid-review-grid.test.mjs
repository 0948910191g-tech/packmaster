import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-review-layout="hybrid-grid"/, 'Hybrid review grid marker must exist');
assert.match(html, /ReviewDisplayOrders\.map\(\(order,index\)=>/, 'Hybrid grid must render every current presentation-scope review order');
assert.match(html, /const ReviewDisplayOrders = exceptionMode \? FilteredOrders\.filter/, 'Hybrid grid display list must remain derived from filtered Review data');
assert.match(html, /pm-review-grid/, 'Hybrid review grid class must exist');
assert.match(html, /data-pm-review-card-details/, 'Each review card must expose enhanced detail metadata');
assert.match(html, /Order \/ Tracking/, 'Hybrid card must show order or tracking detail');
assert.match(html, /ชื่อภายใน \/ ผลลัพธ์ที่จะพิมพ์/, 'Hybrid card must show internal output detail');
assert.match(html, /Qty/, 'Hybrid card must show quantity detail');
assert.match(html, /ลำดับ/, 'Hybrid card must show running order index');
assert.match(html, /พรีวิวหลายใบ/, 'Multi-card preview must be the primary review presentation');
assert.equal(html.includes('reviewPreviewIndex'), false, 'Hybrid grid must not hide orders behind a single-order cursor');
assert.equal(html.includes('review-preview-prev'), false, 'Hybrid grid must not require Previous navigation');
assert.equal(html.includes('review-preview-next'), false, 'Hybrid grid must not require Next navigation');
assert.match(html, /Print ยังใช้ข้อมูลเต็ม Batch/, 'Review UI must preserve full-Batch print scope notice');

// Critical safety: export and browser print must still render the complete active Batch.
assert.match(html, /for \(let i = 0; i < MappedOrders\.length; i\+\+\)/, 'Save PDF must still iterate all MappedOrders');
assert.match(html, /\{MappedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Print area must still render all MappedOrders');

console.log('PackMaster hybrid review grid contract passed');
