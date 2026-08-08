const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const URL = 'https://0948910191g-tech.github.io/packmaster/';
const CHECKPOINT = '/tmp/packmaster-pilot-checkpoint';
const ERROR_FILE = '/tmp/packmaster-pilot-error';

const mark = (number, name) => {
  fs.writeFileSync(CHECKPOINT, `${number}:${name}`);
  console.log(`CHECKPOINT ${number} ${name}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const button = (text) => page.locator('button').filter({ hasText: text }).first();
  const text = (value) => page.getByText(value, { exact: false }).first();

  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const value = message.text();
    if (value.includes('Workspace restore file validation failed')) return;
    errors.push(`console: ${value}`);
  });

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => Boolean(
      window.PackMasterBatch && window.PackMasterWorkspace && window.PackMasterDuplicate &&
      window.PackMasterExceptions && window.PackMasterArchive &&
      window.PackMasterStorageHealth && window.PackMasterDiagnostics
    ), null, { timeout: 60000 });
    await page.getByRole('heading', { name: 'งานแพ็ก' }).waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    mark(1, 'loaded');

    const initial = await page.evaluate(() => window.PackMasterBatch.listBatches());
    assert.equal(initial.length, 0);
    mark(2, 'storage');

    const create = button('สร้าง Batch');
    assert.ok(await create.count());
    await create.click();
    await button('กลับรายการ Batch').waitFor({ timeout: 30000 });
    const batchId = await page.evaluate(async () => (await window.PackMasterBatch.listBatches())[0].id);
    let loaded = await page.evaluate(id => window.PackMasterBatch.loadBatch(id), batchId);
    assert.equal(Object.prototype.hasOwnProperty.call(loaded.meta, 'archivedAt'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(loaded.meta, 'sourceFiles'), false);
    mark(3, 'created');

    await page.evaluate(id => window.PackMasterDuplicate.appendBatchFingerprints(id, [{
      hash: 'FINAL-SANITIZED-HASH', size: 456, addedAt: '2026-08-08T14:10:00.000Z', name: 'drop-this.pdf'
    }]), batchId);
    const fingerprints = await page.evaluate(id => window.PackMasterDuplicate.getBatchFingerprints(id), batchId);
    assert.equal(fingerprints.length, 1);
    assert.equal('name' in fingerprints[0], false);
    mark(4, 'duplicate-sidecar');

    await button('กลับรายการ Batch').click();
    await page.getByRole('heading', { name: 'งานแพ็ก' }).waitFor({ timeout: 30000 });
    mark(5, 'batch-list');

    await button('เก็บเข้าคลัง').click();
    assert.ok(await page.evaluate(id => window.PackMasterArchive.getArchivedAt(id, null), batchId));
    loaded = await page.evaluate(id => window.PackMasterBatch.loadBatch(id), batchId);
    assert.equal(Object.prototype.hasOwnProperty.call(loaded.meta, 'archivedAt'), false);
    await button('Archived').click();
    await button('นำกลับ').waitFor({ timeout: 30000 });
    mark(6, 'archived');

    await page.evaluate(async id => {
      const row = await window.PackMasterBatch.loadBatch(id);
      await window.PackMasterBatch.saveBatch(row.meta, [{
        id: 'final-sanitized-order', tracking: 'FINAL-SANITIZED-TRACK', orderId: 'FINAL-SANITIZED-ORDER', platform: 'TIKTOK',
        parsedItems: [], displayItems: ['SANITIZED OUTPUT'], originalQty: 1, qtyWarning: false, parserWarning: false,
        pdfImage: 'data:image/jpeg;base64,FINAL-SANITIZED-HEAVY'
      }]);
    }, batchId);
    await page.locator('input[type="checkbox"]').first().check();
    page.once('dialog', dialog => dialog.accept());
    await button('ล้างเฉพาะรูปสำหรับ Reprint').click();
    await page.waitForTimeout(500);
    loaded = await page.evaluate(id => window.PackMasterBatch.loadBatch(id), batchId);
    assert.equal(Object.prototype.hasOwnProperty.call(loaded.orders[0], 'pdfImage'), false);
    mark(7, 'cleanup');

    const diagPromise = page.waitForEvent('download');
    await button('ดาวน์โหลด Diagnostics').click();
    const diagDownload = await diagPromise;
    const diagText = fs.readFileSync(await diagDownload.path(), 'utf8');
    const diag = JSON.parse(diagText);
    assert.equal(diag.batches.filter(row => row.archived).length, 1);
    assert.equal(diagText.includes('FINAL-SANITIZED-TRACK'), false);
    assert.equal(diagText.includes('FINAL-SANITIZED-ORDER'), false);
    mark(8, 'diagnostics');

    await button('คลังคำศัพท์').click();
    await page.getByRole('heading', { name: 'คลังคำศัพท์' }).waitFor({ timeout: 30000 });
    const backupPromise = page.waitForEvent('download');
    await button('สำรอง Workspace').click();
    const backupDownload = await backupPromise;
    const backupText = fs.readFileSync(await backupDownload.path(), 'utf8');
    const backup = JSON.parse(backupText);
    assert.equal(backup.settings.duplicateFingerprints[batchId][0].hash, 'FINAL-SANITIZED-HASH');
    assert.ok(backup.settings.archiveState[batchId].archivedAt);
    mark(9, 'backup');

    await page.evaluate(id => {
      window.PackMasterDuplicate.replaceFingerprintStore({ [id]: [{ hash: 'MUTATED-HASH', size: 1, addedAt: '2026-08-08T14:11:00.000Z' }] });
      window.PackMasterArchive.restoreBatch(id, new Date('2026-08-08T14:11:00.000Z'));
    }, batchId);
    const restoreInput = page.locator('input[type="file"][accept=".json,application/json"]');
    await restoreInput.setInputFiles({ name: 'pilot-checkpoint.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
    await text('พร้อมกู้คืนจาก pilot-checkpoint.json').waitFor({ timeout: 30000 });
    page.once('dialog', dialog => dialog.accept());
    await button('Replace Workspace').click();
    await page.getByRole('heading', { name: 'งานแพ็ก' }).waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(id => window.PackMasterDuplicate.getBatchFingerprints(id)[0].hash, batchId), 'FINAL-SANITIZED-HASH');
    assert.ok(await page.evaluate(id => window.PackMasterArchive.getArchivedAt(id, null), batchId));
    mark(10, 'restore');

    await button('คลังคำศัพท์').click();
    const invalid = JSON.parse(backupText);
    invalid.settings.archiveState = { [batchId]: { archivedAt: 'bad-date', touchedAt: 'bad-date' } };
    await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles({
      name: 'invalid-checkpoint.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid))
    });
    await text('ไฟล์ Backup ใช้งานไม่ได้').waitFor({ timeout: 30000 });
    assert.ok(await page.evaluate(id => window.PackMasterArchive.getArchivedAt(id, null), batchId));
    mark(11, 'invalid-rejected');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.PackMasterBatch && window.PackMasterArchive && window.PackMasterDuplicate));
    await page.waitForTimeout(1200);
    const afterReload = await page.evaluate(() => window.PackMasterBatch.listBatches());
    assert.equal(afterReload.length, 1);
    assert.ok(await page.evaluate(id => window.PackMasterArchive.getArchivedAt(id, null), batchId));
    assert.equal(await page.evaluate(id => window.PackMasterDuplicate.getBatchFingerprints(id)[0].hash, batchId), 'FINAL-SANITIZED-HASH');
    mark(12, 'reload');

    await page.evaluate(async () => {
      const rows = await window.PackMasterBatch.listBatches();
      for (const row of rows) await window.PackMasterBatch.deleteBatch(row.id);
      localStorage.removeItem(window.PackMasterArchive.STORAGE_KEY);
      localStorage.removeItem(window.PackMasterDuplicate.STORAGE_KEY);
      localStorage.removeItem('skuMappingRules');
      localStorage.removeItem('thermalMode');
    });
    assert.equal((await page.evaluate(() => window.PackMasterBatch.listBatches())).length, 0);
    if (errors.length) throw new Error(errors.join('\n'));
    mark(13, 'complete');
  } catch (error) {
    fs.writeFileSync(ERROR_FILE, `${error && error.stack ? error.stack : error}\nBROWSER_ERRORS=${JSON.stringify(errors)}`);
    console.error(error);
  } finally {
    await browser.close();
  }
})().catch(error => {
  fs.writeFileSync(ERROR_FILE, `${error && error.stack ? error.stack : error}`);
});
