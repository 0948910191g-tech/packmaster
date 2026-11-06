(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterLocalRegistryBootstrap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REGISTRY_URL = './data/packmaster-marketplace-registry.json';
  const ASSIGNMENTS_URL = './data/packmaster-registry-assignments.json';

  const timestamp = value => {
    const time = Date.parse(value || '');
    return Number.isNaN(time) ? 0 : time;
  };

  function mergeRegistryBaseline(currentCandidate, baselineCandidate, registryApi) {
    if (!registryApi) throw new Error('Marketplace registry API is required');
    let current = registryApi.validateStore(currentCandidate);
    const baseline = registryApi.validateStore(baselineCandidate);

    for (const platform of registryApi.PLATFORMS) {
      const incoming = baseline.platforms[platform];
      if (!incoming) continue;
      const existing = current.platforms[platform];
      if (existing && timestamp(existing.source?.captureDate) > timestamp(incoming.source?.captureDate)) continue;
      current = registryApi.replacePlatformRegistry(current, incoming, new Date(baseline.updatedAt));
    }
    return registryApi.validateStore(current);
  }

  function mergeAssignmentBaseline(localCandidate, baselineCandidate, matcherApi) {
    if (!matcherApi) throw new Error('Registry matcher API is required');
    const local = matcherApi.validateAssignments(localCandidate);
    const baseline = matcherApi.validateAssignments(baselineCandidate);
    const baselineKeys = new Set(baseline.entries.map(entry => matcherApi.assignmentKey(entry)));
    return matcherApi.validateAssignments({
      schema: baseline.schema,
      version: baseline.version,
      entries: [
        ...local.entries.filter(entry => !baselineKeys.has(matcherApi.assignmentKey(entry))),
        ...baseline.entries
      ]
    });
  }

  async function loadJson(fetchImpl, url) {
    const response = await fetchImpl(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load local registry baseline: HTTP ' + response.status);
    return response.json();
  }

  async function loadBaselines(fetchImpl = fetch) {
    const [registry, assignments] = await Promise.all([
      loadJson(fetchImpl, REGISTRY_URL),
      loadJson(fetchImpl, ASSIGNMENTS_URL)
    ]);
    return { registry, assignments };
  }

  return {
    REGISTRY_URL,
    ASSIGNMENTS_URL,
    mergeRegistryBaseline,
    mergeAssignmentBaseline,
    loadBaselines
  };
});
