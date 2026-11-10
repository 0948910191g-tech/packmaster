import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const registryApi = require('../packmaster-marketplace-registry.js');
const bootstrap = require('../packmaster-local-registry-bootstrap.js');

const rawRegistry = JSON.parse(
  fs.readFileSync(new URL('../data/packmaster-marketplace-registry.json', import.meta.url), 'utf8')
);

test('Ticket 02: REGISTRY_BRAND_CATEGORIES and getRegistryBrandCategory are exported properly', () => {
  assert.equal(typeof bootstrap.getRegistryBrandCategory, 'function', 'getRegistryBrandCategory must be a function');
  assert.ok(Array.isArray(bootstrap.REGISTRY_BRAND_CATEGORIES), 'REGISTRY_BRAND_CATEGORIES must be an array');
  assert.equal(bootstrap.REGISTRY_BRAND_CATEGORIES.length, 6, 'Must define exactly 6 PPG brand categories');

  const expectedCategories = [
    { id: 'HOYA_BABY', label: 'HOYA Baby' },
    { id: 'HAKU_BABY', label: 'HAKU Baby' },
    { id: 'EXCARE', label: 'EXCARE' },
    { id: 'NONO', label: 'NONO' },
    { id: 'HOYA_OTHER', label: 'HOYA อื่นๆ' },
    { id: 'OTHER', label: 'สินค้าอื่นๆ' }
  ];
  assert.deepEqual(bootstrap.REGISTRY_BRAND_CATEGORIES, expectedCategories);
});

test('Ticket 02: getRegistryBrandCategory classifies all 169 TikTok nameable rows into exact expected brand counts', () => {
  const tiktokRows = registryApi.getNameableRows(rawRegistry.platforms.TIKTOK, 'TIKTOK');
  assert.equal(tiktokRows.length, 169, 'TikTok must have 169 nameable rows');

  const counts = {
    HOYA_BABY: 0,
    HAKU_BABY: 0,
    EXCARE: 0,
    NONO: 0,
    HOYA_OTHER: 0,
    OTHER: 0
  };

  for (const row of tiktokRows) {
    const category = bootstrap.getRegistryBrandCategory(row);
    assert.ok(category in counts, `Unknown category ${category} for row ${JSON.stringify(row)}`);
    counts[category] += 1;
  }

  assert.deepEqual(counts, {
    HOYA_BABY: 20,
    HAKU_BABY: 43,
    EXCARE: 42,
    NONO: 10,
    HOYA_OTHER: 39,
    OTHER: 15
  });
});

test('Ticket 02: getRegistryBrandCategory classifies all 156 Shopee nameable rows into exact expected brand counts', () => {
  const shopeeRows = registryApi.getNameableRows(rawRegistry.platforms.SHOPEE, 'SHOPEE');
  assert.equal(shopeeRows.length, 156, 'Shopee must have 156 nameable rows');

  const counts = {
    HOYA_BABY: 0,
    HAKU_BABY: 0,
    EXCARE: 0,
    NONO: 0,
    HOYA_OTHER: 0,
    OTHER: 0
  };

  for (const row of shopeeRows) {
    const category = bootstrap.getRegistryBrandCategory(row);
    assert.ok(category in counts, `Unknown category ${category} for row ${JSON.stringify(row)}`);
    counts[category] += 1;
  }

  assert.deepEqual(counts, {
    HOYA_BABY: 14,
    HAKU_BABY: 27,
    EXCARE: 37,
    NONO: 8,
    HOYA_OTHER: 39,
    OTHER: 31
  });
});

test('Ticket 02: representative unit test cases for each of the 6 brand categories', () => {
  const { getRegistryBrandCategory } = bootstrap;

  // NONO category tests
  assert.equal(getRegistryBrandCategory({ productName: 'NONO Wipes 80 แผ่น' }), 'NONO');
  assert.equal(getRegistryBrandCategory({ variantName: 'ทิชชู่เปียก โนโน่' }), 'NONO');
  assert.equal(getRegistryBrandCategory({ sellerSku: 'NONO-001' }), 'NONO');

  // EXCARE category tests
  assert.equal(getRegistryBrandCategory({ productName: 'EXCARE Cleansing Wipes' }), 'EXCARE');
  assert.equal(getRegistryBrandCategory({ title: 'ผ้าเช็ดทำความสะอาด เอ็กซ์แคร์' }), 'EXCARE');
  assert.equal(getRegistryBrandCategory({ sellerSku: 'EXCARE-BLUE' }), 'EXCARE');

  // HAKU_BABY category tests
  assert.equal(getRegistryBrandCategory({ productName: 'HAKU Baby Wipes 80แผ่น' }), 'HAKU_BABY');
  assert.equal(getRegistryBrandCategory({ variantName: 'ฮากุ เบบี้ สีฟ้า' }), 'HAKU_BABY');
  assert.equal(getRegistryBrandCategory({ sellerSku: 'HAKU-PINK' }), 'HAKU_BABY');

  // HOYA_BABY category tests (HOYA with baby keys: baby, เบบี้, bb, value pack, ม่วง, ชมพู, 80แผ่น, 400 แผ่น, สูตรมีกลิ่น, สูตรไม่มีกลิ่น)
  assert.equal(getRegistryBrandCategory({ productName: 'HOYA Baby Wipes' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'โฮญ่า เบบี้ ไวพส์' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'HOYA BB Wipes' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'HOYA Value Pack 5' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'HOYA ทิชชู่เปียก ม่วง' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'HOYA ทิชชู่ ชมพู' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'โฮญ่า 80แผ่น' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'HOYA 400 แผ่น' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'โฮญ่า สูตรมีกลิ่น' }), 'HOYA_BABY');
  assert.equal(getRegistryBrandCategory({ productName: 'HOYA สูตรไม่มีกลิ่น' }), 'HOYA_BABY');

  // HOYA_OTHER category tests (HOYA without baby keywords)
  assert.equal(getRegistryBrandCategory({ productName: 'HOYA Official Jersey 2026' }), 'HOYA_OTHER');
  assert.equal(getRegistryBrandCategory({ title: 'โฮญ่า เสื้อยืด' }), 'HOYA_OTHER');
  assert.equal(getRegistryBrandCategory({ sellerSku: 'HOYA-T-SHIRT-M' }), 'HOYA_OTHER');

  // OTHER category tests
  assert.equal(getRegistryBrandCategory({ productName: 'Official Jersey Sport' }), 'OTHER');
  assert.equal(getRegistryBrandCategory({ title: 'กระเป๋าผ้า' }), 'OTHER');
  assert.equal(getRegistryBrandCategory({ sellerSku: 'UNKNOWN-ITEM' }), 'OTHER');
});

test('Ticket 02: null, undefined, empty object, and malformed row safety', () => {
  const { getRegistryBrandCategory } = bootstrap;

  assert.equal(getRegistryBrandCategory(null), 'OTHER');
  assert.equal(getRegistryBrandCategory(undefined), 'OTHER');
  assert.equal(getRegistryBrandCategory({}), 'OTHER');
  assert.equal(getRegistryBrandCategory({ productName: null, variantName: undefined }), 'OTHER');
  assert.equal(getRegistryBrandCategory({ sellerSku: 12345, productName: false }), 'OTHER');
});
