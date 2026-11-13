import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

// Ticket 23: the restore confirmation shows the backup date and the name bindings that will be
// replaced, warns when the backup is old and has no bindings, and backs up / clears / restores the
// two keys that were missing from the backup (batch source-file names and SKU integrity backup).

const require = createRequire(import.meta.url);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workspace = require('../packmaster-workspace.js');
const preview = require('../packmaster-restore-preview.js');
const safety = require('../packmaster-restore-safety.js');

const backupWith = (settings = {}, createdAt = '2026-11-10T07:05:00.000Z') => workspace.createBackup({
  appVersion: 'restore-preview-test',
  settings: { thermalMode: false, ...settings },
  skuRules: [],
  batches: [],
  batchOrders: []
}, new Date(createdAt));

const assignments = count => ({
  schema: 'packmaster-registry-sku-assignments',
  version: 1,
  updatedAt: '2026-11-10T00:00:00.000Z',
  entries: Array.from({ length: count }, (_, index) => ({ sellerSku: `SKU${index}`, shortName: `Name${index}` }))
});

const bindingsBackup = backupWith({ registryAssignments: assignments(3) });
const oldBackup = backupWith({});

test('the impact summary shows the backup date in Thai time and the bindings that will be replaced', () => {
  const impact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: 5 });
  assert.equal(impact.createdAtLabel, '2026-11-10 14:05 น. (เวลาไทย)');
  assert.equal(impact.backupBindingCount, 3);
  assert.equal(impact.hasBindingData, true);
  assert.equal(impact.currentBindingCount, 5);
  assert.equal(impact.willReplaceBindingCount, 5);
  assert.ok(impact.warnings.some(text => text.includes('5') && text.includes('3') && text.includes('แทนที่')),
    'the replacement count must be stated');
});

test('an invalid backup date is shown as unknown instead of a wrong date', () => {
  const impact = preview.describeRestoreImpact({ backup: { ...bindingsBackup, createdAt: 'not-a-date' }, currentBindingCount: 0 });
  assert.equal(impact.createdAtLabel, 'ไม่ทราบวันที่');
});

test('an old backup without name bindings gets a clear warning that the current bindings will be cleared', () => {
  const impact = preview.describeRestoreImpact({ backup: oldBackup, currentBindingCount: 7 });
  assert.equal(impact.hasBindingData, false);
  assert.equal(impact.backupBindingCount, 0);
  assert.equal(impact.willReplaceBindingCount, 7);
  const bindingWarning = impact.warnings.find(text => text.includes('ชื่อที่ผูก'));
  assert.ok(bindingWarning, 'a warning about name bindings must exist');
  assert.ok(bindingWarning.includes('รุ่นเก่า') && bindingWarning.includes('7'), 'the warning must say it is an old backup and how many bindings are cleared');
});

test('no binding warning appears when the backup carries bindings and nothing is currently bound', () => {
  const impact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: 0 });
  assert.equal(impact.warnings.some(text => text.includes('ชื่อที่ผูก') && text.includes('รุ่นเก่า')), false);
});

test('an old backup without batch source-file names warns that those names will be cleared', () => {
  const impact = preview.describeRestoreImpact({ backup: oldBackup, currentBindingCount: 0 });
  assert.equal(impact.hasSourceFileData, false);
  assert.ok(impact.warnings.some(text => text.includes('ชื่อไฟล์ต้นทาง')));
  const withSourceFiles = backupWith({ batchSourceFiles: { 'b-1': ['a.pdf'] } });
  assert.equal(preview.describeRestoreImpact({ backup: withSourceFiles, currentBindingCount: 0 }).hasSourceFileData, true);
});

test('the confirmation message carries the date, the binding counts, the safety-copy note and the label-image warning', () => {
  const impact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: 5 });
  const message = preview.buildRestoreConfirmMessage({
    impact,
    summary: { skuRules: 1, batches: 2, orders: 9 },
    integrityPreview: '',
    recoverySafetyCopy: 'โดยระบบจะสร้าง Safety Snapshot ในหน่วยความจำก่อนเริ่มกู้คืน'
  });
  assert.ok(message.includes('2026-11-10 14:05 น.'));
  assert.ok(message.includes('ชื่อที่ผูกใน Backup: 3'));
  assert.ok(message.includes('5 รายการ'));
  assert.ok(message.includes('PackMaster_SafetyCopy_'));
  assert.ok(message.includes('รูปใบปะหน้า'));
  assert.ok(message.includes('ตามที่คุณเลือกบันทึกไว้'));
});

