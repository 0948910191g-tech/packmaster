import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../packmaster-workspace.js');
const indexPath = path.resolve(__dirname, '../index.html');

assert.ok(fs.existsSync(workspacePath), 'packmaster-workspace.js must exist');

const require = createRequire(import.meta.url);
const workspace = require(workspacePath);

assert.equal(workspace.SCHEMA, 'packmaster-workspace-backup');
assert.equal(workspace.VERSION, 1);
assert.equal(typeof workspace.createBackup, 'function');
assert.equal(typeof workspace.validateBackup, 'function');
assert.equal(typeof workspace.getBackupSummary, 'function');
assert.equal(typeof workspace.collectBackupPayload, 'function');
assert.equal(typeof workspace.replaceWorkspaceBatches, 'function');

const payload = {
  appVersion: 'test',
  settings: { thermalMode: true },
  skuRules: [{ keyword: 'SANITIZED HOYA 5', shortName: 'หมูเด้ง5' }],
  batches: [{ id: 'batch-1', name: '8 Aug / Batch #001' }],
  batchOrders: [{ batchId: 'batch-1', orders: [{ id: 'order-1', platform: 'TIKTOK' }] }]
};

const backup = workspace.createBackup(payload, new Date('2026-08-08T12:00:00.000Z'));
assert.equal(backup.schema, 'packmaster-workspace-backup');
assert.equal(backup.version, 1);
assert.equal(backup.createdAt, '2026-08-08T12:00:00.000Z');
assert.equal(backup.appVersion, 'test');
assert.deepEqual(workspace.validateBackup(backup), backup);
assert.deepEqual(workspace.getBackupSummary(backup), {
  skuRules: 1,
  batches: 1,
  orders: 1,
  createdAt: '2026-08-08T12:00:00.000Z'
});

payload.skuRules[0].shortName = 'mutated-after-create';
assert.equal(backup.skuRules[0].shortName, 'หมูเด้ง5', 'createBackup must not share mutable references with caller payload');

const invalidCases = [
  [{ ...backup, schema: 'wrong' }, /schema/i],
  [{ ...backup, version: 999 }, /version/i],
  [{ ...backup, skuRules: {} }, /skuRules/i],
  [{ ...backup, batches: {} }, /batches/i],
  [{ ...backup, batchOrders: {} }, /batchOrders/i],
  [{ ...backup, batchOrders: [{ orders: [] }] }, /batchId/i],
  [{ ...backup, batches: [{ id: 'dup' }, { id: 'dup' }], batchOrders: [] }, /duplicate/i],
  [{ ...backup, batches: [{ id: 'batch-1' }], batchOrders: [{ batchId: 'missing', orders: [] }] }, /missing/i]
];

for (const [candidate, expectedMessage] of invalidCases) {
  assert.throws(() => workspace.validateBackup(candidate), expectedMessage);
}

const fakeStore = new Map([
  ['old-a', { meta: { id: 'old-a', name: 'Old A' }, orders: [{ id: 'old-order-a' }] }],
  ['old-b', { meta: { id: 'old-b', name: 'Old B' }, orders: [] }]
]);
const calls = [];
const fakeBatchApi = {
  async listBatches() {
    return Array.from(fakeStore.values()).map(row => ({ ...row.meta }));
  },
  async loadBatch(id) {
    const row = fakeStore.get(id);
    return row ? JSON.parse(JSON.stringify(row)) : { meta: null, orders: [] };
  },
  async deleteBatch(id) {
    calls.push(['delete', id]);
    fakeStore.delete(id);
  },
  async saveBatch(meta, orders) {
    calls.push(['save', meta.id, orders.length]);
    fakeStore.set(meta.id, { meta: JSON.parse(JSON.stringify(meta)), orders: JSON.parse(JSON.stringify(orders)) });
    return meta;
  }
};

const collected = await workspace.collectBackupPayload({
  batchApi: fakeBatchApi,
  skuRules: [{ keyword: 'A', shortName: 'B' }],
  settings: { thermalMode: false },
  appVersion: 'collect-test'
});
assert.equal(collected.batches.length, 2);
assert.equal(collected.batchOrders.length, 2);
assert.equal(collected.batchOrders.find(row => row.batchId === 'old-a').orders.length, 1);
assert.equal(collected.settings.thermalMode, false);
assert.equal(collected.appVersion, 'collect-test');

const replacement = workspace.createBackup({
  appVersion: 'restore-test',
  settings: { thermalMode: true },
  skuRules: [],
  batches: [
    { id: 'new-1', name: 'Restored One' },
    { id: 'new-2', name: 'Restored Two' }
  ],
  batchOrders: [
    { batchId: 'new-1', orders: [{ id: 'restored-order' }] },
    { batchId: 'new-2', orders: [] }
  ]
}, new Date('2026-08-08T13:00:00.000Z'));

await workspace.replaceWorkspaceBatches(replacement, fakeBatchApi);
assert.deepEqual(Array.from(fakeStore.keys()).sort(), ['new-1', 'new-2']);
assert.equal(fakeStore.get('new-1').orders.length, 1);
assert.ok(calls.some(call => call[0] === 'delete' && call[1] === 'old-a'));
assert.ok(calls.some(call => call[0] === 'delete' && call[1] === 'old-b'));
assert.ok(calls.some(call => call[0] === 'save' && call[1] === 'new-1'));

const callsBeforeInvalidReplace = calls.length;
await assert.rejects(
  () => workspace.replaceWorkspaceBatches({ ...replacement, schema: 'invalid' }, fakeBatchApi),
  /schema/i
);
assert.equal(calls.length, callsBeforeInvalidReplace, 'invalid backup must fail validation before any write');

const html = fs.readFileSync(indexPath, 'utf8');
const requiredUiMarkers = [
  '<script src="./packmaster-workspace.js"></script>',
  'const workspaceApi = window.PackMasterWorkspace;',
  'const [restorePreview, setRestorePreview] = useState(null);',
  'const [workspaceBusy, setWorkspaceBusy] = useState(false);',
  'const handleWorkspaceBackup = async () => {',
  'const handleWorkspaceRestoreFile = async (event) => {',
  'const handleConfirmWorkspaceRestore = async () => {',
  'ความปลอดภัย Workspace',
  'สำรอง Workspace',
  'กู้คืน Workspace',
  'Replace Workspace'
];

for (const marker of requiredUiMarkers) {
  assert.ok(html.includes(marker), `index.html must include Workspace Safety marker: ${marker}`);
}

assert.ok(html.includes('for (let i = 0; i < MappedOrders.length; i++)'), 'Save PDF must keep full MappedOrders export loop');
assert.ok(html.includes('{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Print area must keep full MappedOrders rendering');

console.log('PackMaster workspace backup/restore helper and UI integration tests passed');
