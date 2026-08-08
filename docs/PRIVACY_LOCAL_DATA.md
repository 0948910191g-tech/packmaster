# PackMaster Local Data Privacy Guide

PackMaster รุ่น Local-first ไม่มี Account, Cloud Database หรือ Analytics SaaS ข้อมูลการทำงานหลักอยู่ใน Browser ของเครื่องที่ใช้งาน อย่างไรก็ตาม Local ไม่ได้แปลว่าไม่มีข้อมูลส่วนบุคคล ผู้ใช้ยังต้องดูแลไฟล์ PDF, Parsed Orders, Workspace Backup และไฟล์ Export ภายในร้านอย่างเหมาะสม

## ข้อมูลที่อาจมีข้อมูลลูกค้า

- Marketplace PDF ต้นฉบับ
- `pdfImage` ที่สร้างไว้เพื่อ Preview/Reprint
- Parsed Order/Tracking reference
- Workspace Backup JSON
- Save PDF ที่ใช้แพ็กสินค้า

ข้อมูลเหล่านี้ไม่ควรถูก Commit เข้า Public GitHub Repository หรือแนบใน Public issue

## ข้อมูล Diagnostics

Diagnostics สำหรับ Pilot ต้องมีเฉพาะ aggregate/capability information เช่น:

- จำนวน Batch
- จำนวน Orders
- Ready / Review / Unmapped totals
- Storage usage โดยประมาณ
- จำนวน duplicate warning/block
- Browser capability flags
- Error category แบบไม่ใส่ free-form customer data

Diagnostics ต้องไม่ส่งออก:

- `pdfImage`
- Raw PDF
- Tracking เต็ม
- Order ID เต็ม
- ชื่อลูกค้า
- ที่อยู่
- เบอร์โทร
- ข้อความ Error อิสระที่อาจมีข้อมูลเหล่านี้

ก่อนส่ง Diagnostics ให้ทีมพัฒนา ผู้ใช้ควรเปิดไฟล์ตรวจอีกครั้งเสมอ

## Workspace Backup

Workspace Backup มีไว้สำหรับ Recovery/ย้ายเครื่อง จึงอาจมี Parsed Order Data มากกว่า Diagnostics ให้ถือเป็นไฟล์ภายในร้าน:

- เก็บใน Drive/Folder ที่ผู้ใช้ควบคุม
- ไม่แชร์ Public link
- ไม่ Commit ลง Repository
- ลบสำเนาที่ไม่จำเป็นเมื่อ Pilot จบตาม policy ของร้าน

## Sanitized Fixture สำหรับ Bug

ถ้าพบ Parser/Matcher/Qty failure ให้สร้าง fixture ใหม่ที่เหลือเฉพาะข้อความ/ตำแหน่งที่จำเป็นต่อการ reproduce แล้วแทนข้อมูลลูกค้าด้วยค่าจำลอง เช่น `ORDER-SAFE-001`, `TRACKING-SAFE-001`

หลักการคือ Regression Test ต้องพิสูจน์บัคได้โดยไม่ต้องเก็บ PII จริง

## Browser / เครื่องที่ใช้

เพราะข้อมูลอยู่ Local Browser:

- หลีกเลี่ยงเครื่องสาธารณะ
- ใช้ Browser profile ที่ควบคุมได้
- ระวังการ Clear Site Data
- Backup ก่อนย้ายเครื่องหรือ reset Browser
- ถ้าเครื่องใช้ร่วมกันหลายคน ให้จัดการสิทธิ์ระดับ OS/Browser ของร้านเองจนกว่าจะมี Product Need จริงสำหรับ Multi-user/Auth

## Cloud / Database Gate

เอกสารนี้ไม่อนุญาตให้แก้ข้อจำกัด Local ด้วยการเพิ่ม Firebase, Supabase, Cloud DB, Login หรือ paid storage โดยอัตโนมัติ การเปลี่ยน architecture ต้องเกิดหลัง Pilot พิสูจน์ Need ของ cross-device/multi-user จริงและมีคำสั่งใหม่ชัดเจน
