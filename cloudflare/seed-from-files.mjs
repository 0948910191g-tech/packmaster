import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const [tiktokFile, shopeeFile, outputSqlFile] = process.argv.slice(2);
if (!tiktokFile || !shopeeFile || !outputSqlFile) {
  throw new Error('Expected TikTok registry JSON, Shopee registry JSON and SQL output path');
}
let store = registryApi.createEmptyStore();
for (const [platform, filename] of [['TIKTOK', tiktokFile], ['SHOPEE', shopeeFile]]) {
  const source = JSON.parse(readFileSync(filename, 'utf8'));
  store = registryApi.replacePlatformRegistry(store, registryApi.validatePlatformRegistry(source, platform));
}
const payload = JSON.stringify(registryApi.validateStore(store));
const bytes = Buffer.byteLength(payload, 'utf8');
if (bytes >= 1900000) throw new Error('Combined catalog exceeds safe D1 row size');

// D1 has a SQL statement-size limit, so insert a valid empty JSON structure and append rows
// with json_insert in small statements. No existing registry row may be overwritten.
const safeLiteral = value => "'" + String(value).replace(/'/g, "''") + "'";
const marker = 'ppg-initial-import-' + randomUUID();
const emptyStore = JSON.parse(payload);
for (const platform of ['TIKTOK', 'SHOPEE']) {
  for (const field of ['products', 'skuRows', 'productsWithoutAnySellerSku']) {
    emptyStore.platforms[platform][field] = [];
  }
}
const initial = JSON.stringify(emptyStore);
const statements = [
  'INSERT OR IGNORE INTO packmaster_marketplace_registry (id, registry_json, revision, updated_at, updated_by) VALUES (1, '
    + safeLiteral(initial) + ", 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), " + safeLiteral(marker) + ');'
];

for (const platform of ['TIKTOK', 'SHOPEE']) {
  for (const field of ['products', 'skuRows', 'productsWithoutAnySellerSku']) {
    let pairs = [];
    let bytesInBatch = 0;
    const flush = () => {
      if (pairs.length === 0) return;
      statements.push(
        'UPDATE packmaster_marketplace_registry SET registry_json = json_insert(registry_json, '
        + pairs.join(', ') + ') WHERE id = 1 AND updated_by = ' + safeLiteral(marker) + ';'
      );
      pairs = [];
      bytesInBatch = 0;
    };
    for (const item of store.platforms[platform][field]) {
      const path = '$.platforms.' + platform + '.' + field + '[#]';
      const pair = safeLiteral(path) + ', json(' + safeLiteral(JSON.stringify(item)) + ')';
      const pairSize = Buffer.byteLength(pair, 'utf8');
      if (pairSize > 39000) throw new Error('Single catalog row is too large for a D1 statement');
      if (pairs.length >= 12 || bytesInBatch + pairSize > 39000) flush();
      pairs.push(pair);
      bytesInBatch += pairSize;
    }
    flush();
  }
}

const sqlText = statements.join('\n') + '\n';
const memory = new DatabaseSync(':memory:');
memory.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
memory.exec(sqlText);
const saved = memory.prepare('SELECT registry_json, updated_by FROM packmaster_marketplace_registry WHERE id = 1').get();
if (!saved || saved.updated_by !== marker) throw new Error('Staging insert did not create the expected registry');
const actual = registryApi.validateStore(JSON.parse(saved.registry_json));
if (JSON.stringify(actual) !== payload) throw new Error('Staged SQL result does not match source catalogs');
writeFileSync(outputSqlFile, sqlText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

const summary = registryApi.getSummary(store);
console.log(JSON.stringify({
  result: 'Staged SQL locally verified, no Cloud writes made',
  products: summary.TIKTOK.productCount + summary.SHOPEE.productCount,
  skuRows: summary.TIKTOK.skuRowCount + summary.SHOPEE.skuRowCount,
  tiktokProducts: summary.TIKTOK.productCount,
  shopeeProducts: summary.SHOPEE.productCount,
  d1PayloadBytes: bytes,
  sqlStatements: statements.length,
  maxSqlStatementBytes: Math.max(...statements.map(x => Buffer.byteLength(x, 'utf8'))),
  sha256: createHash('sha256').update(payload).digest('hex'),
  stagingMarker: marker
}));
