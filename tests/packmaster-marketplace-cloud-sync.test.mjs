import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cloud = require('../packmaster-marketplace-cloud-sync.js');

const createRegistryApi = () => ({
  createEmptyStore() {
    return { schema: 'packmaster-marketplace-registry', version: 1, updatedAt: '2026-01-01T00:00:00.000Z', platforms: {} };
  },
  validateStore(store) {
    return JSON.parse(JSON.stringify(store));
  },
  loadStore(storage) {
    const value = storage.getItem('local-registry');
    return { store: value ? JSON.parse(value) : this.createEmptyStore(), error: null };
  },
  saveStore(storage, store) {
    storage.setItem('local-registry', JSON.stringify(store));
    return store;
  }
});

const createStorage = () => {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
};

const createStore = (updatedAt = '2026-01-01T00:00:00.000Z') => ({
  schema: 'packmaster-marketplace-registry',
  version: 1,
  updatedAt,
  platforms: {
    TIKTOK: {
      products: [{ productId: 'p-1' }],
      skuRows: [],
      source: { shop: 'test' }
    }
  }
});

const makeError = (message, status, code) => Object.assign(new Error(message), { status, code });

const makeClient = ({ identityEmail = 'owner@example.com', identityError = null, row = null } = {}) => {
  let currentRow = row ? JSON.parse(JSON.stringify(row)) : null;
  const client = {
    auth: {
      async getSession() {
        return {
          data: { session: { user: { id: 'user-1', email: identityEmail } } },
          error: null
        };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      }
    },
    async getIdentity() {
      if (identityError) throw identityError;
      return { email: identityEmail, sub: 'user-1' };
    },
    async readRegistry() {
      return currentRow ? JSON.parse(JSON.stringify(currentRow)) : null;
    },
    async seedRegistry(registry) {
      if (currentRow) throw makeError('registry exists', 409, 'REGISTRY_EXISTS');
      currentRow = {
        id: 1,
        registry: JSON.parse(JSON.stringify(registry)),
        revision: 1,
        updatedAt: '2026-01-01T00:00:00.000Z'
      };
      return JSON.parse(JSON.stringify(currentRow));
    },
    async publishRegistry(registry, expectedRevision) {
      if (!currentRow || currentRow.revision !== expectedRevision) {
        throw makeError('revision conflict', 409, 'REVISION_CONFLICT');
      }
      currentRow = {
        ...currentRow,
        registry: JSON.parse(JSON.stringify(registry)),
        revision: currentRow.revision + 1,
        updatedAt: '2026-01-02T00:00:00.000Z'
      };
      return JSON.parse(JSON.stringify(currentRow));
    },
    getLoginUrl() { return '/api/login'; },
    getRow() { return currentRow; },
    setRow(value) { currentRow = value; }
  };
  return client;
};

const session = { user: { id: 'user-1', email: 'owner@example.com' } };
const config = { provider: 'cloudflare-d1', apiBase: '/api' };

test('Cloudflare configuration remains disabled until the same-origin D1 API is selected', () => {
  assert.equal(cloud.isConfigured({ provider: 'cloudflare-d1', apiBase: '' }), false);
  assert.equal(cloud.isConfigured({ provider: 'supabase', apiBase: '/api' }), false);
  assert.equal(cloud.isConfigured(config), true);
  assert.equal(cloud.createClient({}, async () => ({})), null);
});

test('the browser uses the same-origin API and Cloudflare Access cookie without exposing database keys', async () => {
  let call;
  const client = cloud.createClient(config, async (url, options) => {
    call = { url, options };
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      async json() { return { email: 'owner@example.com', sub: 'user-1' }; }
    };
  });
  const result = await client.auth.getSession();
  assert.equal(result.data.session.user.email, 'owner@example.com');
  assert.equal(call.url, '/api/identity');
  assert.equal(call.options.credentials, 'same-origin');
  assert.equal(call.options.cache, 'no-store');
  assert.equal(call.options.redirect, 'manual');
  assert.equal(client.getLoginUrl(), '/api/login');
});

