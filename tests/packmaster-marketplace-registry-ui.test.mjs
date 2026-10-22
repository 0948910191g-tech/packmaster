import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

test('marketplace registry stays local, platform-scoped, and separate from SKU mappings', async () => {
  const [html, privacy] = await Promise.all([
    readFile(path.join(projectRoot, 'index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'docs', 'PRIVACY_LOCAL_DATA.md'), 'utf8')
  ]);

  assert.match(html, /<script src="\.\/packmaster-marketplace-registry\.js"><\/script>/);
  assert.match(html, /data-pm-view="marketplace-registry"/);
  assert.match(html, /navigateView\('marketplace-registry'\)/);
  assert.match(html, /data-pm-action="workspace-backup"/);
  assert.match(html, /marketplaceRegistry: marketplaceRegistryLoadError \? null : marketplaceRegistry/);
  assert.match(html, /marketplaceRegistryApi\.validateStore\(backup\.settings\.marketplaceRegistry\)/);
  assert.match(html, /marketplaceRegistryApi\.saveStore\(window\.localStorage, backup\.settings\.marketplaceRegistry\)/);

  const importHandler = html.match(/const handleMarketplaceRegistryImport = async \(event, expectedPlatform\) => \{[\s\S]*?\n      \};/);
  assert.ok(importHandler, 'a dedicated catalog import handler should exist');
  assert.match(importHandler[0], /validatePlatformRegistry\([^\n]+expectedPlatform\)/);
  assert.match(importHandler[0], /replacePlatformRegistry\(currentStore, importedRegistry\)/);
  assert.match(importHandler[0], /saveStore\(window\.localStorage, nextStore\)/);
  assert.doesNotMatch(importHandler[0], /setSkuRules|skuMappingRules/);

  assert.match(privacy, /separated by TikTok and Shopee/i);
  assert.match(privacy, /does not create internal names or matching rules/i);
  assert.match(privacy, /out of Git/i);
});
