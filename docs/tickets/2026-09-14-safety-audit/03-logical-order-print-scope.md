# Ticket 03 — Ready-only Print ต้องทำงานระดับ Logical Order

Status: ready-for-agent
Priority: High Safety

## What to build
ทำให้ primary page และ continuation records ที่มี orderId เดียวกันใช้ readiness เดียวกันตอน Print/Save Ready Only.
ห้ามเกิดกรณี main Order ถูก block แต่ continuation page ถูกพิมพ์เดี่ยว ๆ.

## Demo path
สร้าง logical Order ที่ main record มี SKU warning และ continuation record ไม่มี parsedItems; READY_ONLY ต้องเลือก 0 record จาก Order นี้.

## Acceptance criteria
- [ ] continuation record inherit blocked/ready state จาก logical Order หลัก.
- [ ] ถ้า logical Order พร้อม ทุก page/record ที่เป็นส่วนของ Order นั้นถูกเลือกครบตาม print scope.
- [ ] ถ้า logical Order ไม่พร้อม ไม่มี page/record ใดของ Order นั้นหลุดเข้า READY_ONLY.
- [ ] FULL_BATCH behavior เดิมไม่เสีย.
- [ ] stale hybrid print test ถูกอัปเดตให้สะท้อน behavior ปัจจุบันและ print-scope tests ผ่าน.

## Blocked by
- Ticket 01 — Review ต้อง Fail Closed

## Files to inspect
- `packmaster-print-scope.js`, `index.html` print/save PDF selection flow.
- `tests/packmaster-print-scope.test.mjs`, `tests/packmaster-hybrid-review-grid.test.mjs`.

## Notes / constraints
- Group ด้วย logical Order identity ที่ระบบใช้อยู่จริง; ห้ามเดา schema ใหม่.
- ห้ามแก้ Parser เพื่อทำให้ continuation มี parsedItems ปลอม.
- ตรวจ summary/count ที่เกี่ยวข้องว่ากำลังนับ record หรือ logical Order และรายงานถ้าพบ semantic conflict.