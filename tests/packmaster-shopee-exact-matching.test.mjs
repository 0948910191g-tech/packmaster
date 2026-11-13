import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import skuNormalization from '../packmaster-sku-normalization.js';
import registryIdentity from '../packmaster-registry-identity.js';
import registryMatcher from '../packmaster-registry-matcher.js';
import marketplaceRegistry from '../packmaster-marketplace-registry.js';
import localRegistryBootstrap from '../packmaster-local-registry-bootstrap.js';

test('Shopee matching bridges Thai PDF font variations, displaced marks, and ellipsis truncation', () => {
  const regData = JSON.parse(fs.readFileSync('./data/packmaster-marketplace-registry.json', 'utf8'));
  const assignData = JSON.parse(fs.readFileSync('./data/packmaster-registry-assignments.json', 'utf8'));

  const store = marketplaceRegistry.validateStore(regData);
  const complete = localRegistryBootstrap.ensureRegistryAssignments(store, assignData, marketplaceRegistry, registryMatcher, registryIdentity, assignData);
  const index = registryIdentity.buildIndex(store, marketplaceRegistry);

  // 1. Pack 3 with displaced karan in PDF:
  const itemPack3 = { text: 'แพ็ค3หอ HOYA Baby Wipes ทิชชูเปียกสูตรน้ําบริสุทธิ 99.9% 80 ์ แผน สําหรับผิวบอบบาง ผานุมชุมช้ืนไมบาดผิว' };
  const mPack3 = registryMatcher.match(index, 'SHOPEE', itemPack3, complete, registryIdentity);
  assert.equal(mPack3.status, 'matched');
  assert.equal(mPack3.assignment.shortName, 'เด้งม่วง3');

  // 2. Truncated HAKU 36 with ellipsis:
  const item36 = { text: '( ยกลัง 36 ห่อ ) ทิชชู่เปียก HAKU Baby Wipes สูตรน้ำแร่ 40 แผ่น / ... ห่อ ผ้าเปียกเด็ก ไม่มีแอลกอฮอล์ pH Balance สำหรับเด็กและผิ' };
  const m36 = registryMatcher.match(index, 'SHOPEE', item36, complete, registryIdentity);
  assert.equal(m36.status, 'matched');
  assert.equal(m36.assignment.shortName, 'ฮากุ 1 ลัง');

  // 3. TikTok Value pack 5: unknown SKU without alias goes to Review; with manual alias it matches
  const itemValue = { text: '( แพ็ค 5 หอ 400 แผน ) HOYA Baby Wipes Value Pack ทิชชูเปียกเด็ก สูตรนํ้าบริสุทธิ์ 99.9% ไมมีแอลกอฮอล ไมมีนํ้าหอม | 5 หอ HOYA Baby Wipes Value Pack รวม 400 แผ น | 5 หอ HOYA Baby Wipes Value Pack', sellerSku: '5 หอ HOYA Baby Wipes Value Pack' };
  const mValueUnmatched = registryMatcher.match(index, 'TIKTOK', itemValue, complete, registryIdentity);
  assert.equal(mValueUnmatched.status, 'unmatched');
  assert.equal(mValueUnmatched.reason, 'seller_sku_not_found');

  const targetRow = regData.platforms.TIKTOK.skuRows.find(r => r.productId === '1736126922142418758');
  const completeWithAlias = registryMatcher.upsertManualSkuAlias(complete, index, 'TIKTOK', itemValue, targetRow, 'HOYA Value 5', registryIdentity);
  const mValueMatched = registryMatcher.match(index, 'TIKTOK', itemValue, completeWithAlias, registryIdentity);
  assert.equal(mValueMatched.status, 'matched');
  assert.equal(mValueMatched.assignment.shortName, 'HOYA Value 5');

  // 4. Unfound Shopee item saving via saveConfirmedAssignment requires productId and throws
  const unfound = { status: 'not_found', identityType: 'catalog_row', sellerSku: null, catalogKey: 'new_shopee_key' };
  assert.throws(() => {
    registryMatcher.saveConfirmedAssignment(complete, index, 'SHOPEE', unfound, 'ฮากุ 1 ลัง');
  }, /Confirmed registry assignment requires productId/);
});
