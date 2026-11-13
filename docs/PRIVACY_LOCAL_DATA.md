# PackMaster Local Data Privacy Guide

PackMaster เก็บ Batch, Orders และ SKU Mapping ใน Browser แบบ Local-first โดยค่าเริ่มต้น ไม่มี Account หรือ Analytics SaaS แต่มีตัวเลือกซิงก์เฉพาะทะเบียนสินค้า Marketplace กับ Cloudflare D1 หลังตั้งค่า Worker แยกต่างหาก อย่างไรก็ตาม Local ไม่ได้แปลว่าไม่มีข้อมูลส่วนบุคคล ผู้ใช้ยังต้องดูแลไฟล์ PDF, Parsed Orders, Workspace Backup และไฟล์ Export ภายในร้านอย่างเหมาะสม

## ข้อมูลที่อาจมีข้อมูลลูกค้า

- Marketplace PDF ต้นฉบับ
- `pdfImage` ที่สร้างไว้เพื่อ Preview/Reprint
- Parsed Order/Tracking reference
- Workspace Backup JSON (อาจรวมทะเบียนสินค้าและ SKU ของ TikTok/Shopee)
- Save PDF ที่ใช้แพ็กสินค้า

ข้อมูลเหล่านี้ไม่ควรถูก Commit เข้า Public GitHub Repository หรือแนบใน Public issue

## Marketplace Product Registry

Marketplace product names and SKU/model rows are stored in this Browser's local storage by default, separated by TikTok and Shopee. They remain separate from the SKU Mapping library; importing a catalog does not create internal names or matching rules. Workspace Backups include the registry when it can be read successfully. Keep source catalogs and backups private and out of Git.

An optional Cloudflare D1 registry sync is available only after a Worker and database are configured. Cloud sync is manual, platform-scoped, and requires confirmation; it uploads only the marketplace catalog, not customer orders, PDF images, batches, or SKU Mapping. The access token is held in page memory, not localStorage, and must never be committed or embedded in the HTML. This token-entry prototype is for an internal trusted environment; production multi-user access requires a dedicated authentication and authorization review. See `docs/REGISTRY_CLOUD_SETUP.md`.

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

- มีตัวเลือกสำรองแบบ **"ไม่รวมรูปใบปะหน้า (ลดขนาดไฟล์/ซ่อนข้อมูลลูกค้า)"**: ตัดฟิลด์ `pdfImage` ออกจากทุกออเดอร์และ Reprint Snapshot ช่วยลดขนาดไฟล์และไม่ส่งออกรูปภาพใบปะหน้าจริงของลูกค้า ทำให้แชร์ไฟล์เพื่อแก้ปัญหาได้ปลอดภัยขึ้น
- เก็บใน Drive/Folder ที่ผู้ใช้ควบคุม
- ไม่แชร์ Public link
- ไม่ Commit ลง Repository
- ลบสำเนาที่ไม่จำเป็นเมื่อ Pilot จบตาม policy ของร้าน

## Desktop Recovery Journal & History Snapshots

บน PackMaster Desktop แอปมีระบบบันทึก Recovery Snapshot ก่อนเริ่มการกู้คืน Workspace โดยจัดเก็บใน `recovery/history/` ภายในโปรไฟล์ของผู้ใช้:

- ระบบมีนโยบายตัดทอนประวัติเก่าอัตโนมัติ (Retention & Pruning): เก็บประวัติ Recovery สูงสุดไม่เกิน 10 รายการ และลบ Snapshot ที่มีอายุเกิน 30 วันโดยอัตโนมัติทุกครั้งที่มีการบันทึกประวัติสำเร็จ
- ป้องกันการสะสมข้อมูลใบปะหน้าและ Snapshot เก่าในดิสก์ของเครื่อง

## Cloud Mode Architecture & Security

เมื่อเปิดใช้งาน Cloud Mode สถาปัตยกรรมข้อมูลจะแบ่งการจัดเก็บอย่างชัดเจน:

- **ข้อมูลบน Cloudflare D1 / Cloudflare Worker**: ข้อมูลงานส่วนกลาง ได้แก่ Batch, Orders, Archive, Reprint Snapshots, Marketplace Registry และ Registry Assignments
- **ข้อมูลใน Local Browser Storage**: ข้อมูล sidecar เฉพาะเครื่อง ได้แก่ Duplicate history (ลายนิ้วมือไฟล์กันนำเข้าซ้ำ) และ Source filenames (ชื่อไฟล์ต้นทางของ Batch) จะยังคงอยู่ในเครื่องนี้เท่านั้น ไม่ถูกส่งขึ้น Cloud


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
