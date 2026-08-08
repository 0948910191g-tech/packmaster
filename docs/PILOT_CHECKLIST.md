# PackMaster External Pilot Checklist

เอกสารนี้ใช้สำหรับทดลอง PackMaster กับร้าน/บริษัทภายนอกแบบ Local-first โดยไม่ใช้ Cloud Database, Login หรือบริการเสียเงิน

## ก่อนเริ่ม Pilot

1. ใช้ Browser รุ่นปัจจุบันบนเครื่องที่จะใช้แพ็กจริง
2. ตรวจว่า PackMaster เปิดจาก GitHub Pages ได้ตามปกติ
3. เตรียม SKU Mapping โดยใช้ข้อมูลตัวอย่างหรือข้อมูลร้านจริงบนเครื่องของร้านเท่านั้น
4. กด Workspace Backup ก่อนเริ่มงานจริง และเก็บไฟล์ Backup ไว้ในพื้นที่ภายในร้าน
5. ห้ามอัปโหลด PDF ลูกค้า, Workspace Backup หรือ Diagnostics ที่ยังไม่ได้ตรวจสอบเข้า Public GitHub issue/repository

## Smoke Test ก่อนหน้างาน

- สร้าง Batch ใหม่
- Upload ตัวอย่าง Shopee อย่างน้อย 1 ชุด
- Upload ตัวอย่าง TikTok อย่างน้อย 1 ชุด
- ตรวจ Summary Ready / Review SKU / Review Qty / Unmapped
- เปิด Exception Inbox และลอง Search/Filter
- ทดสอบ Print และ Save PDF กับเครื่องพิมพ์จริง
- สร้าง Batch ที่สองและยืนยันว่า Batch แรกยังอยู่
- ลอง Archive/Restore Batch หนึ่งครั้ง
- ทดสอบ Workspace Backup แล้ว Restore บน Browser profile ทดสอบก่อนใช้กับข้อมูลสำคัญ

## KPI ที่เก็บระหว่าง Pilot

ให้เก็บแบบ Manual/Local ก่อน ไม่ต้องเพิ่ม Analytics SaaS:

- Orders processed / day
- นาทีที่ใช้ต่อ 100 Orders
- % Ready อัตโนมัติ
- % Review SKU
- % Review Qty
- % Unmapped
- Wrong Match ที่พบจริง
- จำนวน Duplicate upload ที่ระบบช่วยเตือน
- Browser crash / memory issue / storage warning
- เวลา Setup Mapping เริ่มต้น
- ความพึงพอใจผู้แพ็ก
- ความต้องการ Multi-user / Cross-device ที่เกิดขึ้นจริง
- Willingness to pay หลังใช้งานจริง

## Failure Case ที่ควรบันทึก

ถ้า Parser/Matcher/Qty ผิด ให้หยุดแก้แบบเดาและเก็บหลักฐานแบบ Sanitize PII:

1. อาการที่เห็น
2. Platform
3. Screenshot ที่ปิดชื่อ/ที่อยู่/เบอร์/Tracking/Order ID แล้ว
4. ข้อความหรือ positioned fixture ที่จำเป็นต่อการ reproduce
5. Output ที่ได้
6. Output ที่ควรได้

ห้าม Commit PDF ลูกค้าจริงลง Repository

## Exit Criteria ของ Pilot

Pilot ถือว่าให้ข้อมูลพอสำหรับตัดสิน Product ต่อเมื่อรู้ว่า:

- ร้านประหยัดเวลาได้จริงเท่าไร
- Error ลดลงหรือไม่
- Mapping effort ยอมรับได้หรือไม่
- Browser/local-first เพียงพอหรือไม่
- มี Need ของ Multi-user/Cross-device จริงหรือยัง

ถ้ายังไม่มี Need ของ Multi-user, Cross-device, Subscription หรือ Cloud History ให้คง Local-first ต่อและยังไม่เพิ่ม Database
