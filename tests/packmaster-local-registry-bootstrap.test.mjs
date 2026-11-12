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

test('local baseline merge preserves v2 manual SKU aliases from the existing store', () => {
  const local = matcherApi.validateAssignments({
    ...matcherApi.newAssignments(),
    version: 2,
    entries: [{
      platform: 'TIKTOK', identityType: 'catalog_row', sellerSku: null,
      productId: 'synthetic-product', modelId: null, variantName: 'synthetic-variant',
      shortName: 'Approved synthetic name',
      manualSkuAliases: [{ sellerSku: 'SKU-ALIAS', productText: 'Synthetic product', variantText: 'Synthetic variant' }],
      manualSkuRegistryProductName: 'Synthetic listing'
    }]
  });
  const merged = bootstrap.mergeAssignmentBaseline(local, matcherApi.newAssignments(), matcherApi);
  assert.equal(merged.version, 2);
  assert.deepEqual(merged.entries[0].manualSkuAliases, local.entries[0].manualSkuAliases);
  assert.equal(merged.entries[0].manualSkuRegistryProductName, 'Synthetic listing');
});

test('Git page uses read-only local startup inspection and does not auto-load a bundled baseline', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /packmaster-local-registry-bootstrap\.js/);
  assert.match(html, /loadLocalStartupSnapshot\(window\.localStorage/);
  assert.doesNotMatch(html, /localRegistryBootstrapApi\.loadBaselines/);
  assert.doesNotMatch(html, /saveStore\(window\.localStorage, mergedRegistry\)/);
  assert.doesNotMatch(html, /saveLocalAssignments\(window\.localStorage, completeAssignments\)/);
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

test('startup inspection preserves corrupt raw local data and reports recovery errors without writing', () => {
  const corruptRegistryRaw = '{"schema":"damaged-local-registry"';
  const corruptAssignmentsRaw = '{"schema":"damaged-local-assignments"';
  const corruptRulesRaw = '{"local":"damaged-rules"';
  const values = new Map([
    [registryApi.STORAGE_KEY, corruptRegistryRaw],
    [matcherApi.LOCAL_ASSIGNMENTS_KEY, corruptAssignmentsRaw],
    ['skuMappingRules', corruptRulesRaw]
  ]);
  const writes = [];
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { writes.push([key, value]); values.set(key, value); }
  };

  const snapshot = bootstrap.loadLocalStartupSnapshot(storage, {
    registryApi,
    matcherApi,
    sanitizeSkuRule: () => null
  });

  assert.match(snapshot.marketplaceRegistry.error, /Unexpected|JSON|position|end/i);
  assert.match(snapshot.registryAssignmentsError, /อ่านไม่ได้|corrupt|invalid/i);
  assert.match(snapshot.skuRulesError, /อ่านไม่ได้|corrupt|invalid/i);
  assert.equal(snapshot.registryAssignments, null);
  assert.equal(snapshot.skuRules, null);
  assert.equal(snapshot.canPersistSkuRules, false);
  assert.deepEqual(writes, []);
  assert.equal(values.get(registryApi.STORAGE_KEY), corruptRegistryRaw);
  assert.equal(values.get(matcherApi.LOCAL_ASSIGNMENTS_KEY), corruptAssignmentsRaw);
  assert.equal(values.get('skuMappingRules'), corruptRulesRaw);
});

test('startup module or validator failure fails closed instead of producing writable empty state', () => {
  const writes = [];
  const storage = { getItem: () => '{broken', setItem: (...args) => writes.push(args) };
  const snapshot = bootstrap.loadLocalStartupSnapshot(storage, {
    registryApi: null,
    matcherApi: null,
    sanitizeSkuRule: null
  });
  assert.equal(snapshot.canPersistSkuRules, false);
  assert.match(snapshot.skuRulesError, /ไม่พร้อม/);
  assert.match(snapshot.registryAssignmentsError, /ไม่พร้อม/);
  assert.deepEqual(writes, []);
});

