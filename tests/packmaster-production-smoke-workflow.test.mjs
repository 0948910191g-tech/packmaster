import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/production-smoke.yml'), 'utf8');

assert.ok(workflow.includes('set -euo pipefail'), 'smoke workflow should keep strict shell safety');
assert.ok(workflow.includes("grep -Fq 'PackMaster Pilot' <<< \"$html\""), 'marker checks must use here-strings so grep -q cannot break the producer under pipefail');
assert.ok(workflow.includes("grep -Fq './packmaster-storage-health.js' <<< \"$html\""));
assert.ok(workflow.includes("grep -Fq './packmaster-diagnostics.js' <<< \"$html\""));
assert.ok(workflow.includes("grep -Fq './packmaster-pilot-safety.js' <<< \"$html\""), 'production smoke must verify the pilot safety module is deployed');
assert.ok(workflow.includes("grep -Fq './packmaster-review-overrides.js' <<< \"$html\""), 'production smoke must verify the per-order override helper is deployed');
assert.ok(workflow.includes("grep -Fq './packmaster-print-scope.js' <<< \"$html\""), 'production smoke must verify the print scope helper is deployed');
assert.ok(workflow.includes("grep -Fq 'ใช้กับ Order นี้' <<< \"$html\""), 'production smoke must verify order-only Quick Mapping UI is deployed');
assert.ok(workflow.includes("grep -Fq 'พิมพ์เฉพาะรายการพร้อม' <<< \"$html\""), 'production smoke must verify Ready-only print UI is deployed');
assert.ok(workflow.includes("grep -Fq 'data-pm-view=\"review\"' <<< \"$html\""), 'production smoke must verify the stable Frontend V3 Review workspace marker');
assert.ok(workflow.includes("grep -Fq 'data-pm-review-layout=\"hybrid-grid\"' <<< \"$html\""), 'production smoke must verify the Hybrid Review Grid build is deployed');
assert.equal(workflow.includes("grep -Fq 'data-pm-review-preview=\"full\"' <<< \"$html\""), false, 'production smoke must not rely on obsolete single full-preview marker');
assert.equal(workflow.includes("printf '%s' \"$html\" | grep -Fq"), false, 'do not pipe printf into grep -q under pipefail');

console.log('PackMaster production smoke workflow regression test passed');
