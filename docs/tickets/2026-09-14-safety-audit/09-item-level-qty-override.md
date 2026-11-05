# Ticket 09 — Qty Override ต้องผูกกับ Item Row ไม่ใช่ Text อย่างเดียว

Status: ready-for-agent
Priority: Medium Safety

## What to build
ทำให้ Qty override ระบุ item instance ที่ชัดเจน เพื่อให้สองแถวที่ source text เหมือนกันสามารถแก้ Qty แยกกันได้.
ต้อง preserve auditability และ backward compatibility ของ override เดิมเท่าที่ปลอดภัย.

## Demo path
Order มี `SKU SAME` สองแถว Qty 1 และ 2; override เฉพาะแถวแรกเป็น 3 แล้ว effective Qty ต้องเป็น [3,2].

## Acceptance criteria
- [ ] override หนึ่ง item ไม่เปลี่ยน item อื่นที่ text เหมือนกัน.
- [ ] item identity ที่ใช้ stable ภายใน Order และไม่อิง display text เพียงอย่างเดียว.
- [ ] existing single-item override behavior ยังทำงาน.
- [ ] legacy override data ถูก migrate/read แบบ fail safe หรือถูกขอ review ถ้าแยก row ไม่ได้.
- [ ] เพิ่ม regression test สำหรับ duplicate text rows; อย่าแก้ parser เพื่อสร้าง identity เทียม.

## Blocked by
- None — can start immediately

## Files to inspect
- Qty override helpers/UI drafts ใน `index.html` และ `packmaster-review-overrides.js`.
- `tests/packmaster-review-overrides.test.mjs` และ related review tests.

## Notes / constraints
- ก่อน production fix ให้หา/สร้าง sanitized fixture ที่พิสูจน์รูปแบบ duplicate-row ที่ระบบรองรับ.
- Qty business rule เดิมคงอยู่: Qty มาจาก Marketplace Qty column; ห้าม derive จาก pack size/model.
- ห้ามเปลี่ยน parser หรือ quantity aggregation logic ที่ไม่เกี่ยวข้อง.
- ถ้าไม่มี real fixture รองรับ ให้ส่งผลเป็น confirmed code risk + regression harness ก่อน merge behavior change.