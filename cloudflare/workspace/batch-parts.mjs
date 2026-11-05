// Shared validation and cryptographic identifiers for D1-only multipart Batch snapshots.
export const MAX_PART_BYTES = 1_500_000;
export const MAX_PART_COUNT = 64;
export const MAX_BATCH_ORDERS = 5000;
export const PART_HASH = /^[a-f0-9]{64}$/;
export const PART_FORMAT = 'packmaster-order-parts-v1';

export function partKey(batchId, hash) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(batchId) || !PART_HASH.test(hash)) {
    throw new Error('Invalid batch part identity');
  }
  return 'orders/' + batchId + '/parts/' + hash + '.json';
}

export function validatePartOrders(orders) {
  if (!Array.isArray(orders) || !orders.length || orders.length > MAX_BATCH_ORDERS) return null;
  const ids = new Set();
  for (const order of orders) {
    if (!order || typeof order !== 'object' || Array.isArray(order) ||
        typeof order.id !== 'string' || !order.id.trim() ||
        ids.has(order.id) || !Array.isArray(order.parsedItems)) return null;
    for (const item of order.parsedItems) {
      if (!item || typeof item !== 'object' || Array.isArray(item) ||
          typeof item.text !== 'string' || !item.text.trim() ||
          !Number.isSafeInteger(item.qty) || item.qty < 1) return null;
    }
    ids.add(order.id);
  }
  return [...ids];
}

export async function partHash(json) {
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
}

export function checkManifestParts(hashes, orderCount) {
  return Array.isArray(hashes) && hashes.length > 0 &&
    hashes.length <= MAX_PART_COUNT && hashes.every(hash => typeof hash === 'string' && PART_HASH.test(hash)) &&
    new Set(hashes).size === hashes.length && Number.isSafeInteger(orderCount) &&
    orderCount > 0 && orderCount <= MAX_BATCH_ORDERS;
}