test('the confirmation message of an old backup shows the no-binding warning before the user clicks Replace', () => {
  const impact = preview.describeRestoreImpact({ backup: oldBackup, currentBindingCount: 4 });
  const message = preview.buildRestoreConfirmMessage({
    impact,
    summary: { skuRules: 0, batches: 0, orders: 0 },
    integrityPreview: '',
    recoverySafetyCopy: ''
  });
  assert.ok(message.includes('รุ่นเก่า'));
  assert.ok(message.includes('4'));
});

// Review fix: when the binding list could not be read, the current count is UNKNOWN, never 0.
test('an unreadable binding list shows the current count as unknown, not as 0', () => {
  const impact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: null, loadErrors: ['ทะเบียนชื่อที่ผูก'] });
  assert.equal(impact.currentBindingCountKnown, false);
  assert.equal(impact.currentBindingCount, null);
  assert.equal(impact.willReplaceBindingCount, null);
  assert.ok(impact.warnings.some(text => text.includes('ไม่ทราบ') && text.includes('ไม่ใช่ 0')), 'the warning must say unknown, not zero');
  const message = preview.buildRestoreConfirmMessage({ impact, summary: { skuRules: 0, batches: 0, orders: 0 }, recoverySafetyCopy: '' });
  assert.ok(message.includes('ไม่ทราบจำนวน'));
  assert.equal(message.includes('ชื่อที่ผูกปัจจุบันที่จะถูกแทนที่ (หายจาก Local): 0'), false);
});

test('an old backup with an unknown current count does not claim a count of 0 bindings are cleared', () => {
  const impact = preview.describeRestoreImpact({ backup: oldBackup, currentBindingCount: null, loadErrors: [] });
  const bindingWarning = impact.warnings.find(text => text.includes('รุ่นเก่า'));
  assert.ok(bindingWarning.includes('ทั้งหมด'));
  assert.equal(bindingWarning.includes(' 0 รายการ'), false);
});

// Review fix: the restore is not blocked when a local store failed to load (it is the repair path),
// but the user is told that the safety copy will not contain that part.
test('a store that failed to load produces a clear Thai warning line in the impact and the confirm message', () => {
  const impact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: 2, loadErrors: ['SKU Rules', 'Marketplace Registry'] });
  const line = impact.warnings.find(text => text.includes('อ่านไม่ครบ'));
  assert.ok(line, 'a load-error warning must exist');
  assert.ok(line.includes('SKU Rules') && line.includes('Marketplace Registry'));
  assert.ok(line.includes('ไฟล์สำเนาข้อมูลเดิมจะไม่มีส่วนนั้น'));
  const message = preview.buildRestoreConfirmMessage({ impact, summary: { skuRules: 0, batches: 0, orders: 0 }, recoverySafetyCopy: '' });
  assert.ok(message.includes('อ่านไม่ครบ'));
});

test('the confirm message shows local key problems detected at confirm time', () => {
  const impact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: 0, loadErrors: [] });
  const message = preview.buildRestoreConfirmMessage({
    impact,
    summary: { skuRules: 0, batches: 0, orders: 0 },
    recoverySafetyCopy: '',
    localKeyWarnings: ['คีย์ packmasterBatchSourceFilesV1 อ่านไม่ได้ จึงไม่ถูกรวมใน backup']
  });
  assert.ok(message.includes('คีย์ packmasterBatchSourceFilesV1 อ่านไม่ได้'));
});

// Review fix: the safety copy is saved to a location the USER chooses, not necessarily Downloads.
test('the dialog text never claims the safety copy is in the Downloads folder', () => {
  const impact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: 0 });
  const message = preview.buildRestoreConfirmMessage({ impact, summary: { skuRules: 0, batches: 0, orders: 0 }, recoverySafetyCopy: '' });
  assert.equal(message.includes('Downloads'), false);
  assert.ok(message.includes('ตามที่คุณเลือกบันทึกไว้'));
});

