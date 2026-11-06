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
assert.match(html, /clickable: ordersCount > 0 && !printBlocked/, 'Print step must be disabled while unresolved exceptions block printing');
assert.match(html, /ordersCount > 0 && !printBlocked && onNavigate\('review'\)/, 'Blocked print step must not navigate to Review as if printing were available');
assert.match(html, /quickMapPreviousActiveRef\.current = document\.activeElement;/, 'Exception Review must capture the trigger before moving focus into the dialog');
assert.match(html, /if \(!quickMapPreviousActiveRef\.current\) quickMapPreviousActiveRef\.current = document\.activeElement;/, 'dialog effect must not overwrite the captured trigger after autoFocus runs');
assert.match(html, /quickMapPreviousActiveRef\.current = null;/, 'Exception Review must clear its saved focus target after closing');
assert.match(html, /prev && prev\.isConnected && typeof prev\.focus === 'function'/, 'Exception Review must restore focus only to the original trigger still in the DOM');
assert.match(html, /const confirmQueueRef = React\.useRef\(\[\]\);/, 'requestConfirm must queue concurrent dialogs instead of dropping unresolved promises');
assert.match(html, /onClick=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) onCancel\(\); \}\}/, 'PMConfirmDialog backdrop click must cancel safely');
assert.equal((html.match(/ขั้นต่อไป: ตรวจรายการ/g) || []).length, 1, 'Upload view must render only one primary next-step button');

console.log('PackMaster simplified navigation contract passed');
