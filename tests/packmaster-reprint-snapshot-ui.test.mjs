import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync('index.html', 'utf8');

assert.ok(html.includes('<script src="./packmaster-reprint-snapshot.js"></script>'));
assert.ok(html.includes('const reprintSnapshotApi = window.PackMasterReprintSnapshot;'));
assert.ok(html.includes('const LiveMappedOrders = useMemo(() => orders.map(o => {'));
assert.ok(html.includes("resolution: 'manual'"), 'manual resolution must be auditable');
assert.ok(html.includes("resolution: 'rule'"), 'rule resolution must be auditable');
assert.ok(html.includes('reprintSnapshotApi.saveBatchSnapshot(activeBatch.id, LiveMappedOrders, printedAt'));
assert.ok(html.includes('reprintSnapshotApi.applyBatchSnapshot(LiveMappedOrders, historicalSnapshot)'));
assert.ok(html.includes('ประวัติผลพิมพ์เดิมไม่ครบ — ตรวจสอบก่อน Reprint'), 'legacy completed batches without a valid snapshot must fail visible');
assert.ok(html.includes('reprintSnapshotApi.clearBatchSnapshot(activeBatch.id)'), 'editing a completed Batch must unfreeze its old snapshot');
assert.ok(html.includes('reprintSnapshotApi.clearBatchSnapshot(batch.id)'), 'deleting a Batch must remove snapshot sidecar');
assert.ok(html.includes('if (!completed) return;'), 'clean full-batch print must stop if snapshot persistence fails');
console.log('PackMaster reprint snapshot UI integration contract passed');