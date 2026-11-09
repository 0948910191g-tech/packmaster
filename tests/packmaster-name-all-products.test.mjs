import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const identityApi = require('../packmaster-registry-identity.js');
const matcher = require('../packmaster-registry-matcher.js');
const registry = require('../data/packmaster-marketplace-registry.json');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('naming list includes all SKU rows and products without any SKU rows', () => {
  const before = JSON.stringify(registry);
  for (const platform of ['TIKTOK', 'SHOPEE']) {
    const data = registry.platforms[platform];
    const rows = registryApi.getNameableRows(data, platform);
    const idField = platform === 'TIKTOK' ? 'productId' : 'itemId';
    const sourceIds = new Set(data.skuRows.map(row => row[idField]));
    const missing = data.products.filter(product => !sourceIds.has(product[idField]));
    const productOnly = rows.filter(row => row.sourceRowType === 'product_only');
    assert.equal(rows.length, data.skuRows.length + missing.length);
    assert.equal(productOnly.length, missing.length);
    assert.deepEqual(new Set(productOnly.map(row => row[idField])), new Set(missing.map(p => p[idField])));
    assert.ok(productOnly.every(row => row.sellerSku === null && row.modelId === null));
  }
  assert.equal(registryApi.getNameableRows(registry.platforms.TIKTOK, 'TIKTOK').length, 169);
  assert.equal(registryApi.getNameableRows(registry.platforms.SHOPEE, 'SHOPEE').length, 156);
  assert.equal(JSON.stringify(registry), before, 'naming view must not alter the marketplace source');
});

test('product without variants or SKU has exact Product ID assignment and can match explicit catalog text', () => {
  const platform = 'TIKTOK';
  const data = registry.platforms[platform];
  const row = registryApi.getNameableRows(data, platform).find(r => r.sourceRowType === 'product_only');
  assert.ok(row, 'real registry must contain a product-only listing');
  const index = identityApi.buildIndex(registry, registryApi);
  const source = { catalogText: row.productName };
  const evidence = identityApi.resolve(index, platform, source);
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.identityType, 'catalog_row');
  assert.equal(evidence.candidate.productId, row.productId);

  const assignments = matcher.upsertAssignment(matcher.newAssignments(), platform, evidence, 'ตั้งชื่อแพ็กเอง');
  assert.equal(assignments.entries.length, 1);
  assert.equal(assignments.entries[0].sellerSku, null);
  assert.equal(matcher.match(index, platform, source, assignments, identityApi).rule.shortName, 'ตั้งชื่อแพ็กเอง');

  assert.equal(identityApi.resolve(index, platform, { text: row.productName }).status, 'no_identity',
    'raw TikTok product title without explicit identity cannot become automatic match');
  assert.equal(matcher.match(index, 'SHOPEE', source, assignments, identityApi).status, 'unmatched',
    'product-only name must never cross platforms');
});

test('all actual nameable rows can be assigned without key collisions', () => {
  const index = identityApi.buildIndex(registry, registryApi);
  for (const platform of ['TIKTOK', 'SHOPEE']) {
    let assignments = matcher.newAssignments();
    const rows = registryApi.getNameableRows(registry.platforms[platform], platform);
    for (const [n, row] of rows.entries()) {
      const evidence = {
        status: 'found', identityType: 'catalog_row', sellerSku: null,
        candidate: {
          platform, productId: row.productId || row.itemId,
          modelId: row.modelId || null, variantName: row.variantName || null
        }
      };
      assignments = matcher.upsertAssignment(assignments, platform, evidence, 'แพ็ก ' + n);
    }
    assert.equal(assignments.entries.length, rows.length, 'every row requires its own unambiguous identity');
  }
});

test('one editable registry view offers status filters and reveals raw catalog on demand', () => {
  assert.match(html, /marketplaceRegistryApi\.getNameableRows\(selectedMarketplaceRegistry, marketplaceRegistryPlatformFilter\)/);
  assert.match(html, /registryNameStatusFilter/);
  assert.match(html, /ไม่มี Seller SKU/);
  assert.match(html, /ไม่มีแถว SKU\/ตัวเลือก/);
  assert.match(html, /data-pm-registry-raw-details/);
  assert.match(html, /visibleRegistryNameRows\.map\(\(row, index\) =>/);
});

test('naming status only counts a currently active Seller SKU assignment', () => {
  const start = html.indexOf('const getRegistryRowAssignment =');
  const end = html.indexOf('const hasDuplicateRegistrySku', start);
  assert.ok(start >= 0 && end > start);
  const candidate = { platform: 'TIKTOK', productId: 'stable-product', modelId: null, variantName: null };
  const oldCatalog = matcher.makeAssignment('TIKTOK',
    { status: 'found', identityType: 'catalog_row', candidate }, 'old catalog title');
  const currentEvidence = { status: 'found', identityType: 'seller_sku', sellerSku: 'UNIQUE-SKU', candidate };
  const activeSeller = matcher.makeAssignment('TIKTOK', currentEvidence, 'verified SKU title');
  const context = {
    registryMatcherApi: matcher,
    registryAssignments: matcher.validateAssignments({ ...matcher.newAssignments(), entries: [oldCatalog] }),
    getRegistryRowEvidence: () => currentEvidence
  };
  vm.createContext(context);
  vm.runInContext(html.slice(start, end) + String.fromCharCode(10) +
    'globalThis.findAssignment = getRegistryRowAssignment;', context);
  assert.equal(context.findAssignment('TIKTOK', {}), null, 'stale catalog name must not be marked as matched');
  context.registryAssignments = matcher.validateAssignments({
    ...matcher.newAssignments(), entries: [oldCatalog, activeSeller]
  });
  assert.equal(context.findAssignment('TIKTOK', {}).shortName, 'verified SKU title');
});
