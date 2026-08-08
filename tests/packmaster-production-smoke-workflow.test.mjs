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
assert.ok(workflow.includes("grep -Fq 'แก้ Exception ให้ครบก่อนพิมพ์' <<< \"$html\""), 'production smoke must verify the visible print-lock UX is deployed');
assert.ok(workflow.includes("grep -Fq 'รีวิวและพิมพ์' <<< \"$html\""));
assert.equal(workflow.includes("printf '%s' \"$html\" | grep -Fq"), false, 'do not pipe printf into grep -q under pipefail');

console.log('PackMaster production smoke workflow regression test passed');
