export const jsonResponse = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' }
});

export const registryError = (message, code, status) => jsonResponse({ error: message, code }, status);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const validateRegistryStore = (store) => {
  if (!isObject(store) || store.schema !== 'packmaster-marketplace-registry' ||
      store.version !== 1 || !Number.isFinite(Date.parse(store.updatedAt)) || !isObject(store.platforms)) {
    throw new Error('รูปแบบทะเบียน Marketplace ไม่ถูกต้อง');
  }
  for (const platform of Object.keys(store.platforms)) {
    const registry = store.platforms[platform];
    if (!['TIKTOK', 'SHOPEE'].includes(platform) || !isObject(registry) ||
        registry.platform !== platform || registry.registryType !== 'marketplace_product_sku_source_registry' ||
        registry.schemaVersion !== 1 || !isObject(registry.source) ||
        !String(registry.source.shop || '').trim() ||
        !Number.isFinite(Date.parse(registry.source.captureDate)) ||
        !Array.isArray(registry.products) || !Array.isArray(registry.skuRows) ||
        !Array.isArray(registry.productsWithoutAnySellerSku) || !isObject(registry.summary) ||
        !Array.isArray(registry.pages)) {
      throw new Error('ข้อมูลทะเบียน ' + platform + ' ไม่ครบหรือไม่ถูกต้อง');
    }
  }
  return store;
};

export const parseRegistryRequest = async (request) => {
  const announcedSize = Number(request.headers.get('content-length') || 0);
  if (announcedSize > 2 * 1024 * 1024) throw new Error('ไฟล์ทะเบียนมีขนาดใหญ่เกินกำหนด');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024) {
    throw new Error('ไฟล์ทะเบียนมีขนาดใหญ่เกินกำหนด');
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error('ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง');
  }
  if (!isObject(body)) throw new Error('คำขอทะเบียนไม่ถูกต้อง');
  return { body, registry: validateRegistryStore(body.registry) };
};

export const readRegistryRow = async (db) => {
  const row = await db.prepare(
    'SELECT id, registry_json, revision, updated_at, updated_by FROM packmaster_marketplace_registry WHERE id = ?'
  ).bind(1).first();
  if (!row) return null;
  let registry;
  try {
    registry = JSON.parse(row.registry_json);
  } catch (error) {
    throw new Error('ข้อมูลทะเบียนใน D1 อ่านไม่ได้');
  }
  return {
    id: Number(row.id),
    registry,
    revision: Number(row.revision),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  };
};

export const requireDatabase = (env) => {
  if (!env || !env.REGISTRY_DB) throw new Error('ยังไม่ได้ผูก D1 database กับ Pages Function');
  return env.REGISTRY_DB;
};