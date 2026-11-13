import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/production-smoke.yml'), 'utf8');

assert.ok(workflow.includes('set -euo pipefail'), 'smoke workflow should keep strict shell safety');
assert.ok(workflow.includes("grep -Fq 'PackMaster Pilot' <<< \"$html\""), 'marker checks must use here-strings so grep -q cannot break the producer under pipefail');
assert.ok(workflow.includes("grep -Fq 'href=\"./registry-sync.html\"' <<< \"$html\""), 'production must include registry sync');
assert.ok(workflow.includes("grep -Fq './packmaster-registry-identity.js' <<< \"$html\""), 'production must include identity helper');
assert.ok(workflow.includes("grep -Fq 'data-pm-registry-cloud-sync' <<< \"$html\""), 'production must expose manual cloud sync UI');
assert.ok(workflow.includes("grep -Fq 'data-pm-registry-evidence' <<< \"$html\""), 'production must expose registry review evidence');
assert.ok(workflow.includes("grep -Fq './packmaster-storage-health.js' <<< \"$html\""));
assert.ok(workflow.includes("grep -Fq './packmaster-diagnostics.js' <<< \"$html\""));
assert.ok(workflow.includes("grep -Fq './packmaster-pilot-safety.js' <<< \"$html\""), 'production smoke must verify the pilot safety module is deployed');
assert.ok(workflow.includes("grep -Fq './packmaster-review-overrides.js' <<< \"$html\""), 'production smoke must verify the per-order override helper is deployed');
assert.ok(workflow.includes("grep -Fq './packmaster-review-keyword-suggestions.js' <<< \"$html\""), 'production smoke must verify Review Keyword recommendations are deployed');
assert.ok(workflow.includes("grep -Fq './packmaster-batch-source-files.js' <<< \"$html\""), 'production smoke must verify Batch source filename helper is deployed');
assert.ok(workflow.includes("grep -Fq './packmaster-print-scope.js' <<< \"$html\""), 'production smoke must verify the print scope helper is deployed');
assert.ok(workflow.includes("grep -Fq './packmaster-print-flow.js' <<< \"$html\""), 'production smoke must verify the print completion helper is deployed');
assert.ok(workflow.includes("grep -Fq 'ใช้กับ Order นี้' <<< \"$html\""), 'production smoke must verify order-only Quick Mapping UI is deployed');
assert.ok(workflow.includes("grep -Fq \"handleExportPDF('FULL_BATCH')\" <<< \"$html\""), 'production smoke must verify unrestricted full-Batch PDF export is deployed');
assert.ok(workflow.includes("grep -Fq \"handlePrint('FULL_BATCH')\" <<< \"$html\""), 'production smoke must verify direct full-Batch print is deployed without an emergency override');
assert.ok(workflow.includes("grep -Fq 'data-pm-view=\"review\"' <<< \"$html\""), 'production smoke must verify the stable Frontend V3 Review workspace marker');
assert.ok(workflow.includes("grep -Fq 'data-pm-review-layout=\"hybrid-grid\"' <<< \"$html\""), 'production smoke must verify the Hybrid Review Grid build is deployed');
assert.ok(workflow.includes("grep -Fq 'data-pm-batch-source-files' <<< \"$html\""), 'production smoke must verify source filenames are shown in Batch cards');
assert.ok(workflow.includes("grep -Fq 'data-pm-review-original-pdf' <<< \"$html\""), 'production smoke must verify original PDF review panel is deployed');
assert.ok(workflow.includes("grep -Fq 'data-pm-review-confirm-sku' <<< \"$html\""), 'production smoke must verify SKU confirmation control is deployed');
assert.ok(workflow.includes("grep -Fq 'data-pm-review-confirm-qty' <<< \"$html\""), 'production smoke must verify Qty confirmation control is deployed');
assert.ok(workflow.includes("grep -Fq 'data-pm-review-qty-override' <<< \"$html\""), 'production smoke must verify per-order Qty correction is deployed');
assert.ok(workflow.includes("grep -Fq 'บันทึกชื่อจาก SKU ที่ตรงทะเบียน' <<< \"$html\""), 'production smoke must verify current registry naming action');
assert.ok(workflow.includes("grep -Fq 'ยืนยันและผูกคู่ SKU/ข้อความใน Local' <<< \"$html\""), 'production smoke must verify explicit manual SKU pairing');
assert.ok(workflow.includes("grep -Fq 'data-pm-brand-chip' <<< \"$html\""), 'production smoke must verify current brand filter');
assert.equal(workflow.includes("grep -Fq 'data-pm-review-preview=\"full\"' <<< \"$html\""), false, 'production smoke must not rely on obsolete single full-preview marker');
assert.equal(workflow.includes("printf '%s' \"$html\" | grep -Fq"), false, 'do not pipe printf into grep -q under pipefail');

console.log('PackMaster production smoke workflow regression test passed');
