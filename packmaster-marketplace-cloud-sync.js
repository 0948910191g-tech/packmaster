(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PackMasterMarketplaceCloudSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const API_BASE = '/api';
  const LOCAL_RECOVERY_KEY = 'packmasterMarketplaceRegistryBeforeCloudV1';
  const CONFIGURED = (config) => Boolean(config && config.provider === 'cloudflare-d1' && config.apiBase === API_BASE);

  const createClient = (config, fetchImpl) => {
    if (!CONFIGURED(config)) return null;
    const requestFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!requestFetch) return null;

    const request = async (path, options = {}) => {
      let response;
      try {
        response = await requestFetch(API_BASE + '/' + path, {
          method: options.method || 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'manual',
          headers: {
            accept: 'application/json',
            ...(options.body ? { 'content-type': 'application/json' } : {})
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {})
        });
      } catch (cause) {
        const error = new Error('ติดต่อ Cloudflare ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
        error.cause = cause;
        error.code = 'NETWORK_ERROR';
        throw error;
      }

      const contentType = response.headers && response.headers.get
        ? response.headers.get('content-type') || ''
        : '';
      if (!contentType.toLowerCase().includes('application/json')) {
        const error = new Error('กรุณาเข้าสู่ระบบด้วย Cloudflare Access ก่อนใช้ทะเบียนกลาง');
        error.code = 'ACCESS_REQUIRED';
        error.status = response.status;
        throw error;
      }

      let payload;
      try {
        payload = await response.json();
      } catch (cause) {
        const error = new Error('Cloudflare ส่งข้อมูลกลับมาไม่ถูกต้อง');
        error.cause = cause;
        error.code = 'INVALID_RESPONSE';
        throw error;
      }

      if (!response.ok) {
        const error = new Error(payload && payload.error ? payload.error : 'Cloudflare request failed');
        error.code = payload && payload.code ? payload.code : 'CLOUD_REQUEST_FAILED';
        error.status = response.status;
        throw error;
      }
      return payload;
    };

    const getIdentity = async () => request('identity');
    const getSession = async () => {
      try {
        const identity = await getIdentity();
        return {
          data: {
            session: {
              user: {
                id: identity.sub || identity.email,
                email: identity.email
              }
            }
          },
          error: null
        };
      } catch (error) {
        if (error.code === 'ACCESS_REQUIRED' || error.status === 401) {
          return { data: { session: null }, error: null };
        }
        if (error.status === 403) {
          return {
            data: { session: { user: { id: 'cloudflare-access-unapproved', email: '' } } },
            error: null
          };
        }
        return { data: { session: null }, error };
      }
    };

    return {
      auth: {
        getSession,
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } };
        }
      },
      getIdentity,
      async readRegistry() {
        const result = await request('registry');
        return result.row || null;
      },
      async seedRegistry(registry) {
        const result = await request('registry/seed', { method: 'POST', body: { registry } });
        return result.row || null;
      },
      async publishRegistry(registry, expectedRevision) {
        const result = await request('registry', {
          method: 'PUT',
          body: { registry, expectedRevision }
        });
        return result.row || null;
      },
      getLoginUrl() {
        return API_BASE + '/login';
      }
    };
  };

  const hasCatalogData = (store) => Boolean(
    store && store.platforms && Object.keys(store.platforms).some((platform) => {
      const registry = store.platforms[platform];
      return registry && Array.isArray(registry.products) && registry.products.length > 0;
    })
  );

  const createSyncService = ({ client, registryApi, storage } = {}) => {
    if (!client || !registryApi || !storage) throw new Error('Cloud sync dependencies are required');
    let activeSession = null;
    let activeRevision = null;
    let isAuthorized = false;

    const requireSession = () => {
      if (!activeSession || !activeSession.user || !activeSession.user.id) {
        throw new Error('กรุณาเข้าสู่ระบบ Cloudflare Access ก่อนซิงก์ทะเบียน');
      }
      if (!isAuthorized) throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าถึงทะเบียนกลาง');
    };

    const checkAccess = async () => {
      try {
        const identity = await client.getIdentity();
        if (!identity || !identity.email) return false;
        const sessionEmail = String(activeSession.user.email || '').trim().toLowerCase();
        return !sessionEmail || identity.email.trim().toLowerCase() === sessionEmail;
      } catch (error) {
        if (error.status === 403 || error.code === 'NOT_AUTHORIZED') return false;
        throw error;
      }
    };

    const readRemote = async () => client.readRegistry();

    const preserveLocalThenApply = (store) => {
      const loaded = registryApi.loadStore(storage);
      if (!loaded.error && hasCatalogData(loaded.store) &&
          JSON.stringify(loaded.store) !== JSON.stringify(store)) {
        try { storage.setItem(LOCAL_RECOVERY_KEY, JSON.stringify(loaded.store)); } catch (error) {}
      }
      registryApi.saveStore(storage, store);
    };

    const adoptRemote = (row) => {
      const store = registryApi.validateStore(row.registry);
      preserveLocalThenApply(store);
      activeRevision = Number(row.revision);
      return {
        status: 'synced',
        store,
        revision: activeRevision,
        updatedAt: row.updatedAt || row.updated_at || null
      };
    };

    const connect = async (session, localStore) => {
      activeSession = session || null;
      activeRevision = null;
      isAuthorized = false;
      if (!activeSession || !activeSession.user) return { status: 'signed_out', store: localStore || null };
      isAuthorized = await checkAccess();
      if (!isAuthorized) return { status: 'unauthorized', store: localStore || null };
      const row = await readRemote();
      if (row) return adoptRemote(row);
      activeRevision = 0;
      return { status: 'empty', store: localStore || registryApi.createEmptyStore(), revision: 0 };
    };

    const seedCurrentLocal = async (storeCandidate) => {
      requireSession();
      const store = registryApi.validateStore(storeCandidate);
      const existing = await readRemote();
      if (existing) return adoptRemote(existing);
      if (!hasCatalogData(store)) return { status: 'empty', store, revision: 0 };
      try {
        const row = await client.seedRegistry(store);
        if (!row) throw new Error('ทะเบียนกลางยังไม่ตอบกลับข้อมูลที่บันทึก');
        return adoptRemote(row);
      } catch (error) {
        if (error.status === 409 || error.code === 'REGISTRY_EXISTS') {
          const racedRow = await readRemote();
          if (racedRow) return adoptRemote(racedRow);
        }
        throw error;
      }
    };

    const publish = async (storeCandidate) => {
      requireSession();
      const store = registryApi.validateStore(storeCandidate);
      const existing = await readRemote();
      if (!existing) {
        const seeded = await client.seedRegistry(store);
        if (!seeded) throw new Error('ทะเบียนกลางยังไม่ตอบกลับข้อมูลที่บันทึก');
        return adoptRemote(seeded);
      }
      const expectedRevision = activeRevision == null ? Number(existing.revision) : activeRevision;
      if (Number(existing.revision) !== expectedRevision) {
        throw new Error('ทะเบียนกลางเปลี่ยนจากอีกเครื่องแล้ว กรุณาโหลดทะเบียนกลางก่อนแก้ไข');
      }
      const row = await client.publishRegistry(store, expectedRevision);
      if (!row) throw new Error('ทะเบียนกลางเปลี่ยนจากอีกเครื่องแล้ว กรุณาโหลดทะเบียนกลางก่อนแก้ไข');
      return adoptRemote(row);
    };

    const refresh = async () => {
      if (!activeSession || !isAuthorized) return { status: 'signed_out', changed: false };
      const row = await readRemote();
      if (!row) return { status: 'empty', changed: false };
      if (activeRevision == null || Number(row.revision) > activeRevision) {
        return { ...adoptRemote(row), changed: true };
      }
      return { status: 'synced', changed: false, revision: activeRevision };
    };

    return {
      connect,
      seedCurrentLocal,
      publish,
      refresh,
      getLoginUrl: () => client.getLoginUrl(),
      hasAccess: () => isAuthorized,
      getRevision: () => activeRevision
    };
  };

  return {
    API_BASE,
    LOCAL_RECOVERY_KEY,
    isConfigured: CONFIGURED,
    createClient,
    createSyncService,
    hasCatalogData
  };
});