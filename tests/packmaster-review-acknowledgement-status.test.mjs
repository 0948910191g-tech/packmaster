import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const exceptions = require('../packmaster-exceptions.js');

test('SKU and Qty acknowledgements resolve review flags without deleting raw warnings', () => {
  const order = {
    id: 'ack-both',
    parserWarning: true,
    qtyWarning: true,
    displayItems: ['• ⚠️ ตรวจสอบ SKU', '• ⚠️ ตรวจสอบ Qty'],
    reviewAcknowledgements: {
      sku: { confirmed: true, confirmedAt: '2026-08-10T00:00:00.000Z' },
      qty: { confirmed: true, confirmedAt: '2026-08-10T00:00:01.000Z' }
    }
  };

  const flags = exceptions.getExceptionFlags(order);
  assert.equal(order.parserWarning, true, 'raw parser warning must remain untouched');
  assert.equal(order.qtyWarning, true, 'raw qty warning must remain untouched');
  assert.equal(flags.parserWarning, true, 'diagnostic raw parser warning remains observable');
  assert.equal(flags.reviewSku, false, 'confirmed SKU review is resolved');
  assert.equal(flags.reviewQty, false, 'confirmed Qty review is resolved');
  assert.equal(flags.ready, true);
  assert.deepEqual(exceptions.getExceptionTypes(flags), [], 'acknowledged raw parser warning must not keep the order in Exception Inbox');
});

test('acknowledging one warning does not hide another unresolved warning', () => {
  const flags = exceptions.getExceptionFlags({
    parserWarning: true,
    qtyWarning: true,
    displayItems: ['• ⚠️ ตรวจสอบ SKU', '• ⚠️ ตรวจสอบ Qty'],
    reviewAcknowledgements: {
      sku: { confirmed: true, confirmedAt: '2026-08-10T00:00:00.000Z' }
    }
  });

  assert.equal(flags.reviewSku, false);
  assert.equal(flags.reviewQty, true);
  assert.equal(flags.ready, false);
  assert.equal(exceptions.getPrimaryStatus(flags), 'REVIEW_QTY');
});

test('unmapped remains blocking until a real name is applied', () => {
  const flags = exceptions.getExceptionFlags({
    parserWarning: true,
    displayItems: ['• ยังไม่ตั้งชื่อ', '• ⚠️ ตรวจสอบ SKU'],
    reviewAcknowledgements: {
      sku: { confirmed: true, confirmedAt: '2026-08-10T00:00:00.000Z' }
    }
  });
  assert.equal(flags.reviewSku, false);
  assert.equal(flags.unmapped, true);
  assert.equal(flags.ready, false);
  assert.equal(exceptions.getPrimaryStatus(flags), 'UNMAPPED');
});
