import fs from 'node:fs';

const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

const replaceOnce = (before, after, label) => {
  if (!html.includes(before)) throw new Error(`Missing patch anchor: ${label}`);
  html = html.replace(before, after);
};

replaceOnce(
  "const handleExportPDF = async (mode = 'FULL_BATCH', override = false) => {\n        if (ordersToExport.length === 0) return;",
  "const handleExportPDF = async (mode = 'FULL_BATCH', override = false) => {\n        if (MappedOrders.length === 0) return;",
  'export scope declaration order'
);

replaceOnce(
  'Filter / Pagination ใช้เฉพาะหน้าจอ • Print ยังใช้ข้อมูลเต็ม Batch',
  'Filter / Pagination ใช้เฉพาะหน้าจอ • Print / Save PDF ใช้ Scope ที่ผู้ใช้เลือก',
  'review scope helper copy'
);

replaceOnce(
  'แก้รายการที่ต้องตรวจให้ครบก่อน Print / Save PDF',
  'แนะนำให้แก้รายการที่ต้องตรวจให้ครบ หรือเลือกพิมพ์เฉพาะ Ready / Override ทั้ง Batch',
  'review action dock copy'
);

replaceOnce(
  'แก้ Exception ให้ครบก่อนพิมพ์ • Print / Save PDF จะถูกล็อกจนกว่าจะแก้รายการที่ต้องตรวจครบ',
  'แนะนำให้แก้ Exception ให้ครบก่อนพิมพ์ • หากงานเร่ง สามารถพิมพ์เฉพาะ Ready หรือยืนยัน Override ทั้ง Batch ในหน้า Review',
  'upload exception copy'
);

fs.writeFileSync(path, html);
console.log('Fixed Review export runtime and scoped-output copy');
