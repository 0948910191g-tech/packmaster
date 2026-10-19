import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

assert.match(html, /data-pm-primary-nav/, 'Primary workspace navigation must be explicitly marked');
assert.match(html, /\['batches',\s*'box',\s*'งานแพ็ก'\]/, 'งานแพ็ก must remain in primary navigation');
assert.match(html, /\['upload',\s*'upload',\s*'อัปโหลด PDF'\]/, 'อัปโหลด PDF must be in primary navigation');
assert.match(html, /\['review',\s*'review',\s*'ตรวจและพิมพ์'\]/, 'ตรวจและพิมพ์ must be in primary navigation');
assert.match(html, /data-pm-secondary-nav/, 'Secondary operational tools area must exist');
assert.match(html, /navigateView\('sku'\)/, 'SKU view must remain reachable');
assert.match(html, /navigateView\('upload'\)/, 'Upload view must remain reachable');
assert.match(html, /navigateView\('safety'\)/, 'Safety view must remain reachable');
assert.match(html, /exceptionRows\.length/, 'Review exception badge/awareness must remain wired to current exceptions');
assert.match(html, /data-pm-stepper/, 'Workflow stepper must exist');

console.log('PackMaster simplified navigation contract passed');
