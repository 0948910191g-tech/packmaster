import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const markers = [
  "const [batchViewFilter, setBatchViewFilter] = useState('ACTIVE');",
  'const visibleBatches = useMemo(() =>',
  'const handleArchiveBatch = async (batch) => {',
  'const handleRestoreArchivedBatch = async (batch) => {',
  'const handleDeleteSelectedArchived = async () => {',
  'Active',
  'Archived',
  'เก็บเข้าคลัง',
  'นำกลับ',
  'ลบที่เลือก'
];
markers.forEach((marker) => assert.ok(html.includes(marker), `missing Phase 3D UI marker: ${marker}`));

assert.ok(html.includes('visibleBatches.map((batch) =>'), 'Batch list must use archive filter derived view');
assert.ok(html.includes('batch.archivedAt'), 'UI must distinguish archive state');
assert.ok(html.includes('for (let i = 0; i < MappedOrders.length; i++)'), 'Save PDF must keep full MappedOrders');
assert.ok(html.includes('{MappedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Print area must keep full MappedOrders');

console.log('PackMaster Phase 3D archive UI guard passed');
