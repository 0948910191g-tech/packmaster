import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const clientApi = require('../packmaster-cloud-client.js');
const token = 'cloud-client-test-token-abcdefghijklmnopqrstuvwxyz';

function simulatedServer() {
  const batches = new Map();
  const docs = new Map();
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    const path = new URL(url).pathname.replace('/api/workspace', '');
    const reply = (body, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      async json() { return body; }
    });
    if (options.headers.Authorization !== 'Bearer ' + token) return reply({ error: 'unauthorized' }, 401);
    if (path === '/batches' && options.method === 'GET') {
      return reply({ batches: [...batches.values()].map(row => ({
        meta: row.meta, revision: row.revision, id: row.meta.id
      })) });
    }
    const batch = /^\/batches\/([^/]+)$/.exec(path);
    if (batch) {
      const id = batch[1];
      const old = batches.get(id);
      if (options.method === 'GET') {
        return old ? reply({ ...old }) : reply({ error: 'batch_not_found' }, 404);
      }
      const body = JSON.parse(options.body);
      if ((old?.revision || 0) !== body.expectedRevision) {
        return reply({ error: 'revision_conflict', currentRevision: old?.revision || 0 }, 409);
      }
      if (options.method === 'PUT') {
        batches.set(id, { meta: body.meta, orders: body.orders,
          revision: body.expectedRevision + 1 });
        return reply({ meta: body.meta, revision: body.expectedRevision + 1 });
      }
      if (options.method === 'DELETE') {
        batches.delete(id);
        return reply({ id, revision: body.expectedRevision + 1, deleted: true });
      }
    }
    const doc = /^\/documents\/([^/]+)$/.exec(path);
    if (doc) {
      const old = docs.get(doc[1]);
      if (options.method === 'GET') {
        return reply({ key: doc[1], revision: old?.revision || 0, value: old?.value || null });
      }
      const body = JSON.parse(options.body);
      if ((old?.revision || 0) !== body.expectedRevision) {
        return reply({ error: 'revision_conflict', currentRevision: old?.revision || 0 }, 409);
      }
      docs.set(doc[1], { revision: body.expectedRevision + 1, value: body.value });
      return reply({ key: doc[1], revision: body.expectedRevision + 1 });
    }
    return reply({ error: 'not_found' }, 404);
  };
  return { batches, docs, seen, fetchImpl };
}
function newClient(server) {
  return clientApi.createClient({
    baseUrl: 'https://packmaster-ppg.example/',
    token, fetchImpl: server.fetchImpl,
    batchHelpers: { createBatchMeta: () => ({ id: 'batch-01' }),
      buildBatchMeta: meta => meta }
  });
}

test('Shared Batch data cannot be silently overwritten between two clients', async () => {
  const server = simulatedServer();
  const alice = newClient(server);
  const bob = newClient(server);
  assert.deepEqual(await alice.listBatches(), []);
  const meta = { id: 'batch-01', name: 'PPG Batch' };
  const orders = [{ id: 'order-01', parsedItems: [{ text: 'SKU1', qty: 1 }] }];
  const created = await alice.saveBatch(meta, orders);
  assert.equal(created.cloudRevision, 1);
  const loaded = await bob.loadBatch('batch-01');
  assert.deepEqual(loaded.orders, orders);
  assert.equal(loaded.meta.cloudRevision, 1);
  const updated = await alice.saveBatch(meta, [{ ...orders[0], reviewed: true }]);
  assert.equal(updated.cloudRevision, 2);
  await assert.rejects(
    bob.saveBatch(meta, [{ ...orders[0], reviewed: false }]),
    error => error.status === 409 && error.currentRevision === 2
  );
  assert.equal((await alice.loadBatch('batch-01')).orders[0].reviewed, true);
  assert.equal(server.seen.every(call => call.options.credentials === 'omit'), true);
  assert.equal(server.seen.every(call => !call.url.includes(token)), true);
});
test('Mapping document CAS protects changes across clients', async () => {
  const server = simulatedServer();
  const alice = newClient(server);
  const bob = newClient(server);
  await alice.getDocument('skuMappingRules');
  await bob.getDocument('skuMappingRules');
  assert.equal(await alice.saveDocument('skuMappingRules',
    [{ keyword: 'sku-1', shortName: 'Product 1' }]), 1);
  await assert.rejects(
    bob.saveDocument('skuMappingRules', [{ keyword: 'sku-1', shortName: 'Wrong' }]),
    error => error.status === 409
  );
  const latest = await bob.getDocument('skuMappingRules');
  assert.equal(latest.revision, 1);
  assert.equal(latest.value[0].shortName, 'Product 1');
});
test('Client validates HTTPS, token, and document revision prerequisites', async () => {
  const server = simulatedServer();
  assert.throws(() => clientApi.createClient({ baseUrl: 'http://bad.example', token,
    fetchImpl: server.fetchImpl }), /HTTPS/);
  assert.throws(() => clientApi.createClient({ baseUrl: 'https://app.example/',
    token: 'short', fetchImpl: server.fetchImpl }), /token/);
  const client = newClient(server);
  await assert.rejects(client.saveDocument('skuMappingRules', []), /Load/);
  await assert.rejects(client.getDocument('outside'), /Unknown/);
});

