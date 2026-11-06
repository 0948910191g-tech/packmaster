import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

test('Cloud build self-hosts all frontend runtime dependencies', async () => {
  const [build, config, bootstrap, login, html] = await Promise.all([
    source('../cloudflare/workspace/build-cloud.mjs'),
    source('../cloudflare/workspace/wrangler.toml.example'),
    source('../cloudflare/workspace/cloud-bootstrap.js'),
    source('../cloudflare/workspace/cloud-login.js'),
    source('../cloudflare/workspace/login.html')
  ]);
  assert.match(build, /pinnedSha256/);
  assert.match(build, /Dependency SHA-256 mismatch/);
  assert.match(build, /tailwindcss@3\.4\.17/);
  assert.match(build, /<script\[\^>\]/);
  assert.match(build, /cloud-bootstrap\.js/);
  assert.match(build, /Content-Security-Policy/);
  assert.match(config, /run_worker_first = \["\/api\/\*"\]/);
  assert.match(config, /binding = "REGISTRY_DB"/);
  assert.match(config, /binding = "WORKSPACE_DB"/);
  assert.doesNotMatch(config, /\[\[r2_buckets\]\]/);
  assert.match(bootstrap, /credentials: 'same-origin'/);
  assert.match(bootstrap, /window\.location\.replace\('\.\/login\.html'\)/,
    'Cloud build must redirect unauthenticated browsers instead of silently falling back to Local mode');
  assert.doesNotMatch(bootstrap, /finally\s*\{\s*loadApp\(\)/,
    'Cloud build must not load the local app after a failed session check');
  assert.match(bootstrap, /window\.PackMasterCloud = /);
  assert.match(bootstrap, /session: true/);
  assert.match(login, /credentials: 'same-origin'/);
  assert.match(login, /input\.value = ''/);
  assert.doesNotMatch(login, /localStorage|sessionStorage/);
  assert.doesNotMatch(html, /<script[^>]*src="https:\/\//);
});

test('Cloud mode separates central Mapping, Batch, Registry and Archive from local storage', async () => {
  const app = await source('../index.html');
  assert.match(app, /cloudMode \? cloud\.cloudBatchApi : window\.PackMasterBatch/);
  assert.match(app, /if \(cloudMode\) return \[\]; \/\/ Never prime central mapping/);
  assert.match(app, /cloud\.getRegistryAssignments\(\)/);
  assert.match(app, /cloud\.saveRegistryAssignments\(next\)/);
  assert.match(app, /registryMatcherApi\.match\(/);
  assert.doesNotMatch(app, /cloud\.getDocument\('skuMappingRules'\)/);
  assert.match(app, /if \(cloudMode\) await changeCloudBatchArchive\(batch/);
  assert.match(app, /cloud\.getRegistry\(platform\)/);
  assert.match(app, /await cloud\.saveRegistry\(expectedPlatform, importedRegistry\)/);
  assert.match(app, /data-pm-cloud-blocker/);
  assert.match(app, /data-pm-cloud-logout/);
  const pdfImport = app.slice(app.indexOf('if (allNewOrders.length > 0) {'), app.indexOf('const LiveMappedOrders'));
  assert.ok(pdfImport.includes('await batchApi.saveBatch(meta, nextOrders)'),
    'Cloud PDF import must save orders before reporting success');
  assert.ok(pdfImport.indexOf('await batchApi.saveBatch(meta, nextOrders)') <
    pdfImport.indexOf('setOrders(nextOrders)'),
    'Cloud must not show PDF-imported orders before persistence acknowledgement');
  assert.match(pdfImport, /error.cloudSaveFailed = true/);
  assert.match(app, /cloudMode && loadingStatus.active/,
    'Cloud auto-save must pause during in-progress PDF import');
  assert.match(app, /if \(cloudMode\) \{\s*showToast\('Cloud Mode/);
});
