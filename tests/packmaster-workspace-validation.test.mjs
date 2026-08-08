import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const workspace = require(path.resolve(__dirname, '../packmaster-workspace.js'));

const base = workspace.createBackup({
  appVersion: 'validation-test',
  settings: { thermalMode: true },
  skuRules: [{ id: 'safe-1', keyword: 'SANITIZED PRODUCT', shortName: 'ชื่อภายใน1' }],
  batches: [],
  batchOrders: []
}, new Date('2026-08-08T14:00:00.000Z'));

assert.throws(
  () => workspace.validateBackup({ ...base, skuRules: [{ keyword: '', shortName: 'x' }] }),
  /skuRules/i,
  'empty keyword must be rejected before restore writes'
);

assert.throws(
  () => workspace.validateBackup({ ...base, skuRules: [{ keyword: 'x', shortName: '' }] }),
  /skuRules/i,
  'empty shortName must be rejected before restore writes'
);

assert.throws(
  () => workspace.validateBackup({ ...base, skuRules: [{ keyword: 123, shortName: 'x' }] }),
  /skuRules/i,
  'non-string keyword must be rejected before restore writes'
);

console.log('PackMaster workspace strict validation tests passed');
