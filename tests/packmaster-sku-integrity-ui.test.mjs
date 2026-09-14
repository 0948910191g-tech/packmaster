import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /PackMasterSkuIntegrity/);
assert.match(html, /handleAuditSkuRules/);
assert.match(html, /handleRollbackSkuMigration/);
assert.match(html, /prepareRules\(/, 'mapping lifecycle must use shared integrity helper');
assert.match(html, /duplicateIds|rekeyed/, 'UI must report ID repair metadata');
assert.match(html, /conflicts/, 'different-output conflicts must be surfaced');
assert.match(html, /SKU_INTEGRITY_BACKUP_KEY/, 'migration must keep a rollback backup');
assert.match(html, /handleDeleteSkuRule/, 'delete must guard shared legacy IDs');

console.log('PackMaster SKU integrity UI contract passed');
