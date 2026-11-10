import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('all registry name rows have their own page navigation', () => {
  assert.match(html, /const \[registryNamePage, setRegistryNamePage\] = useState\(1\)/);
  assert.match(html, /visibleRegistryNameRows\.map\(\(row, index\) =>/);
  assert.match(html, /filteredRegistryNameRows\.length/);
  assert.match(html, /setRegistryNamePage\(page => Math\.min\(registryNamePageCount, page \+ 1\)\)/);
  assert.doesNotMatch(html, /\.slice\(0, 50\)\.map\(\(row, index\) =>/);
});
test('auto-generated name is not called confirmed in the registry table', () => {
  assert.match(html, /รวมชื่ออัตโนมัติ/);
  assert.match(html, /กรุณาตรวจสอบก่อนพิมพ์/);
  assert.match(html, /มีชื่อสำหรับจับคู่/);
  assert.doesNotMatch(html, /<th>ชื่อภายในที่ยืนยันแล้ว<\/th>/);
});
test('review distinguishes permanent registration and one-order correction', () => {
  assert.match(html, /บันทึกชื่อในทะเบียน \(เฉพาะ SKU ที่ระบุตัวได้\)/);
  assert.match(html, /ใช้ชื่อเฉพาะ Order นี้/);
  assert.match(html, /ไม่เพิ่มกฎเดาสินค้าอัตโนมัติ/);
});


test('actual registry naming pipeline keeps stale/conflicting rows unresolved and resolves an exact confirmed save', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const registryApi = require('../packmaster-marketplace-registry.js');
  const identityApi = require('../packmaster-registry-identity.js');
  const matcher = require('../packmaster-registry-matcher.js');
  const registry = require('../data/packmaster-marketplace-registry.json');
  const platform = 'SHOPEE';
  const catalogIndex = identityApi.buildIndex(registry, registryApi);
  const rows = registryApi.getNameableRows(registry.platforms[platform], platform);
  const row = rows.find(candidate => {
    const sku = matcher.normalizeSku(candidate.sellerSku || '');
    const matches = sku ? catalogIndex[platform].sellerSkus.get(sku) || [] : [];
    return matches.length === 1 && matches[0].productId === String(candidate.productId || candidate.itemId || '').trim() &&
      (matches[0].modelId || null) === (candidate.modelId || null) &&
      (candidate.modelId || (matches[0].variantName || null) === (candidate.variantName || null));
  });
  assert.ok(row, 'fixture must include a current unique Seller SKU row');

  const helperStart = html.indexOf('const getRegistryRowEvidence =');
  const helperEnd = html.indexOf('const saveRegistryRowAssignment =', helperStart);
  const pipelineStart = html.indexOf('const preparedRegistryAssignments = useMemo(');
  const pipelineEnd = html.indexOf('const registryNamePageSize =', pipelineStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart && pipelineStart > 0 && pipelineEnd > pipelineStart);
  const helperSource = html.slice(helperStart, helperEnd) +
    '\nglobalThis.resolveRegistryRow = getRegistryRowEvidence;';
  const pipelineSource = html.slice(pipelineStart, pipelineEnd) +
    '\nglobalThis.rowStatus = registryNameRowMatches.get(registryNamingRows[0]);' +
    'globalThis.nameStats = registryNameStats; globalThis.unresolvedRows = filteredRegistryNameRows;';
  const runPipeline = assignments => {
    const context = {
      registryMatcherApi: matcher, registryIdentityApi: identityApi, registryAssignments: assignments,
      marketplaceCatalogIndex: catalogIndex, marketplaceRegistry: registry, marketplaceRegistryPlatformFilter: platform,
      registryNamingRows: [row], marketplaceRegistrySearch: '', registryNameStatusFilter: 'unnamed',
      useMemo: callback => callback()
    };
    vm.createContext(context);
    vm.runInContext(helperSource, context);
    context.rowEvidence = context.resolveRegistryRow(platform, row);
    vm.runInContext(pipelineSource, context);
    return context;
  };

  const evidenceContext = runPipeline(matcher.newAssignments());
  const evidence = evidenceContext.rowEvidence;
  assert.equal(evidence.status, 'found');
  assert.equal(evidence.identityType, 'seller_sku');
  const staleOnly = matcher.upsertAssignment(matcher.newAssignments(), platform,
    { ...evidence, identityType: 'catalog_row', sellerSku: null }, 'Stale catalog name');
  const staleResult = runPipeline(staleOnly);
  assert.equal(staleResult.rowStatus.status, 'ambiguous');
  assert.equal(staleResult.rowStatus.reason, 'registry_name_conflict_or_stale');
  assert.equal(staleResult.nameStats.unnamed, 1);
  assert.equal(staleResult.unresolvedRows.length, 1);

  let conflicting = matcher.upsertAssignment(matcher.newAssignments(), platform, evidence, 'Current SKU name');
  conflicting = matcher.upsertAssignment(conflicting, platform,
    { ...evidence, identityType: 'catalog_row', sellerSku: null }, 'Different old catalog name');
  const conflictResult = runPipeline(conflicting);
  assert.equal(conflictResult.rowStatus.status, 'ambiguous');
  assert.equal(conflictResult.rowStatus.reason, 'registry_name_conflict_or_stale');
  assert.equal(conflictResult.nameStats.unnamed, 1);
  assert.equal(conflictResult.unresolvedRows.length, 1);
  assert.match(html, /rowMatch\?\.reason === 'registry_name_conflict_or_stale'/,
    'the table warning must use the unresolved matcher reason');

  const confirmed = matcher.saveConfirmedAssignment(conflicting, catalogIndex, platform, evidence, 'Confirmed exact name');
  const confirmedResult = runPipeline(confirmed);
  assert.equal(confirmedResult.rowStatus.status, 'matched');
  assert.equal(confirmedResult.rowStatus.assignment.shortName, 'Confirmed exact name');
  assert.equal(confirmedResult.nameStats.unnamed, 0);
  assert.equal(confirmedResult.unresolvedRows.length, 0);
});
test('absent assignments do not crash the recovery render, while malformed present data fails closed', async () => {
  const start = html.indexOf('const preparedRegistryAssignments = useMemo(');
  const end = html.indexOf('const registryNameRowMatches =', start);
  assert.ok(start >= 0 && end > start);
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const matcher = require('../packmaster-registry-matcher.js');
  const source = html.slice(start, end) + '\nglobalThis.prepared=preparedRegistryAssignments;';
  const nullContext = { registryMatcherApi: matcher, registryAssignments: null, useMemo: callback => callback() };
  vm.createContext(nullContext);
  vm.runInContext(source, nullContext);
  assert.equal(nullContext.prepared, null);

  const invalidContext = { registryMatcherApi: matcher, registryAssignments: { entries: [] }, useMemo: callback => callback() };
  vm.createContext(invalidContext);
  assert.throws(() => vm.runInContext(source, invalidContext), /Invalid registry SKU assignments/);
});
