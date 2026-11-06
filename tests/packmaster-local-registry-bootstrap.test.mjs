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
  assert.equal(cleanAssignments.entries.length, 75);
  assert.equal(cleanAssignments.entries.filter(entry => entry.identityType === 'catalog_row').length, 29);
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

test('local bootstrap auto-fills every current registry row without overwriting verified names', () => {
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
  let covered = 0;

  for (const platform of registryApi.PLATFORMS) {
    for (const row of registry.platforms[platform].skuRows) {
      const evidence = bootstrap.getRowEvidence(platform, row, index, matcherApi);
      assert.ok(evidence, `row identity is required for ${platform}`);
      const probe = matcherApi.makeAssignment(platform, evidence, 'probe');
      const key = matcherApi.assignmentKey(probe);
      const assignment = complete.entries.find(entry => matcherApi.assignmentKey(entry) === key);
      assert.ok(assignment, `missing assignment for ${platform} ${row.sellerSku || row.variantName || row.modelId}`);
      assert.ok(assignment.shortName.trim());
      covered += 1;
    }
  }

  assert.equal(covered, 317);
  const comboRow = registry.platforms.TIKTOK.skuRows.find(row =>
    row.variantName === 'คละ Peach 3กระปุก Kyoho Grape 3กระปุก');
  assert.ok(comboRow);
  const comboEvidence = bootstrap.getRowEvidence('TIKTOK', comboRow, index, matcherApi);
  const comboKey = matcherApi.assignmentKey(matcherApi.makeAssignment('TIKTOK', comboEvidence, 'probe'));
  const comboAssignment = complete.entries.find(entry => matcherApi.assignmentKey(entry) === comboKey);
  assert.equal(comboAssignment.shortName, 'คละ Peach 3กระปุก Kyoho Grape 3กระปุก');
});
