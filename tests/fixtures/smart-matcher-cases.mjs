export const rules = [
  { id: 1, keyword: 'Hoya Baby Wipes 5 ห่อ', shortName: 'เด้งม่วง5' },
  { id: 2, keyword: 'Hoya Baby Wipes Value Pack 5 ห่อ', shortName: 'แวลู่5' },
  { id: 3, keyword: 'Hoya Baby Wipes Plus 5 ห่อ', shortName: 'ชมพู5' },
  { id: 4, keyword: 'Haku Cooling 1 ห่อ', shortName: 'เย็นฟ้า1' },
  { id: 5, keyword: 'Haku Cooling 3 ห่อ', shortName: 'เย็นฟ้า3' },
  { id: 6, keyword: 'Haku Extra Cooling 3 ห่อ', shortName: 'เอ็กซ์ตร้า3' }
];

const positioned = (rows) => rows.map(([text, x, y], index) => ({ text, x, y, index }));

// Sanitized from the real TikTok continuation order. No name/address/phone/tracking/order ID is retained.
export const tikTokContinuationPage1 = positioned([
  ['Product', 6, 303.3], ['Name', 35, 303.3], ['SKU', 128, 303.3], ['Seller', 170, 303.3], ['SKU', 192, 303.3], ['Qty', 261, 303.3],
  ['(มีกลิ่นหอม', 6, 314.9], ['5ห่อ)HOYA', 43, 314.3], ['ทิชชู่เปียก', 80, 314.9],
  ['baby', 6, 324.9], ['Wipes', 24, 324.9], ['Plus', 46, 324.9], ['80แผ่น/ห่อ', 62, 322.5],
  ['ค่าเริ่มต้น', 128, 314.9], ['HOYA', 170, 316.7], ['ชมพู', 192, 314.9], ['*5ห่อ', 208, 314.3], ['1', 265, 316.7]
]);

export const tikTokContinuationPage2 = positioned([
  ['Product', 6, 13.5], ['Name', 35, 13.5], ['SKU', 128, 13.5], ['Seller', 170, 13.5], ['SKU', 192, 13.5], ['Qty', 261, 13.5],
  ['(ราคาส่ง)HOYA', 6, 24.3], ['Baby', 57, 26.7], ['Wipes', 75, 26.7], ['Value', 98, 26.7], ['Pack', 6, 34.9], ['10', 24, 34.9], ['ห่อ', 34, 32.5], ['(800 แผ่น)', 45, 34.9], ['ทิชชู่เปียกเด็ก', 6, 41.3], ['สูตรน้ำบริสุทธิ์', 50, 41.3], ['99.9%', 96, 43.1],
  ['ค่าเริ่มต้น', 128, 24.9], ['HOYA', 170, 26.7], ['Value', 192, 26.7], ['Pack', 213, 26.7], ['10', 170, 34.9], ['1', 265, 26.7],
  ['80แผ่น/ห่อ', 6, 62.0], ['x', 41, 64.3], ['5แพ็ค(ม่วง)', 46, 62.1], ['HOYA', 84, 64.3], ['ทิชชู่เปียก', 6, 70.8], ['baby', 38, 72.5], ['Wipes', 56, 72.5], ['สูตรอ่อนโยน', 79, 70.4],
  ['แพ็ค5ห่อ', 128, 62.0], ['1', 265, 64.3]
]);

export const tikTokFivePackQtyThree = positioned([
  ['Product', 6, 13.5], ['Name', 35, 13.5], ['SKU', 128, 13.5], ['Seller', 170, 13.5], ['SKU', 192, 13.5], ['Qty', 261, 13.5],
  ['80แผ่น/ห่อ', 6, 24], ['x', 42, 26], ['5แพ็ค', 50, 24], ['HOYA', 80, 26], ['baby', 6, 34], ['Wipes', 25, 34],
  ['แพ็ค5ห่อ', 128, 24], ['3', 265, 26]
]);

export const shopeeQtyCases = [
  { text: '(6ห่อ) Haku Cooling กลิ่น MENTHOL 30 แผ่นใหญ่', packSize: 6, orderQty: 3 },
  { text: '(1ห่อ) HAKU Extra Cooling 30 แผ่น กลิ่นMENTHOL', packSize: 1, orderQty: 2 }
];
