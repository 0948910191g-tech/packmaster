import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const matcherApi = require('../packmaster-registry-matcher.js');
const identityApi = require('../packmaster-registry-identity.js');
const bootstrap = require('../packmaster-local-registry-bootstrap.js');

const registry = JSON.parse(fs.readFileSync(new URL('../data/packmaster-marketplace-registry.json', import.meta.url), 'utf8'));
const assignments = JSON.parse(fs.readFileSync(new URL('../data/packmaster-registry-assignments.json', import.meta.url), 'utf8'));

test('bundled local baseline contains the current marketplace registry and verified names', () => {
  const cleanRegistry = registryApi.validateStore(registry);
  const cleanAssignments = matcherApi.validateAssignments(assignments);
  assert.equal(cleanRegistry.platforms.TIKTOK.summary.listedProductCount, 121);
  assert.equal(cleanRegistry.platforms.TIKTOK.summary.skuModelRowCount, 161);
  assert.equal(cleanRegistry.platforms.SHOPEE.summary.listedProductCount, 126);
  assert.equal(cleanRegistry.platforms.SHOPEE.summary.skuModelRowCount, 156);
  assert.equal(cleanAssignments.entries.length, 78);
  assert.equal(cleanAssignments.entries.filter(entry => entry.identityType === 'catalog_row').length, 32);
  assert.ok(cleanAssignments.entries.some(entry => entry.platform === 'SHOPEE'));
  assert.ok(cleanAssignments.entries.some(entry => entry.platform === 'TIKTOK'));
});

test('local baseline fills an empty browser registry without downgrading newer local captures', () => {
  const empty = registryApi.createEmptyStore(new Date('2026-01-01T00:00:00Z'));
  const merged = bootstrap.mergeRegistryBaseline(empty, registry, registryApi);
  assert.equal(merged.platforms.TIKTOK.summary.listedProductCount, 121);
  assert.equal(merged.platforms.SHOPEE.summary.listedProductCount, 126);

  const newerShopee = {
    ...merged.platforms.SHOPEE,
    source: { ...merged.platforms.SHOPEE.source, captureDate: '2099-01-01T00:00:00.000Z' }
  };
  const newerLocal = registryApi.replacePlatformRegistry(merged, newerShopee, new Date('2099-01-01T00:00:00Z'));
  const preserved = bootstrap.mergeRegistryBaseline(newerLocal, registry, registryApi);
  assert.equal(preserved.platforms.SHOPEE.source.captureDate, '2099-01-01T00:00:00.000Z');
});

test('local user names win over the Git baseline while preserving baseline-only assignments', () => {
  const baseline = matcherApi.validateAssignments(assignments);
  const baselineEntry = baseline.entries[0];
  const local = matcherApi.validateAssignments({
    schema: baseline.schema,
    version: baseline.version,
    entries: [
      { ...baselineEntry, shortName: 'stale local name' },
      {
        platform: 'SHOPEE',
        sellerSku: 'LOCAL-ONLY-SYNTHETIC',
        productId: 'local-product',
        modelId: 'local-model',
        shortName: 'local only'
      }
    ]
  });
  const merged = bootstrap.mergeAssignmentBaseline(local, baseline, matcherApi);
  const sameSku = merged.entries.find(entry =>
    entry.platform === baselineEntry.platform &&
    matcherApi.normalizeSku(entry.sellerSku) === matcherApi.normalizeSku(baselineEntry.sellerSku));
  assert.equal(sameSku.shortName, 'stale local name');
  assert.ok(merged.entries.some(entry => entry.sellerSku === 'LOCAL-ONLY-SYNTHETIC'));
  assert.ok(merged.entries.length >= baseline.entries.length);
});

test('Git page loads the local registry baseline module before the app runs', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /packmaster-local-registry-bootstrap\.js/);
  assert.match(html, /localRegistryBootstrapApi\.loadBaselines/);
  assert.match(html, /marketplaceRegistryApi\.saveStore\(window\.localStorage, mergedRegistry\)/);
  assert.match(html, /localRegistryBootstrapApi\.ensureRegistryAssignments\(/);
  assert.match(html, /registryMatcherApi\.saveLocalAssignments\(window\.localStorage, completeAssignments\)/);
});