test('an Access login page returned to an API fetch is treated as a signed-out session', async () => {
  const client = cloud.createClient(config, async () => ({
    ok: true,
    status: 0,
    headers: new Headers({ 'content-type': 'text/html' }),
    async json() { throw new Error('HTML is not JSON'); }
  }));
  const result = await client.auth.getSession();
  assert.equal(result.data.session, null);
  assert.equal(result.error, null);
});

test('unauthorized signed-in accounts cannot read or write the shared registry', async () => {
  const client = makeClient({ identityError: makeError('not allowed', 403, 'NOT_AUTHORIZED') });
  const service = cloud.createSyncService({ client, registryApi: createRegistryApi(), storage: createStorage() });
  const result = await service.connect(session, createStore());
  assert.equal(result.status, 'unauthorized');
  assert.equal(service.hasAccess(), false);
  await assert.rejects(() => service.publish(createStore()), /ยังไม่ได้รับสิทธิ์/);
});

test('authorized user explicitly seeds once, then imports advance the shared revision', async () => {
  const storage = createStorage();
  const client = makeClient();
  const service = cloud.createSyncService({ client, registryApi: createRegistryApi(), storage });
  const local = createStore();
  const opened = await service.connect(session, local);
  assert.equal(opened.status, 'empty');
  assert.equal(service.hasAccess(), true);

  const seeded = await service.seedCurrentLocal(local);
  assert.equal(seeded.status, 'synced');
  assert.equal(seeded.revision, 1);

  const updated = createStore('2026-01-02T00:00:00.000Z');
  const saved = await service.publish(updated);
  assert.equal(saved.revision, 2);
  assert.equal(client.getRow().registry.updatedAt, updated.updatedAt);
  assert.equal(JSON.parse(storage.getItem('local-registry')).updatedAt, updated.updatedAt);
});

test('a second-device seed cannot replace a registry that already exists', async () => {
  const client = makeClient({ row: { id: 1, registry: createStore(), revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' } });
  const service = cloud.createSyncService({ client, registryApi: createRegistryApi(), storage: createStorage() });
  const connected = await service.connect(session, createStore('2026-01-03T00:00:00.000Z'));
  const seeded = await service.seedCurrentLocal(createStore('2026-01-03T00:00:00.000Z'));
  assert.equal(connected.status, 'synced');
  assert.equal(seeded.status, 'synced');
  assert.equal(seeded.store.updatedAt, '2026-01-01T00:00:00.000Z');
});

test('revision conflict blocks overwriting a newer change from another device', async () => {
  const client = makeClient({ row: { id: 1, registry: createStore(), revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' } });
  const service = cloud.createSyncService({ client, registryApi: createRegistryApi(), storage: createStorage() });
  await service.connect(session, createStore());
  client.setRow({ ...client.getRow(), revision: 2 });
  await assert.rejects(() => service.publish(createStore()), /เปลี่ยนจากอีกเครื่อง/);
});

test('refresh adopts a newer cloud revision and keeps the replaced local registry for recovery', async () => {
  const local = createStore();
  const remote = createStore('2026-01-02T00:00:00.000Z');
  const storage = createStorage();
  storage.setItem('local-registry', JSON.stringify(local));
  const client = makeClient({
    row: { id: 1, registry: createStore(), revision: 1, updatedAt: '2026-01-01T00:00:00.000Z' }
  });
  const service = cloud.createSyncService({ client, registryApi: createRegistryApi(), storage });
  await service.connect(session, local);
  client.setRow({ id: 1, registry: remote, revision: 2, updatedAt: '2026-01-02T00:00:00.000Z' });
  const result = await service.refresh();
  assert.equal(result.changed, true);
  assert.equal(result.revision, 2);
  assert.equal(JSON.parse(storage.getItem('local-registry')).updatedAt, remote.updatedAt);
  assert.equal(JSON.parse(storage.getItem(cloud.LOCAL_RECOVERY_KEY)).updatedAt, local.updatedAt);
});