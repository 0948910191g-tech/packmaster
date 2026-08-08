import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /const \[reviewPreviewIndex, setReviewPreviewIndex\] = useState\(0\)/, 'Review preview cursor state must exist');
assert.match(html, /data-pm-review-preview="full"/, 'Full review preview marker must exist');
assert.match(html, /data-pm-action="review-preview-prev"/, 'Previous preview action must exist');
assert.match(html, /data-pm-action="review-preview-next"/, 'Next preview action must exist');
assert.match(html, /CurrentPreviewOrder/, 'Current preview order must be derived from filtered review orders');
assert.match(html, /FilteredOrders\[safeReviewPreviewIndex\]/, 'Full preview must use the filtered review list');
assert.match(html, /พรีวิวเต็มหน้า/, 'Full preview must be the primary review presentation');
assert.match(html, /Print ยังใช้ข้อมูลเต็ม Batch/, 'Review UI must preserve full-Batch print scope notice');

// Critical safety: export and browser print must still render the complete active Batch.
assert.match(html, /for \(let i = 0; i < MappedOrders\.length; i\+\+\)/, 'Save PDF must still iterate all MappedOrders');
assert.match(html, /\{MappedOrders\.map\(\(order\) => \(<LabelCard key=\{`print-\$\{order\.id\}`\}/, 'Print area must still render all MappedOrders');

console.log('PackMaster full review preview contract passed');
