import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mustInclude = (needle, message) => assert.ok(html.includes(needle), message || `Missing UI safety marker: ${needle}`);

test('review screen keeps review diagnostics without a print guard', () => {
  mustInclude('<script src="./packmaster-pilot-safety.js"></script>');
  mustInclude('const pilotSafetyApi = window.PackMasterPilotSafety;');
  mustInclude('data-pm-review-action-dock');
  mustInclude('ไม่บล็อกการพิมพ์');
  assert.doesNotMatch(html, /const printBlocked|รายการที่ยังต้องตรวจ|handleEmergencyPrint/);
  assert.doesNotMatch(html, /พิมพ์ Ready|พิมพ์เฉพาะรายการพร้อม|Save Ready PDF/);
  assert.match(html, /handlePrint\(['"]FULL_BATCH['"]/);
});

test('normal full-batch flow has no guard or override path', () => {
  assert.match(html, /handlePrint\(['"]FULL_BATCH['"]/);
  assert.match(html, /handleExportPDF\(['"]FULL_BATCH['"]/);
  assert.doesNotMatch(html, /printBlocked|handleEmergencyPrint|override = false/);
});

test('SKU/unmapped Review keeps Pilot Safety source identity and never auto-selects a Keyword', () => {
  mustInclude('const getReviewSourceText = (row) => {');
  mustInclude('const handleFixSkuException = (row) => {');
  mustInclude("types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')");
  mustInclude('pilotSafetyApi.getSkuFixSeed(row, getMatchResult)');
  mustInclude('const seed = getReviewSourceText(row);');
  mustInclude('sourceText: seed');
  assert.match(html, /setQuickMapState\(\{\s*open:\s*true,\s*row,\s*sourceText:\s*seed,\s*itemIndex:\s*getReviewSourceItemIndex\(row, seed\),\s*keyword:\s*'',\s*shortName:\s*'',\s*suggestions\s*\}\);/s);
  assert.doesNotMatch(html, /const initialKeyword = suggestions\.length > 0 \? suggestions\[0\]\.value : '';/);
  mustInclude('data-pm-action="review-exception"');
  mustInclude('ตรวจรายการ');
});

test('batch status UI preserves printed state after full output', () => {
  mustInclude('const getEffectiveBatchStatus = (batch) => pilotSafetyApi ? pilotSafetyApi.getEffectiveBatchStatus(batch) : batch.status;');
  mustInclude('printedAt: activeBatch.printedAt');
  assert.match(html, /mode === ['"]FULL_BATCH['"]/);
});
