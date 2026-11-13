#!/usr/bin/env node
// PackMaster registry matcher benchmark (ticket 02).
// Read-only: records what the current matcher does on synthetic cases.
// It never changes matcher behavior. Synthetic registry and cases only; no customer data.
// Output is deterministic (no timestamps, no absolute paths) so repeated runs match.
'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const req = createRequire(__filename);
const registryApi = req(path.join(ROOT, 'packmaster-marketplace-registry.js'));
const identity = req(path.join(ROOT, 'packmaster-registry-identity.js'));
const matcher = req(path.join(ROOT, 'packmaster-registry-matcher.js'));
const registryFixture = req('./fixtures/registry.json');
const { requiredCoverage, cases } = req('./fixtures/cases.json');

const GROUP_OF_STATUS = { matched: 'matched', unmatched: 'review', ambiguous: 'ambiguous' };
const GROUP_ORDER = ['matched', 'review', 'ambiguous', 'error'];
const VALID_EXPECTED = new Set(['matched', 'review', 'ambiguous']);

// Build a marketplace source document in the same shape the registry validator expects.
function buildSource(platform, spec) {
  const tiktok = platform === 'TIKTOK';
  const idField = tiktok ? 'productId' : 'itemId';
  const nameField = tiktok ? 'productName' : 'title';
  const products = [];
  const skuRows = [];
  for (const p of spec.products) {
    const id = p[idField];
    const name = p[nameField];
    const variants = p.variants || [];
    const productSku = p.sellerSku || null;
    products.push({
      platform,
      [idField]: id,
      [nameField]: name,
      sellerSku: productSku,
      variants: variants.map(v => ({ variantName: v.variantName, sellerSku: v.sellerSku || null }))
    });
    if (tiktok && variants.length === 0) {
      skuRows.push({
        platform, [idField]: id, [nameField]: name, sellerSku: productSku,
        sellerSkuStatus: productSku ? 'present' : 'not_displayed',
        modelId: null, variantName: null, sourceRowType: 'product_sku'
      });
    }
    variants.forEach((v, i) => {
      const sku = v.sellerSku || null;
      skuRows.push({
        platform, [idField]: id, [nameField]: name, sellerSku: sku,
        sellerSkuStatus: sku ? 'present' : 'not_displayed',
        modelId: tiktok ? null : v.modelId,
        variantName: v.variantName,
        sourceRowType: 'variant',
        ...(tiktok ? { variantOrdinal: i + 1 } : {})
      });
    });
  }
  const withoutSku = products.filter(p => !p.sellerSku && !p.variants.some(v => v.sellerSku));
  const presentCount = skuRows.filter(row => row.sellerSku).length;
  return {
    schemaVersion: 1,
    registryType: 'marketplace_product_sku_source_registry',
    platform,
    source: { shop: spec.shop, captureDate: registryFixture.captureDate },
    products,
    skuRows,
    productsWithoutAnySellerSku: withoutSku.map(p => ({ [idField]: p[idField] })),
    pages: [{ products: products.length }],
    summary: {
      listedProductCount: products.length,
      uniqueProductIdCount: products.length,
      skuModelRowCount: skuRows.length,
      sellerSkuPresentRowCount: presentCount,
      sellerSkuMissingInRowsCount: skuRows.length - presentCount,
      productsWithoutAnySellerSkuCount: withoutSku.length
    }
  };
}

// A fixed store date keeps the output identical across runs even if the matcher reads timestamps.
const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

function buildIndex() {
  let store = registryApi.createEmptyStore(FIXED_NOW);
  for (const platform of ['TIKTOK', 'SHOPEE']) {
    store = registryApi.replacePlatformRegistry(store, buildSource(platform, registryFixture[platform]), FIXED_NOW);
  }
  return identity.buildIndex(store, registryApi);
}

// Replays the Review-screen save for each setup step, then runs the matcher on the case input.
function runCase(index, c) {
  let assignments = matcher.newAssignments();
  try {
    for (const step of c.setup || []) {
      const evidence = identity.resolve(index, step.platform, step.item);
      assignments = matcher.saveConfirmedAssignment(assignments, index, step.platform, evidence, step.shortName);
    }
  } catch (error) {
    return { setupError: error.message };
  }
  try {
    const result = matcher.match(index, c.platform, c.item, assignments, identity);
    const reason = result.reason || '-';
    // Append the fallback name (for example ellipsis_catalog_match) when it adds information.
    const evidenceReason = result.evidence?.reason || '';
    return {
      status: result.status,
      reason: evidenceReason && evidenceReason !== reason ? `${reason} (${evidenceReason})` : reason
    };
  } catch (error) {
    return { status: 'error', reason: `threw: ${error.message}` };
  }
}

