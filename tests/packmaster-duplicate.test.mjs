import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const duplicate = require(path.resolve(__dirname, '../packmaster-duplicate.js'));

assert.equal(typeof duplicate.hashArrayBuffer, 'function');
assert.equal(typeof duplicate.hashFile, 'function');
assert.equal(typeof duplicate.findExactFileDuplicate, 'function');
assert.equal(typeof duplicate.findOrderDuplicateSignals, 'function');

const fakeCrypto = {
  subtle: {
    async digest(name, buffer) {
      assert.equal(name, 'SHA-256');
      assert.ok(buffer instanceof ArrayBuffer);
      return Uint8Array.from([0, 1, 2, 254, 255]).buffer;
    }
  }
};

const hash = await duplicate.hashArrayBuffer(new Uint8Array([1, 2, 3]).buffer, fakeCrypto);
assert.equal(hash, '000102feff');

const fileHash = await duplicate.hashFile({
  async arrayBuffer() { return new Uint8Array([9, 8, 7]).buffer; }
}, fakeCrypto);
assert.equal(fileHash, '000102feff');

const exact = duplicate.findExactFileDuplicate('ABC123', [
  { name: 'old.pdf', hash: 'abc123' },
  { name: 'other.pdf', hash: 'zzz' }
]);
assert.equal(exact.name, 'old.pdf');
assert.equal(duplicate.findExactFileDuplicate('', [{ hash: '' }]), null);

assert.equal(
  duplicate.getOrderIdentity({ platform: 'TikTok', orderId: 'A-100', tracking: 'TH999' }),
  'ORDER|TIKTOK|A-100'
);
assert.equal(
  duplicate.getOrderIdentity({ platform: 'Shopee', orderId: '', tracking: 'SPX123' }),
  'TRACKING|SHOPEE|SPX123'
);
assert.equal(duplicate.getOrderIdentity({ platform: 'Shopee', tracking: 'PAGE-2' }), null);

const collisions = duplicate.findOrderDuplicateSignals([
  { id: 'new-1', platform: 'TIKTOK', orderId: 'ORDER-X', tracking: 'TH-A' },
  { id: 'new-2', platform: 'SHOPEE', tracking: 'SPX-NEW' },
  { id: 'new-3', platform: 'SHOPEE', tracking: 'PAGE-3' }
], [
  { id: 'old-1', platform: 'TIKTOK', orderId: 'order-x', tracking: 'TH-OLD' },
  { id: 'old-2', platform: 'SHOPEE', tracking: 'SPX-OLD' }
]);
assert.equal(collisions.length, 1);
assert.equal(collisions[0].incoming.id, 'new-1');
assert.equal(collisions[0].existing.id, 'old-1');

const crossPlatform = duplicate.findOrderDuplicateSignals(
  [{ platform: 'TIKTOK', tracking: 'SAME' }],
  [{ platform: 'SHOPEE', tracking: 'SAME' }]
);
assert.equal(crossPlatform.length, 0, 'same tracking on different platforms must not collide automatically');

console.log('PackMaster duplicate detection regression tests passed');
