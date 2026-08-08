import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-primary-nav/, 'Primary workspace navigation must be explicitly marked');
assert.match(html, /\['batches','box','งานแพ็ก'\]/, 'งานแพ็ก must remain a primary workspace');
assert.match(html, /\['sku','barcode','คลังคำศัพท์'\]/, 'คลังคำศัพท์ must remain a primary workspace');
assert.match(html, /\['review','review','รีวิว & พิมพ์'\]/, 'รีวิว & พิมพ์ must remain a primary workspace');
assert.equal(/data-pm-primary-nav[\s\S]{0,900}\['upload','upload','อัปโหลด'\]/.test(html), false, 'Upload must not remain equal-weight primary navigation');
assert.equal(/data-pm-primary-nav[\s\S]{0,900}\['safety','shield','สำรองข้อมูล'\]/.test(html), false, 'Safety must not remain equal-weight primary navigation');
assert.match(html, /data-pm-secondary-nav/, 'Secondary operational tools area must exist');
assert.match(html, /navigateView\('upload'\)/, 'Upload view must remain reachable');
assert.match(html, /navigateView\('safety'\)/, 'Safety view must remain reachable');
assert.match(html, /exceptionRows\.length/, 'Review exception badge/awareness must remain wired to current exceptions');

console.log('PackMaster simplified navigation contract passed');
