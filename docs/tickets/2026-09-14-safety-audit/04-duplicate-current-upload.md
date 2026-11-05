# Ticket 04 — Duplicate Guard ตรวจซ้ำภายใน Upload รอบเดียวกัน

Status: ready-for-agent
Priority: High Safety

## What to build
เพิ่มการตรวจ duplicate ระหว่างไฟล์/Order ที่เข้ามาใน selection เดียวกัน ไม่ใช่เทียบเฉพาะกับข้อมูลที่ persist อยู่ก่อนหน้า.
ต้องแยกให้ผู้ใช้รู้ว่า duplicate มาจาก history หรือเกิดใน current upload.

## Demo path
เลือก PDF เดิมสองสำเนาพร้อมกัน หรือป้อน incoming Orders สองรายการที่มี Order ID เดียวกัน; ระบบต้องตรวจเจอก่อนเพิ่มทั้งคู่.

## Acceptance criteria
- [ ] identical PDF hash ภายใน current selection ถูกแจ้ง duplicate.
- [ ] duplicate Order identity ภายใน newOrders ชุดเดียวกันถูกตรวจเจอแม้ existingOrders ว่าง.
- [ ] persisted-history duplicate behavior เดิมยังทำงาน.
- [ ] warning/result แยก source ได้อย่างน้อย current-upload vs existing-history.
- [ ] regression tests fail บน code เดิมและ duplicate tests เดิมผ่านหลังแก้.

## Blocked by
- None — can start immediately

## Files to inspect
- `packmaster-duplicate.js` และ upload duplicate flow ใน `index.html`.
- `tests/packmaster-duplicate.test.mjs`, `tests/packmaster-duplicate-sidecar.test.mjs`.

## Notes / constraints
- อย่าพึ่งแก้ archive/storage sidecar corruption ใน ticket นี้; Ticket 10 รับผิดชอบ.
- ห้าม dedupe ด้วยการลบ Order เงียบ ๆ; ต้องรักษา warning/decision flow ปัจจุบัน.
- ใช้ seen-set สำหรับรอบปัจจุบันโดยไม่เปลี่ยน parser behavior.