test('Opening an unchanged Cloud Batch does not autosave or increment revision', async () => {
  const server = simulatedServer();
  const client = newClient(server);
  const meta = { id: 'batch-01', name: 'Same Content', updatedAt: '2026-11-04T00:00:00.000Z' };
  const orders = [{ id: 'order-01', parsedItems: [{ text: 'SKU', qty: 1 }] }];
  await client.saveBatch(meta, orders);
  const fetched = await client.loadBatch(meta.id);
  const previousRequests = server.seen.filter(row => row.options.method === 'PUT').length;
  const unchanged = await client.saveBatch({ ...fetched.meta, updatedAt: '2026-11-04T00:00:01.000Z' }, fetched.orders);
  assert.equal(unchanged.cloudRevision, 1);
  assert.equal(server.seen.filter(row => row.options.method === 'PUT').length, previousRequests);
  assert.equal(server.batches.get(meta.id).revision, 1);
  assert.equal(Object.hasOwn(server.batches.get(meta.id).meta, 'cloudRevision'), false);
});

test('List refresh must not silently advance the local editing revision', async () => {
  const server = simulatedServer();
  const writer = newClient(server);
  const oldEditor = newClient(server);
  const meta = { id: 'batch-01', name: 'Shared' };
  const order = { id: 'one', parsedItems: [{ text: 'SKU', qty: 1 }] };
  await writer.saveBatch(meta, [order]);
  await oldEditor.loadBatch(meta.id);
  await writer.saveBatch(meta, [{ ...order, reviewed: true }]);
  const list = await oldEditor.listBatches();
  assert.equal(list[0].cloudRevision, 2, 'List should display server version');
  await assert.rejects(
    oldEditor.saveBatch(meta, [{ ...order, reviewed: false }]),
    /modified on another device/
  );
  assert.equal(server.batches.get(meta.id).orders[0].reviewed, true);
  await oldEditor.loadBatch(meta.id);
  assert.equal((await oldEditor.saveBatch(meta, [{ ...order, reviewed: 'resolved' }])).cloudRevision, 3);
});

test('Metadata-only list entry cannot authorize editing Batch without loading its orders', async () => {
  const server = simulatedServer();
  const owner = newClient(server);
  const other = newClient(server);
  const meta = { id: 'batch-01', name: 'Existing' };
  await owner.saveBatch(meta, [{ id: 'one', parsedItems: [{ text: 'SKU', qty: 1 }] }]);
  const list = await other.listBatches();
  assert.equal(list.length, 1);
  await assert.rejects(other.saveBatch(list[0], []), /Open the Cloud Batch/);
});

