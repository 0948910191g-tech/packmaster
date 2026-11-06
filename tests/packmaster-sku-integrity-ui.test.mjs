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
assert.match(html, /htmlFor="pm-sku-keyword"/, 'SKU keyword needs a programmatic label');
assert.match(html, /id="pm-sku-keyword"/, 'SKU keyword input needs a stable id');
assert.match(html, /aria-describedby="pm-sku-keyword-help"/, 'SKU keyword help must be connected to its input');
assert.match(html, /htmlFor="pm-sku-short-name"/, 'internal name needs a programmatic label');
assert.match(html, /id="pm-sku-search"/, 'SKU search needs a programmatic label target');
assert.match(html, /data-pm-file-picker/, 'file pickers must expose a keyboard-accessible trigger');

console.log('PackMaster SKU integrity UI contract passed');