const esc = value => String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

function main() {
  const index = buildIndex();
  const results = cases.map(c => {
    const run = runCase(index, c);
    if (run.setupError) {
      return { ...c, actualStatus: 'setup_error', actualGroup: 'error', reason: run.setupError, verdict: 'SETUP ERROR' };
    }
    const actualGroup = GROUP_OF_STATUS[run.status] || 'error';
    const verdict = actualGroup === c.expected ? 'OK' : 'WRONG';
    return { ...c, actualStatus: run.status, actualGroup, reason: run.reason, verdict };
  });

  const problems = [];
  const covered = new Set(cases.flatMap(c => c.covers || []));
  const missingCoverage = requiredCoverage.filter(tag => !covered.has(tag));
  if (missingCoverage.length) problems.push(`missing coverage: ${missingCoverage.join(', ')}`);
  for (const c of cases) {
    if (!VALID_EXPECTED.has(c.expected)) problems.push(`${c.id}: invalid expected group "${c.expected}"`);
  }
  const setupErrors = results.filter(r => r.verdict === 'SETUP ERROR');
  if (setupErrors.length) problems.push(`setup errors: ${setupErrors.map(r => r.id).join(', ')}`);

  const count = verdict => results.filter(r => r.verdict === verdict).length;
  const out = [];
  out.push('<!-- Generated by: npm run benchmark:matcher. Output is deterministic. Baseline = output before any matcher fixes (ticket 02). -->');
  out.push('# PackMaster matcher benchmark');
  out.push('');
  out.push('Synthetic registry and cases only (no customer data). Read-only: records current matcher behavior.');
  out.push('- Groups: `matched` = matcher status matched; `review` = matcher status unmatched (goes to the Review screen); `ambiguous` = matcher status ambiguous.');
  out.push('- Verdict: `OK` = actual group equals expected group; `WRONG` = current behavior differs from the intended result (kept on purpose as the baseline).');
  out.push('- WRONG kinds: `false match` = accepted a row that should not be accepted; `missed` = expected matched but not matched; `other` = review/ambiguous mix-up.');
  out.push('');
  const wrongRows = results.filter(r => r.verdict === 'WRONG');
  const falseMatch = wrongRows.filter(r => r.actualGroup === 'matched' && r.expected !== 'matched').length;
  const missed = wrongRows.filter(r => r.expected === 'matched' && r.actualGroup !== 'matched').length;
  out.push(`Cases: ${results.length} | OK: ${count('OK')} | WRONG: ${wrongRows.length} (false match ${falseMatch}, missed ${missed}, other ${wrongRows.length - falseMatch - missed}) | SETUP ERROR: ${count('SETUP ERROR')}`);
  out.push(`Coverage: ${requiredCoverage.length - missingCoverage.length}/${requiredCoverage.length} required tags present`);
  out.push('');

  const grouped = new Map(GROUP_ORDER.map(g => [g, []]));
  for (const r of results) grouped.get(GROUP_ORDER.includes(r.actualGroup) ? r.actualGroup : 'error').push(r);

  for (const group of GROUP_ORDER) {
    const rows = grouped.get(group);
    if (group === 'error' && rows.length === 0) continue;
    out.push(`## ${group} (${rows.length})`);
    out.push('');
    out.push('| ID | Input | Expected | Actual status | Reason code | Verdict |');
    out.push('|---|---|---|---|---|---|');
    for (const r of rows) {
      out.push(`| ${r.id} | ${esc(r.item.text)} | ${r.expected} | ${r.actualStatus} | ${esc(r.reason)} | ${r.verdict} |`);
    }
    out.push('');
  }

  const wrong = results.filter(r => r.verdict === 'WRONG');
  out.push(`## Wrong answers (${wrong.length})`);
  out.push('');
  for (const r of wrong) {
    out.push(`- ${r.id} (${r.label}): expected ${r.expected}, actual ${r.actualGroup} (${r.reason}). ${r.note}`);
  }
  out.push('');
  if (problems.length) {
    out.push('## Problems');
    out.push('');
    for (const p of problems) out.push(`- ${p}`);
    out.push('');
  }
  process.stdout.write(out.join('\n'));
  if (problems.length) process.exitCode = 1;
}

main();