test('local bootstrap does not fabricate default names for unassigned rows, leaving exactly 85 verified entries', () => {
  const merged = bootstrap.mergeAssignmentBaseline(
    matcherApi.newAssignments(),
    assignments,
    matcherApi
  );
  const complete = bootstrap.ensureRegistryAssignments(
    registry,
    merged,
    registryApi,
    matcherApi,
    identityApi
  );
  assert.equal(complete.entries.length, 88, 'Must contain exactly 88 verified entries (78 baseline + 10 promoted Shopee seller_sku)');
  assert.equal(complete.entries.some(e => e.shortName.length > 40), false, 'Must not contain synthetic names > 40 chars');
  assert.equal(complete.entries.some(e => e.shortName.includes('Official Jersey')), false, 'Must not fabricate default name for unassigned rows');

  // Verify unassigned row resolves as unmatched
  const index = identityApi.buildIndex(registry, registryApi);
  const prepared = matcherApi.prepareAssignments(complete);
  const tiktokRows = registryApi.getNameableRows(registry.platforms.TIKTOK, 'TIKTOK');
  const jerseyRow = tiktokRows.find(r => String(r.productName || '').includes('Official Jersey'));
  const ev = bootstrap.getRowEvidence('TIKTOK', jerseyRow, index, matcherApi);
  const match = matcherApi.match(index, 'TIKTOK', {}, complete, { resolve: () => ev }, prepared);
  assert.equal(match.status, 'unmatched', 'Unassigned row must resolve as unmatched');
});

test('bootstrap reuses existing catalog_row shortName for seller_sku assignment preventing name conflict', () => {
  const merged = bootstrap.mergeAssignmentBaseline(
    matcherApi.newAssignments(),
    assignments,
    matcherApi
  );
  const complete = bootstrap.ensureRegistryAssignments(
    registry,
    merged,
    registryApi,
    matcherApi,
    identityApi
  );
  const index = identityApi.buildIndex(registry, registryApi);
  const prepared = matcherApi.prepareAssignments(complete);

  // Test the 10 Shopee rows that have pre-existing catalog_row assignments
  const shopeeRows = registryApi.getNameableRows(registry.platforms.SHOPEE, 'SHOPEE');
  let checkedConflicts = 0;
  for (const row of shopeeRows) {
    const ev = bootstrap.getRowEvidence('SHOPEE', row, index, matcherApi);
    if (!ev || ev.identityType !== 'seller_sku') continue;
    const catProbe = matcherApi.makeAssignment('SHOPEE', { ...ev, identityType: 'catalog_row' }, 'probe');
    const catKey = matcherApi.assignmentKey(catProbe);
    const existingCatalog = assignments.entries.find(entry => matcherApi.assignmentKey(entry) === catKey);
    if (existingCatalog) {
      const matchResult = matcherApi.match(index, 'SHOPEE', {}, complete, { resolve: () => ev }, prepared);
      assert.notEqual(matchResult.reason, 'registry_name_conflict_or_stale');
      assert.equal(matchResult.status, 'matched');
      assert.equal(matchResult.assignment.shortName, existingCatalog.shortName);
      checkedConflicts++;
    }
  }
  assert.equal(checkedConflicts, 10);
});

