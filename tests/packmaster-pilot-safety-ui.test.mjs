import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mustInclude = (needle, message) => assert.ok(html.includes(needle), message || `Missing UI safety marker: ${needle}`);

test('review screen keeps safety detection but provides safe scoped actions', () => {
  mustInclude('<script src="./packmaster-pilot-safety.js"></script>');
  mustInclude('const pilotSafetyApi = window.PackMasterPilotSafety;');
  mustInclude('const printBlocked = pilotSafetyApi ? pilotSafetyApi.hasBlockingExceptions(exceptionRows) : exceptionRows.length > 0;');
  mustInclude('Print Safety ทำงานอยู่');
  assert.match(html, /พิมพ์ Ready|พิมพ์เฉพาะรายการพร้อม/);
  assert.match(html, /Save Ready PDF/);
  assert.match(html, /พิมพ์ทั้ง Batch/);
});

test('normal full-batch flow remains safe while override is explicit', () => {
  assert.match(html, /handlePrint\(['"]FULL_BATCH['"]/);
  assert.match(html, /handleExportPDF\(['"]FULL_BATCH['"]/);
  assert.match(html, /window\.confirm\(/);
  assert.match(html, /mode === ['"]FULL_BATCH['"] && printBlocked && !override/);
});

test('SKU/unmapped Review keeps Pilot Safety source identity and never auto-selects a Keyword', () => {
  mustInclude('const getReviewSourceText = (row) => {');
  mustInclude('const handleFixSkuException = (row) => {');
  mustInclude("types.some(type => type === 'REVIEW_SKU' || type === 'UNMAPPED')");
  mustInclude('pilotSafetyApi.getSkuFixSeed(row, getMatchResult)');
  mustInclude('const seed = getReviewSourceText(row);');
  mustInclude('sourceText: seed');
  assert.match(html, /setQuickMapState\(\{\s*open:\s*true,\s*row,\s*sourceText:\s*seed,\s*keyword:\s*'',\s*shortName:\s*'',\s*suggestions\s*\}\);/s);
  assert.doesNotMatch(html, /const initialKeyword = suggestions\.length > 0 \? suggestions\[0\]\.value : '';/);
  mustInclude('data-pm-action="review-exception"');
  mustInclude('ตรวจรายการ');
});

test('batch status UI remains exception-first even after emergency output', () => {
  mustInclude('const getEffectiveBatchStatus = (batch) => pilotSafetyApi ? pilotSafetyApi.getEffectiveBatchStatus(batch) : batch.status;');
  mustInclude('printedAt: printBlocked ? null : activeBatch.printedAt');
  assert.match(html, /mode === ['"]FULL_BATCH['"] && !printBlocked/);
});