test('startup snapshot preserves valid local names and keeps a new profile empty', () => {
  const savedAssignments = matcherApi.validateAssignments({
    ...matcherApi.newAssignments(),
    entries: [{
      platform: 'TIKTOK',
      identityType: 'catalog_row',
      sellerSku: null,
      productId: 'local-product-1',
      modelId: 'local-model-1',
      variantName: 'ข้อความสินค้าแบบยาวที่เจ้าของยืนยันไว้',
      shortName: 'ชื่อยาวที่เจ้าของยืนยันไว้'
    }]
  });
  const values = new Map([
    [matcherApi.LOCAL_ASSIGNMENTS_KEY, JSON.stringify(savedAssignments)],
    ['skuMappingRules', JSON.stringify([{ keyword: 'synthetic', shortName: 'local', id: 'rule-1' }])]
  ]);
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: () => assert.fail('Startup must not write local storage')
  };
  const snapshot = bootstrap.loadLocalStartupSnapshot(storage, {
    registryApi,
    matcherApi,
    sanitizeSkuRule: rule => rule
  });

  assert.equal(snapshot.registryAssignments.entries[0].shortName, 'ชื่อยาวที่เจ้าของยืนยันไว้');
  assert.equal(snapshot.marketplaceRegistry.store.platforms.TIKTOK, undefined);
  assert.equal(snapshot.marketplaceRegistry.store.platforms.SHOPEE, undefined);
  assert.equal(snapshot.skuRules[0].shortName, 'local');
  assert.equal(snapshot.registryAssignmentsError, '');
  assert.equal(snapshot.skuRulesError, '');

  const emptyStorage = { getItem: () => null, setItem: () => assert.fail('Startup must not write local storage') };
  const empty = bootstrap.loadLocalStartupSnapshot(emptyStorage, { registryApi, matcherApi, sanitizeSkuRule: rule => rule });
  assert.deepEqual(empty.registryAssignments.entries, []);
  assert.deepEqual(empty.skuRules, []);
  assert.equal(empty.marketplaceRegistry.store.platforms.TIKTOK, undefined);
  assert.equal(empty.marketplaceRegistry.store.platforms.SHOPEE, undefined);
});

test('registry name filters combine platform, brand, status, search, and fifty-row pagination', () => {
  const rows = Array.from({ length: 121 }, (_, index) => {
    const brands = ['HOYA', 'HAKU', 'Excare', 'nono', 'unbranded'];
    const brand = brands[index % brands.length];
    return {
      platform: index < 101 ? 'TIKTOK' : 'SHOPEE',
      productId: `product-${index}`,
      sellerSku: `sku-${index}`,
      productName: `${brand} Catalog Item ${index}`,
      assigned: index % 2 === 0
    };
  });

  const filtered = bootstrap.filterRegistryNameRows(rows, {
    platform: 'TIKTOK',
    brand: 'HOYA',
    query: 'catalog item',
    status: 'unnamed',
    statusMatch: (row, status) => status === 'unnamed' && !row.assigned
  });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every(row => row.platform === 'TIKTOK' && row.productName.startsWith('HOYA') && !row.assigned));
  assert.equal(bootstrap.getRegistryBrand({ title: 'Nono soft pack' }), 'nono');
  assert.equal(bootstrap.getRegistryBrand({ productName: 'Generic Wipes' }), 'other');

  const allTikTok = bootstrap.filterRegistryNameRows(rows, { platform: 'TIKTOK', query: 'catalog item' });
  const first = bootstrap.paginateRegistryRows(allTikTok, 1, 50);
  const second = bootstrap.paginateRegistryRows(allTikTok, 2, 50);
  const last = bootstrap.paginateRegistryRows(allTikTok, 3, 50);
  assert.equal(allTikTok.length, 101);
  assert.equal(first.pageCount, 3);
  assert.equal(first.rows.length, 50);
  assert.equal(second.rows.length, 50);
  assert.equal(last.rows.length, 1);
  assert.equal(bootstrap.paginateRegistryRows(allTikTok, 9, 50).page, 3);
});

test('registry name UI exposes brand scope, active counts, and a clear-all action', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /data-pm-registry-brand-filters/);
  assert.match(html, /data-pm-brand-chip=\{option.value\}/);
  assert.match(html, /setRegistryBrandFilter\(option.value\)/);
  assert.match(html, /HOYA_BABY/);
  assert.match(html, /HAKU_BABY/);
  assert.match(html, /EXCARE/);
  assert.match(html, /NONO/);
  assert.match(html, /HOYA_OTHER/);
  assert.match(html, /ล้างตัวกรองทั้งหมด/);
  assert.match(html, /brandScopedRegistryNamingRows\.filter\(/);
  assert.match(html, /registryNameRowMatches\.get\(row\)/);
  assert.match(html, /registryNamePageSize = 50/);
});
