import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

test('marketplace registry sync uses Cloudflare Access and D1 without changing SKU mappings', async () => {
  const [html, privacy, migration, config, access, middleware, api, seed] = await Promise.all([
    readFile(path.join(projectRoot, 'index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'docs', 'PRIVACY_LOCAL_DATA.md'), 'utf8'),
    readFile(path.join(projectRoot, 'cloudflare', 'migrations', '0001_create_marketplace_registry.sql'), 'utf8'),
    readFile(path.join(projectRoot, 'packmaster-cloud-config.js'), 'utf8'),
    readFile(path.join(projectRoot, 'functions', 'lib', 'cloudflare-access.mjs'), 'utf8'),
    readFile(path.join(projectRoot, 'functions', 'api', '_middleware.js'), 'utf8'),
    readFile(path.join(projectRoot, 'functions', 'api', 'registry.js'), 'utf8'),
    readFile(path.join(projectRoot, 'functions', 'api', 'registry', 'seed.js'), 'utf8')
  ]);

  assert.ok(html.includes('<script src="./packmaster-marketplace-registry.js"></script>'));
  assert.ok(html.includes('<script src="./packmaster-marketplace-cloud-sync.js"></script>'));
  assert.equal(/supabase-js|window\\.supabase/i.test(html), false);
  assert.ok(html.includes('data-pm-view="marketplace-registry"'));
  assert.ok(html.includes("navigateView('marketplace-registry')"));
  assert.ok(html.includes('data-pm-action="workspace-backup"'));
  assert.ok(html.includes('marketplaceRegistry: marketplaceRegistryLoadError ? null : marketplaceRegistry'));
  assert.ok(html.includes('marketplaceRegistryApi.validateStore(backup.settings.marketplaceRegistry)'));
  assert.ok(html.includes('sync.publish(restoredRegistry)'));
  assert.ok(html.includes('handleMarketplaceCloudSignIn'));
  assert.ok(html.includes('เข้าสู่ระบบด้วย Cloudflare Access'));

  const importHandlerStart = html.indexOf('const handleMarketplaceRegistryImport = async (event, expectedPlatform) => {');
  const importHandlerEnd = html.indexOf('      };', importHandlerStart);
  assert.ok(importHandlerStart >= 0 && importHandlerEnd > importHandlerStart, 'a dedicated catalog import handler should exist');
  const importHandler = html.slice(importHandlerStart, importHandlerEnd);
  assert.ok(importHandler.includes('validatePlatformRegistry(JSON.parse(await file.text()), expectedPlatform)'));
  assert.ok(importHandler.includes('replacePlatformRegistry(currentStore, importedRegistry)'));
  assert.ok(importHandler.includes('sync.publish(nextStore)'));
  assert.ok(importHandler.includes('saveStore(window.localStorage, nextStore)'));
  assert.equal(/setSkuRules|skuMappingRules/.test(importHandler), false);

  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS packmaster_marketplace_registry'));
  assert.ok(migration.includes('json_valid(registry_json)'));
  assert.ok(access.includes('Cf-Access-Jwt-Assertion'));
  assert.ok(access.includes('cryptoImpl.subtle.verify'));
  assert.ok(access.includes('REGISTRY_ALLOWED_EMAILS'));
  assert.ok(middleware.includes('verifyCloudflareAccessIdentity'));
  assert.ok(api.includes('revision = revision + 1'));
  assert.ok(api.includes('REVISION_CONFLICT'));
  assert.ok(seed.includes('ON CONFLICT(id) DO NOTHING'));
  assert.ok(config.includes("provider: 'cloudflare-d1'"));
  assert.equal(/serviceRoleKey|secretKey|databaseId/i.test(config), false);

  assert.ok(privacy.includes('Cloudflare Access'));
  assert.ok(privacy.includes('not sent to D1'));
  assert.ok(privacy.includes('remains separate from the SKU Mapping library'));
});