test('same-origin session client uses cookies and CSRF without exposing an API token', async () => {
  const seen = [];
  const response = (payload, status = 200) => ({
    ok: status >= 200 && status < 300,
    status, async json() { return payload; }
  });
  const csrf = 'signed-csrf-token';
  const fetchImpl = async (url, options) => {
    seen.push({url,options});
    const path = new URL(url).pathname;
    if (path.endsWith('/session')) {
      return response({ authenticated: true, csrf });
    }
    if (options.method === 'GET') {
      return response({ key: 'skuMappingRules', value: [], revision: 0 });
    }
    return response({ key: 'skuMappingRules', revision: 1 });
  };
  const client = clientApi.createClient({
    baseUrl: 'https://packmaster-ppg.example/',
    session: true, fetchImpl
  });
  const first = await client.getDocument('skuMappingRules');
  assert.equal(first.revision, 0);
  assert.equal(await client.saveDocument('skuMappingRules', [
    { keyword: 'SKU', shortName: 'Internal' }
  ]), 1);
  assert.equal(seen.length, 3);
  assert.equal(seen.every(row => row.options.credentials === 'same-origin'), true);
  assert.equal(seen.some(row => row.options.headers?.Authorization), false);
  assert.equal(seen[2].options.headers['X-PM-CSRF'], csrf);
});

test('Registry updates use one global revision and preserve platform separation', async () => {
  let revision = 0;
  const registryByPlatform = new Map();
  const seen = [];
  const fetchImpl = async (url, options) => {
    const platform = new URL(url).pathname.split('/').pop();
    seen.push({ platform, method: options.method, options });
    const payload = options.body ? JSON.parse(options.body) : null;
    const respond = (body, status = 200) => ({
      ok: status >= 200 && status < 300, status, async json() { return body; }
    });
    if (options.method === 'GET') {
      return respond({ platform, revision, registry: registryByPlatform.get(platform) || null });
    }
    if (payload.expectedRevision !== revision) {
      return respond({ error: 'revision_conflict', currentRevision: revision }, 409);
    }
    registryByPlatform.set(platform, payload.registry);
    revision++;
    return respond({ platform, revision });
  };
  const client = clientApi.createClient({
    baseUrl: 'https://packmaster-ppg.example/', token, fetchImpl
  });
  const other = clientApi.createClient({
    baseUrl: 'https://packmaster-ppg.example/', token, fetchImpl
  });
  await client.getRegistry('TIKTOK');
  await client.getRegistry('SHOPEE');
  await other.getRegistry('SHOPEE');
  assert.equal((await client.saveRegistry('TIKTOK', { platform: 'TIKTOK' })).revision, 1);
  assert.equal((await client.saveRegistry('SHOPEE', { platform: 'SHOPEE' })).revision, 2);
  assert.equal(registryByPlatform.get('TIKTOK').platform, 'TIKTOK');
  assert.equal(registryByPlatform.get('SHOPEE').platform, 'SHOPEE');
  await assert.rejects(
    other.saveRegistry('SHOPEE', { platform: 'SHOPEE', title: 'stale' }),
    error => error.status === 409
  );
  assert.equal(registryByPlatform.get('SHOPEE').title, undefined);
  assert.equal(seen.every(row => !row.options.body || !row.options.body.includes(token)), true);
});

test('Registry SKU assignment edits use CAS and never touch keyword mapping', async () => {
  let revision = 0;
  let value = null;
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const respond = (body, status = 200) => ({
      ok: status >= 200 && status < 300, status, async json() { return body; }
    });
    if (!url.endsWith('/registry-assignments')) return respond({ error: 'unexpected' }, 404);
    if (options.method === 'GET') return respond({revision, value});
    const input = JSON.parse(options.body);
    if (input.expectedRevision !== revision) {
      return respond({error: 'revision_conflict', currentRevision: revision}, 409);
    }
    revision++;
    value = input.value;
    return respond({ revision });
  };
  const options = { baseUrl: 'https://packmaster-ppg.example/', token, fetchImpl };
  const first = clientApi.createClient(options);
  const second = clientApi.createClient(options);
  await assert.rejects(first.saveRegistryAssignments({}), /Load/);
  assert.equal((await first.getRegistryAssignments()).revision, 0);
  await second.getRegistryAssignments();
  const mapping = { schema: 'packmaster-registry-sku-assignments', version: 1, entries: [] };
  assert.equal((await first.saveRegistryAssignments(mapping)).revision, 1);
  await assert.rejects(second.saveRegistryAssignments(mapping), error => error.status === 409);
  assert.equal(requests.some(r => r.url.includes('/documents/skuMappingRules')), false);
});