test('validateBackup keeps the two added keys and rejects malformed values', () => {
  const good = backupWith({
    batchSourceFiles: { 'b-1': ['a.pdf', 'b.pdf'] },
    skuIntegrityBackup: [{ keyword: 'A', shortName: 'B' }]
  });
  assert.deepEqual(good.settings.batchSourceFiles, { 'b-1': ['a.pdf', 'b.pdf'] });
  assert.deepEqual(good.settings.skuIntegrityBackup, [{ keyword: 'A', shortName: 'B' }]);
  assert.throws(() => backupWith({ batchSourceFiles: ['not', 'an', 'object'] }), /batchSourceFiles/);
  assert.throws(() => backupWith({ batchSourceFiles: { 'b-1': 'a.pdf' } }), /batchSourceFiles/);
  assert.throws(() => backupWith({ skuIntegrityBackup: { keyword: 'A' } }), /skuIntegrityBackup/);
  assert.throws(() => backupWith({ skuIntegrityBackup: ['not-a-rule'] }), /skuIntegrityBackup/);
});

const stubStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
};

test('the two keys are backed up from local storage with no problems when they are healthy or absent', () => {
  const storage = stubStorage({
    [safety.BATCH_SOURCE_FILES_KEY]: JSON.stringify({ 'b-1': ['a.pdf'] }),
    [safety.SKU_INTEGRITY_BACKUP_KEY]: JSON.stringify([{ keyword: 'A', shortName: 'B' }])
  });
  assert.deepEqual(safety.readBackupLocalKeys(storage), {
    values: { batchSourceFiles: { 'b-1': ['a.pdf'] }, skuIntegrityBackup: [{ keyword: 'A', shortName: 'B' }] },
    problems: []
  });
  assert.deepEqual(safety.readBackupLocalKeys(stubStorage()), {
    values: { batchSourceFiles: null, skuIntegrityBackup: null },
    problems: []
  });
});

// Changed on purpose (review fix): a corrupt local key no longer blocks the backup or the restore
// safety copy. It is stored as null and reported by name, so the user is warned instead.
test('a corrupt or wrong-shape local key is stored as null, reported by name, and does not block the backup', () => {
  const corrupt = stubStorage({ [safety.BATCH_SOURCE_FILES_KEY]: '{not json' });
  const unparseable = safety.readBackupLocalKeys(corrupt);
  assert.deepEqual(unparseable.values, { batchSourceFiles: null, skuIntegrityBackup: null });
  assert.equal(unparseable.problems.length, 1);
  assert.equal(unparseable.problems[0].key, safety.BATCH_SOURCE_FILES_KEY);
  assert.equal(unparseable.problems[0].message, 'คีย์ packmasterBatchSourceFilesV1 อ่านไม่ได้ จึงไม่ถูกรวมใน backup');

  const wrongShape = stubStorage({
    [safety.BATCH_SOURCE_FILES_KEY]: JSON.stringify(['not', 'an', 'object']),
    [safety.SKU_INTEGRITY_BACKUP_KEY]: JSON.stringify({ keyword: 'A' })
  });
  const shaped = safety.readBackupLocalKeys(wrongShape);
  assert.deepEqual(shaped.values, { batchSourceFiles: null, skuIntegrityBackup: null });
  assert.deepEqual(shaped.problems.map(problem => problem.key).sort(),
    [safety.BATCH_SOURCE_FILES_KEY, safety.SKU_INTEGRITY_BACKUP_KEY].sort());

  const unreadable = { getItem() { throw new Error('storage denied'); }, setItem() {}, removeItem() {} };
  assert.equal(safety.readBackupLocalKeys(unreadable).problems.length, 2, 'an unreadable store is reported, not thrown');
});

test('the raw localStorage strings are untouched by the backup read, so Desktop recovery still captures them', () => {
  const corrupt = stubStorage({ [safety.BATCH_SOURCE_FILES_KEY]: '{not json' });
  safety.readBackupLocalKeys(corrupt);
  assert.equal(corrupt.getItem(safety.BATCH_SOURCE_FILES_KEY), '{not json');
});

