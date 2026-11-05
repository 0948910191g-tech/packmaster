// D1-only immutable object storage for Cloudflare Workers Free.
// Each row remains well below D1's 2 MB BLOB/row limit.
export const MAX_OBJECT_BYTES = 4 * 1024 * 1024;
export const CHUNK_BYTES = 192 * 1024;
const MAX_KEY_BYTES = 240;

function validateKey(key) {
  if (typeof key !== 'string' || !key || new TextEncoder().encode(key).length > MAX_KEY_BYTES ||
      !/^[a-zA-Z0-9_./-]+$/.test(key) || key.includes('..')) {
    throw new Error('Invalid immutable object key');
  }
}
function hex(buffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256(bytes) {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}
function assertUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return Uint8Array.from(data);
  throw new Error('Invalid object chunk returned from D1');
}

export function createD1ObjectStore(db) {
  if (!db || typeof db.prepare !== 'function') throw new Error('D1 binding is unavailable');

  async function put(key, source) {
    validateKey(key);
    if (typeof source !== 'string') throw new Error('Only UTF-8 string objects are supported');
    const bytes = new TextEncoder().encode(source);
    if (bytes.byteLength > MAX_OBJECT_BYTES) {
      const error = new Error('Object exceeds the 4 MB Free-plan safety limit');
      error.code = 'object_too_large';
      throw error;
    }
    const count = Math.ceil(bytes.length / CHUNK_BYTES) || 1;
    const digest = await sha256(bytes);
    const existing = await db.prepare(
      'SELECT object_key, total_chunks FROM workspace_objects WHERE object_key = ?'
    ).bind(key).first();
    if (existing) {
      const chunkCountRow = await db.prepare(
        'SELECT COUNT(*) as count FROM workspace_object_chunks WHERE object_key = ?'
      ).bind(key).first();
      const chunkCount = chunkCountRow?.count || 0;
      if (chunkCount === existing.total_chunks && chunkCount > 0) {
        throw new Error('Immutable object key already exists');
      }
      await db.prepare('DELETE FROM workspace_object_chunks WHERE object_key = ?').bind(key).run();
      await db.prepare('DELETE FROM workspace_objects WHERE object_key = ?').bind(key).run();
    }

    const createdAt = new Date().toISOString();
    await db.prepare(
      'INSERT INTO workspace_objects (object_key, total_bytes, total_chunks, sha256, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(key, bytes.length, count, digest, createdAt).run();
    try {
      for (let i = 0; i < count; i++) {
        const slice = bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
        await db.prepare(
          'INSERT INTO workspace_object_chunks (object_key, chunk_index, body) VALUES (?, ?, ?)'
        ).bind(key, i, slice).run();
      }
    } catch (error) {
      // Failed uploads remain isolated from any committed Batch reference.
      // Cleanup is best-effort; never change existing immutable objects.
      try {
        await db.prepare('DELETE FROM workspace_objects WHERE object_key = ?').bind(key).run();
      } catch (cleanupError) {
        console.error('Staging object cleanup failed', cleanupError?.name || 'unknown');
      }
      throw error;
    }
  }

  async function get(key) {
    validateKey(key);
    const manifest = await db.prepare(
      'SELECT total_bytes, total_chunks, sha256 FROM workspace_objects WHERE object_key = ?'
    ).bind(key).first();
    if (!manifest) return null;
    if (!Number.isInteger(manifest.total_chunks) ||
        manifest.total_chunks < 1 || manifest.total_chunks > 30 ||
        manifest.total_bytes < 0 || manifest.total_bytes > MAX_OBJECT_BYTES) {
      throw new Error('Invalid D1 object manifest');
    }
    const result = await db.prepare(
      'SELECT chunk_index, body FROM workspace_object_chunks WHERE object_key = ? ORDER BY chunk_index'
    ).bind(key).all();
    const rows = result?.results || [];
    if (rows.length !== manifest.total_chunks) throw new Error('D1 object is incomplete');
    const bytes = new Uint8Array(manifest.total_bytes);
    let cursor = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].chunk_index !== i) throw new Error('D1 object chunks are out of order');
      const chunk = assertUint8Array(rows[i].body);
      if (chunk.length > CHUNK_BYTES || cursor + chunk.length > bytes.length) {
        throw new Error('D1 object chunk length invalid');
      }
      bytes.set(chunk, cursor);
      cursor += chunk.length;
    }
    if (cursor !== bytes.length || await sha256(bytes) !== manifest.sha256) {
      throw new Error('D1 object failed integrity verification');
    }
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { async text() { return value; } };
  }

  async function del(key) {
    validateKey(key);
    // Prevent deletion even if the caller's latest snapshot is stale.
    await db.prepare(
      'DELETE FROM workspace_objects WHERE object_key = ? AND NOT EXISTS (SELECT 1 FROM workspace_batches WHERE orders_key = ?)'
    ).bind(key, key).run();
  }

  return { put, get, delete: del };
}
