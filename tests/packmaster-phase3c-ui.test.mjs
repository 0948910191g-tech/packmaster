import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const required = [
  '<script src="./packmaster-exceptions.js"></script>',
  'const exceptionApi = window.PackMasterExceptions;',
  "const [exceptionType, setExceptionType] = useState('ALL');",
  "const [exceptionSearch, setExceptionSearch] = useState('');",
  'const exceptionRows = useMemo(() =>',
  'const filteredExceptionRows = useMemo(() =>',
  'ต้องตรวจ',
  'รายการที่ต้องตรวจ',
  'ก่อนหน้า',
  'ถัดไป',
  'เปิดในรายการ',
  'ตรวจรายการ',
  'data-pm-action="review-exception"',
  "exceptionApi.getPrimaryStatus(exceptionApi.getExceptionFlags(order))"
];

required.forEach((marker) => assert.ok(html.includes(marker), `missing Phase 3C marker: ${marker}`));

assert.ok(html.includes('openExceptionInTable'), 'Exception Inbox must preserve the direct table/list navigation helper');
assert.ok(html.includes('handleReviewException'), 'Exception Inbox must expose the generalized Review action for SKU and Qty warnings');
assert.ok(html.includes('for (let i = 0; i < ordersToExport.length; i++)'), 'Exception Inbox must coexist with explicit PDF output scope');
assert.ok(html.includes('{PrintScopedOrders.map((order) => (<LabelCard key={`print-${order.id}`}'), 'Exception Inbox must coexist with explicit browser print scope');
assert.ok(html.includes('parseTikTokPositionedItems(positionedItems, declaredTotalQty)'), 'TikTok parser call must remain');
assert.ok(html.includes('parseShopeePositionedItems(positionedItems, declaredTotalQty)'), 'Shopee parser call must remain');

console.log('PackMaster Phase 3C Exception Inbox UI guard passed');
