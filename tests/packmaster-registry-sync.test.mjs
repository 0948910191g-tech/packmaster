import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sync = require('../packmaster-registry-sync.js');
const registry = require('../packmaster-marketplace-registry.js');
const token = 'test-token-abcdefghijklmnopqrstuvwxyz123';

test('Cloud URLs must be HTTPS origins; platform is mandatory', () => {
  assert.equal(sync.endpoint('https://registry.example/', 'TIKTOK'), 'https://registry.example/api/registry/TIKTOK');
  assert.throws(() => sync.endpoint('http://registry.example', 'TIKTOK'), /HTTPS/);
  assert.throws(() => sync.endpoint('https://user:pass@registry.example', 'TIKTOK'), /HTTPS/);
  assert.throws(() => sync.endpoint('https://registry.example/other', 'TIKTOK'), /HTTPS/);
  assert.throws(() => sync.endpoint('https://registry.example', 'OTHER'), /platform/);
});

test('request keeps bearer token out of URL and preserves platform', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, async json() { return { platform: 'SHOPEE', revision: 0, registry: null }; } };
  };
  const data = await sync.fetchRegistry(fetcher, 'https://registry.example/', token, 'SHOPEE', registry);
  assert.equal(data.revision, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://registry.example/api/registry/SHOPEE');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer ' + token);
  assert.equal(requests[0].options.method, 'GET');
});

test('rejects invalid revisions and service failures', async () => {
  const input = { platform: 'SHOPEE', source: { captureDate: '2026-11-01' } };
  const fetcher = async () => ({ ok: false, async json() { return { error: 'revision_conflict' }; } });
  await assert.rejects(
    sync.saveRegistry(fetcher, 'https://registry.example', token, 'SHOPEE', input, 0, { validatePlatformRegistry: x => x }),
    /revision_conflict/
  );
  await assert.rejects(
    sync.saveRegistry(fetcher, 'https://registry.example', token, 'SHOPEE', input, -1, { validatePlatformRegistry: x => x }),
    /revision/
  );
  await assert.rejects(
    sync.fetchRegistry(fetcher, 'https://registry.example', 'short', 'SHOPEE', registry),
    /token/
  );
});

test('Cloud credentials are entered only on the self-hosted isolated sync page', async () => {
  const { readFile } = await import('node:fs/promises');
  const [dashboard, html, client] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../registry-sync.html', import.meta.url), 'utf8'),
    readFile(new URL('../registry-sync-admin.js', import.meta.url), 'utf8')
  ]);
  assert.match(dashboard, /href=".\/registry-sync\.html"/);
  assert.match(dashboard, /data-pm-registry-cloud-sync/);
  assert.doesNotMatch(dashboard, /registrySyncToken|Registry access token|handleRegistryCloudSync/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /<script src=".\/packmaster-registry-sync\.js" defer><\/script>/);
  assert.match(html, /<script src=".\/registry-sync-admin\.js" defer><\/script>/);
  assert.doesNotMatch(html, /<script[^>]*https:\/\//);
  assert.match(client, /sync\.fetchRegistry/);
  assert.match(client, /sync\.saveRegistry/);
  assert.match(client, /\.textContent/);
  assert.doesNotMatch(client, /localStorage\.setItem\(['"](?:token|registrySyncToken)/);
});
