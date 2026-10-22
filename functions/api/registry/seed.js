import { jsonResponse, registryError, requireDatabase, readRegistryRow, parseRegistryRequest } from '../shared.mjs';

export async function onRequestPost({ request, env, data }) {
  let db;
  let registry;
  try {
    db = requireDatabase(env);
    const parsed = await parseRegistryRequest(request);
    registry = parsed.registry;
  } catch (error) {
    return registryError(error.message || 'ข้อมูลทะเบียนไม่ถูกต้อง', 'INVALID_REGISTRY', 400);
  }
  const identity = data && data.packMasterIdentity;
  if (!identity || !identity.email) return registryError('Cloudflare Access identity is missing', 'ACCESS_REQUIRED', 401);

  const updatedAt = new Date().toISOString();
  try {
    const result = await db.prepare(
      'INSERT INTO packmaster_marketplace_registry (id, registry_json, revision, updated_at, updated_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
    ).bind(1, JSON.stringify(registry), 1, updatedAt, identity.email).run();
    if (!result || !result.meta || Number(result.meta.changes) !== 1) {
      return registryError('ทะเบียนกลางมีข้อมูลแล้ว กรุณาโหลดทะเบียนกลางก่อน', 'REGISTRY_EXISTS', 409);
    }
    return jsonResponse({ row: await readRegistryRow(db) }, 201);
  } catch (error) {
    return registryError(error.message || 'แชร์ทะเบียนกลางไม่สำเร็จ', 'REGISTRY_SEED_FAILED', 503);
  }
}