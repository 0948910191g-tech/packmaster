(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterRegistrySync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const platforms = ['TIKTOK', 'SHOPEE'];

  function endpoint(baseUrl, platform) {
    if (!platforms.includes(platform)) throw new Error('Invalid marketplace platform');
    const address = new URL(String(baseUrl || '').trim());
    if (address.protocol !== 'https:' || address.username || address.password ||
        address.search || address.hash || (address.pathname !== '/' && address.pathname !== '')) {
      throw new Error('Enter an HTTPS Worker origin without path or credentials');
    }
    return address.origin + '/api/registry/' + platform;
  }
  function checkToken(token) {
    if (typeof token !== 'string' || token.length < 32) throw new Error('Registry access token is missing');
  }

  async function request(fetcher, baseUrl, token, platform, method = 'GET', body = null) {
    checkToken(token);
    const options = {
      method,
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: 'Bearer ' + token }
    };
    if (body !== null) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetcher(endpoint(baseUrl, platform), options);
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Invalid registry server response'); }
    if (!response.ok) throw new Error(payload?.error || 'Registry request failed');
    if (payload?.platform !== platform || !Number.isSafeInteger(payload.revision) ||
        payload.revision < 0) throw new Error('Invalid registry response metadata');
    return payload;
  }

  async function fetchRegistry(fetcher, baseUrl, token, platform, registryApi) {
    const result = await request(fetcher, baseUrl, token, platform);
    if (result.registry !== null) {
      result.registry = registryApi.validatePlatformRegistry(result.registry, platform);
    }
    return result;
  }
  async function saveRegistry(fetcher, baseUrl, token, platform, registry, expectedRevision, registryApi) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error('Invalid expected registry revision');
    }
    const checked = registryApi.validatePlatformRegistry(registry, platform);
    return request(fetcher, baseUrl, token, platform, 'PUT', { expectedRevision, registry: checked });
  }
  return { endpoint, fetchRegistry, saveRegistry };
});
