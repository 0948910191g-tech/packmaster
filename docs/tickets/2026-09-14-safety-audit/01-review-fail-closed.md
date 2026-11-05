# Ticket 01 — Review ต้อง Fail Closed เมื่อยังมี SKU/Qty ที่ไม่ได้แก้

Status: ready-for-agent
Priority: P0 Safety

## What to build
ทำให้สถานะ Ready อิงจากการ resolve รายการจริง ไม่ใช่แค่การกดยืนยัน warning ระดับ Order.
Acknowledgement ต้องหมายถึง “ตรวจแล้ว” แต่ห้ามทำ ambiguous/unresolved item หายหรือกลายเป็น Ready เอง.

## Demo path
สร้าง Order 2 รายการ: 1 matched + 1 ambiguous แล้วกดยืนยัน SKU; Order ต้องยัง Review และเห็นรายการที่ unresolved อยู่.

## Acceptance criteria
- [ ] matched + ambiguous + SKU acknowledgement ยังไม่เป็น Ready และ ambiguous item ไม่หาย.
- [ ] Order ที่ parsedItems ว่างแต่มี parser/review warning ไม่เป็น Ready เพียงเพราะ acknowledge SKU/Qty.
- [ ] Order ที่ทุก logical item resolve แล้วสามารถเป็น Ready ได้ตามกติกาปัจจุบัน.
- [ ] Emergency print override ถ้ามี ใช้ bypass ตอน print เท่านั้นและไม่แก้ Ready state ย้อนหลัง.
- [ ] เพิ่ม regression test ที่ fail บน code เดิมก่อนทำ minimal fix และ test เดิมที่เกี่ยวข้องผ่าน.

## Blocked by
- None — can start immediately

## Files to inspect
- `index.html` บริเวณ MappedOrders / review acknowledgement / quick order naming.
- `packmaster-exceptions.js` และ test review acknowledgement/exceptions ที่เกี่ยวข้อง.

## Notes / constraints
- ห้ามแก้ Parser, Qty parsing หรือ Matcher ใน ticket นี้.
- ห้ามซ่อน raw warning เพื่อทำให้ Order ดูผ่าน; readiness ต้องมี structural invariant.
- แก้ test เดิมได้เมื่อมัน encode behavior ที่พิสูจน์แล้วว่า unsafe แต่ต้องบันทึกเหตุผลชัดเจน.