test('bootstrap purges legacy synthetic auto-generated names from localStorage while preserving baseline and custom user names', () => {
  const index = identityApi.buildIndex(registry, registryApi);
  let polluted = matcherApi.validateAssignments(assignments);

  // Populate polluted assignments with defaultInternalName for all rows
  for (const platform of registryApi.PLATFORMS) {
    const rows = registryApi.getNameableRows(registry.platforms[platform], platform);
    for (const row of rows) {
      const ev = bootstrap.getRowEvidence(platform, row, index, matcherApi);
      if (!ev) continue;
      const probe = matcherApi.makeAssignment(platform, ev, 'probe');
      const key = matcherApi.assignmentKey(probe);
      if (polluted.entries.some(e => matcherApi.assignmentKey(e) === key)) continue;
      const defName = bootstrap.defaultInternalName(row, ev);
      if (defName) {
        polluted = matcherApi.upsertAssignment(polluted, platform, ev, defName);
      }
    }
  }

  // Add a genuine human-saved custom name on an unassigned row
  const tiktokRows = registryApi.getNameableRows(registry.platforms.TIKTOK, 'TIKTOK');
  const customRow = tiktokRows.find(r => String(r.productName || '').includes('Official Jersey') && r.variantName === 'S');
  assert.ok(customRow, 'Must find Jersey S row');
  const customEv = bootstrap.getRowEvidence('TIKTOK', customRow, index, matcherApi);
  polluted = matcherApi.upsertAssignment(polluted, 'TIKTOK', customEv, 'เสื้อ S');

  const merged = bootstrap.mergeAssignmentBaseline(polluted, assignments, matcherApi);
  const sanitized = bootstrap.ensureRegistryAssignments(registry, merged, registryApi, matcherApi, identityApi, assignments);

  // Verify synthetic auto-generated names were purged
  assert.equal(sanitized.entries.some(e => e.shortName.includes('Official Jersey')), false, 'Synthetic Jersey names must be purged');
  assert.equal(sanitized.entries.some(e => e.shortName.length > 40), false, 'Names > 40 chars must be purged');

  // Verify genuine human-saved custom name was preserved
  assert.equal(sanitized.entries.some(e => e.shortName === 'เสื้อ S'), true, 'Genuine custom name must be preserved');

  // Verify all 75 baseline entries remain intact
  for (const baseEntry of assignments.entries) {
    const key = matcherApi.assignmentKey(baseEntry);
    assert.ok(sanitized.entries.some(e => matcherApi.assignmentKey(e) === key), `Baseline entry ${key} must remain intact`);
  }

  // 78 baseline + 10 promoted + 1 custom = 89
  assert.equal(sanitized.entries.length, 89, `Expected 89 entries, got ${sanitized.entries.length}`);
});

test('all 15 pre-existing TikTok seller SKU assignments match cleanly with registry_exact_verified', () => {
  const cleanRegistry = registryApi.validateStore(registry);
  const cleanAssignments = matcherApi.validateAssignments(assignments);
  const index = identityApi.buildIndex(cleanRegistry, registryApi);
  const prepared = matcherApi.prepareAssignments(cleanAssignments);

  // Baseline TikTok seller SKU assignments with no variantName
  const baselineWithoutVariant = cleanAssignments.entries.filter(e =>
    e.platform === 'TIKTOK' && e.identityType === 'seller_sku' && e.variantName === null
  );

  const tiktokRows = registryApi.getNameableRows(cleanRegistry.platforms.TIKTOK, 'TIKTOK');
  // Find rows where catalog row carries a variantName but baseline assignment had variantName === null
  const targetRows = tiktokRows.filter(row => {
    if (!row.variantName) return false;
    const ev = bootstrap.getRowEvidence('TIKTOK', row, index, matcherApi);
    if (!ev || ev.identityType !== 'seller_sku') return false;
    return baselineWithoutVariant.some(b =>
      matcherApi.normalizeSku(b.sellerSku) === matcherApi.normalizeSku(row.sellerSku) &&
      b.productId === row.productId
    );
  });

  assert.equal(targetRows.length, 15, 'Must identify all 15 pre-existing TikTok seller SKU rows with catalog variant text');

  for (const row of targetRows) {
    const ev = bootstrap.getRowEvidence('TIKTOK', row, index, matcherApi);
    const result = matcherApi.match(index, 'TIKTOK', {}, cleanAssignments, { resolve: () => ev }, prepared);
    assert.equal(result.status, 'matched', `Row ${row.sellerSku} must match`);
    assert.equal(result.reason, 'registry_exact_verified', `Row ${row.sellerSku} must have reason registry_exact_verified`);
    assert.ok(result.assignment.shortName, `Row ${row.sellerSku} must carry assigned shortName`);
  }
});
