import { jsonResponse, registryError, requireDatabase, readRegistryRow, parseRegistryRequest } from './shared.mjs';

export async function onRequestGet({ env }) {
  try {
    const db = requireDatabase(env);
    return jsonResponse({ row: await readRegistryRow(db) });
  } catch (error) {
    return registryError(error.message || 'โหลดทะเบียนกลางไม่สำเร็จ', 'REGISTRY_READ_FAILED', 503);
  }
}

export async function onRequestPut({ request, env, data }) {
  let db;
  let registry;
  let expectedRevision;
  try {
    db = requireDatabase(env);
    const parsed = await parseRegistryRequest(request);
    registry = parsed.registry;
    expectedRevision = Number(parsed.body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return registryError('revision ของทะเบียนไม่ถูกต้อง', 'INVALID_REVISION', 400);
    }
  } catch (error) {
    return registryError(error.message || 'ข้อมูลทะเบียนไม่ถูกต้อง', 'INVALID_REGISTRY', 400);
  }
  const identity = data && data.packMasterIdentity;
  if (!identity || !identity.email) return registryError('Cloudflare Access identity is missing', 'ACCESS_REQUIRED', 401);

  const updatedAt = new Date().toISOString();
  try {
    const result = await db.prepare(
      'UPDATE packmaster_marketplace_registry SET registry_json = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?'
    ).bind(JSON.stringify(registry), updatedAt, identity.email, 1, expectedRevision).run();
    if (!result || !result.meta || Number(result.meta.changes) !== 1) {
      return registryError('ทะเบียนกลางเปลี่ยนจากอีกเครื่องแล้ว กรุณาโหลดทะเบียนกลางก่อนแก้ไข', 'REVISION_CONFLICT', 409);
    }
    return jsonResponse({ row: await readRegistryRow(db) });
  } catch (error) {
    return registryError(error.message || 'บันทึกทะเบียนกลางไม่สำเร็จ', 'REGISTRY_WRITE_FAILED', 503);
  }
}