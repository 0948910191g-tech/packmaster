# PackMaster Local Recovery Guide

PackMaster รุ่นปัจจุบันเป็น Local-first ข้อมูล Batch และ Orders เก็บใน Browser ของเครื่องที่ใช้งาน ไม่ได้ Sync ไป Cloud Database ดังนั้น Workspace Backup คือ Safety Net หลักก่อน External Pilot

## กรณี Browser ยังเปิดงานปัจจุบันได้ แต่ Auto-save มี Error

1. อย่าปิดแท็บทันที
2. อย่าล้าง Site Data / Cache / Browser profile
3. ถ้าเมนู Workspace Backup ยังทำงาน ให้ Export Backup ก่อน
4. ถ้ากำลัง Review/Print อยู่ ให้จบงานปัจจุบันหรือ Save PDF ที่จำเป็นก่อนสลับ Batch
5. บันทึก Error แบบไม่ใส่ข้อมูลลูกค้า แล้วค่อย Reload หลังมี Backup

## กรณีพื้นที่ Browser ใกล้เต็ม

หน้า Storage Health จะแสดง usage/quota โดยประมาณเมื่อ Browser รองรับ `navigator.storage.estimate()`

วิธีลดพื้นที่ที่ปลอดภัยกว่า:

1. Archive Batch เก่าที่จบแล้ว
2. Backup Workspace ก่อน Cleanup
3. เลือก Archived Batch ที่ไม่จำเป็นต้อง Reprint จากภาพเดิม
4. ใช้ `ล้างเฉพาะรูปสำหรับ Reprint`

Cleanup นี้ควรลบเฉพาะ `pdfImage` payload และเก็บ Parsed/Mapping/Status data ต่อไว้ แต่การ Reprint ภาพใบเดิมจาก Batch นั้นอาจไม่สมบูรณ์อีก จึงต้องยืนยันก่อนทำ

## กรณีต้องย้ายเครื่อง

1. ที่เครื่องเก่า Export Workspace Backup
2. เก็บไฟล์ Backup ในพื้นที่ภายในร้าน
3. เปิด PackMaster บนเครื่องใหม่
4. Import Workspace Backup
5. ตรวจ Preview จำนวน SKU Rules / Batches / Orders ก่อน Replace
6. ทดลองเปิด Batch เก่าและเช็ก Mapping/Review ก่อนเริ่มงานใหม่

ห้ามใช้ GitHub Public Repository, Public issue หรือแชทสาธารณะเป็นที่เก็บ Backup จริง เพราะ Backup อาจมี Parsed Order Data

## กรณี Browser Data ถูกล้างแล้ว

ถ้ามี Backup:
- เปิด PackMaster
- Restore Backup ที่เชื่อถือได้
- ตรวจจำนวน Batch/SKU ก่อนทำงานต่อ

ถ้าไม่มี Backup:
- ข้อมูล Local ที่ Browser ลบแล้วอาจกู้จาก PackMaster ไม่ได้
- อย่าเดาข้อมูล Order หรือ Mapping ขึ้นใหม่โดยไม่มีต้นทาง
- ดาวน์โหลด PDF Marketplace ใหม่เฉพาะเมื่อยังเข้าถึงต้นทางได้ แล้วสร้าง Batch ใหม่

## กรณี Restore ล้มเหลว

PackMaster ต้อง Validate schema/version ก่อน Replace Workspace ถ้าไฟล์ผิดรูปแบบหรือเวอร์ชันไม่รองรับ ให้หยุด Restore และคง Workspace เดิมไว้

สิ่งที่ควรทำ:
- ตรวจว่าไฟล์เป็น `packmaster-workspace-backup`
- ห้ามแก้ JSON ด้วยมือถ้าไม่เข้าใจ shape
- เก็บไฟล์เดิมไว้ก่อนทดลองสำเนา
- Export Diagnostics แบบ Local เพื่อส่งข้อมูล aggregate ให้ทีมพัฒนาโดยไม่ส่ง Tracking/PDF image

## สิ่งที่ห้ามทำระหว่าง Recovery

- ห้าม Clear Browser Data ก่อน Backup ถ้ายังเปิด Workspace ได้
- ห้าม Commit PDF/Backup จริงลง Repo
- ห้ามแก้ Parser เพื่อแก้ปัญหา Storage
- ห้ามเพิ่ม Cloud Database เป็น hotfix เพียงเพื่อแก้เหตุการณ์ Local Storage ชั่วคราว