test('restore writes the two keys from the backup, and clears them when an old backup has none', () => {
  const storage = stubStorage({
    [safety.BATCH_SOURCE_FILES_KEY]: JSON.stringify({ 'old-b': ['old.pdf'] }),
    [safety.SKU_INTEGRITY_BACKUP_KEY]: JSON.stringify([{ keyword: 'OLD', shortName: 'X' }])
  });
  safety.writeBackupLocalKeys(storage, { batchSourceFiles: { 'new-b': ['new.pdf'] }, skuIntegrityBackup: [{ keyword: 'N', shortName: 'Y' }] });
  assert.equal(storage.getItem(safety.BATCH_SOURCE_FILES_KEY), JSON.stringify({ 'new-b': ['new.pdf'] }));
  assert.equal(storage.getItem(safety.SKU_INTEGRITY_BACKUP_KEY), JSON.stringify([{ keyword: 'N', shortName: 'Y' }]));

  safety.writeBackupLocalKeys(storage, { batchSourceFiles: undefined, skuIntegrityBackup: null });
  assert.equal(storage.getItem(safety.BATCH_SOURCE_FILES_KEY), null, 'an old backup clears the source-file names');
  assert.equal(storage.getItem(safety.SKU_INTEGRITY_BACKUP_KEY), null, 'an old backup clears the SKU integrity backup');
});

test('a backup taken from local storage restores the same values after the keys are cleared', () => {
  const original = stubStorage({
    [safety.BATCH_SOURCE_FILES_KEY]: JSON.stringify({ 'b-1': ['a.pdf'] }),
    [safety.SKU_INTEGRITY_BACKUP_KEY]: JSON.stringify([{ keyword: 'A', shortName: 'B' }])
  });
  const saved = safety.readBackupLocalKeys(original).values;
  const other = stubStorage();
  safety.writeBackupLocalKeys(other, saved);
  assert.deepEqual(safety.readBackupLocalKeys(other).values, saved);
});

test('index.html includes both keys in the backup payload and writes them back on restore', () => {
  const handler = html.slice(html.indexOf('const handleWorkspaceBackup = async () => {'), html.indexOf('const handleWorkspaceRestoreFile'));
  assert.match(handler, /restoreSafetyApi\.readBackupLocalKeys\(window\.localStorage\)/);
  const confirm = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.match(confirm, /restoreSafetyApi\.readBackupLocalKeys\(window\.localStorage\)/, 'the safety copy must also carry both keys');
  assert.match(confirm, /restoreSafetyApi\.writeBackupLocalKeys\(window\.localStorage, backup\.settings\)/);
});

test('index.html shows the backup date and the binding counts in the restore preview and confirm dialog', () => {
  assert.match(html, /<script src="\.\/packmaster-restore-preview\.js"><\/script>/);
  assert.match(html, /const restorePreviewApi = window\.PackMasterRestorePreview;/);
  const fileHandler = html.slice(html.indexOf('const handleWorkspaceRestoreFile'), html.indexOf('const handleConfirmWorkspaceRestore'));
  assert.match(fileHandler, /restorePreviewApi\.describeRestoreImpact\(/);
  const confirm = html.slice(html.indexOf('const handleConfirmWorkspaceRestore'), html.indexOf('const handleExportPDF'));
  assert.match(confirm, /restorePreviewApi\.buildRestoreConfirmMessage\(/);
  assert.match(html, /data-pm-restore-impact/);
});

test('describeRestoreImpact exposes currentBindingCountLabel for known and unknown counts', () => {
  const knownImpact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: 5 });
  assert.equal(knownImpact.currentBindingCountLabel, '5');

  const unknownImpact = preview.describeRestoreImpact({ backup: bindingsBackup, currentBindingCount: null });
  assert.equal(unknownImpact.currentBindingCountLabel, 'ไม่ทราบจำนวน (อ่านไม่ครบ)');
});

test('index.html restore preview renders currentBindingCountLabel and passes loadErrors and error-aware binding count', () => {
  assert.match(html, /restorePreview\.impact\.currentBindingCountLabel/);
  assert.doesNotMatch(html, /restorePreview\.impact\.willReplaceBindingCount/);

  const fileHandler = html.slice(html.indexOf('const handleWorkspaceRestoreFile'), html.indexOf('const handleConfirmWorkspaceRestore'));
  assert.match(fileHandler, /registryAssignmentsError \? null :/);
  assert.match(fileHandler, /loadErrors:/);
});

console.log('PackMaster restore preview tests passed');
