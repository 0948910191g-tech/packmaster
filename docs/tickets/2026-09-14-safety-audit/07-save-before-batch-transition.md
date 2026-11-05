# Ticket 07 — Save-before-Switch สำหรับ Create/Open/Leave Batch

Status: ready-for-agent
Priority: High Stability

## What to build
ทำให้ทุก transition ที่เปลี่ยน active batch บันทึก state ล่าสุดของ batch ปัจจุบันก่อน แล้วค่อย create/open/switch เมื่อ save สำเร็จ.
ต้องไม่พึ่ง debounce autosave 600ms เป็น safety barrier เดียว.

## Demo path
แก้ Order แล้วกดเปิดหรือสร้าง Batch อื่นทันทีภายใน debounce window; กลับมา Batch เดิมแล้วข้อมูลล่าสุดต้องยังอยู่.

## Acceptance criteria
- [ ] create/open/switch/leave ที่เปลี่ยน active batch ใช้ save-before-transition semantics เดียวกัน.
- [ ] ถ้า save fail transition ถูกหยุดหรือ state ถูก recover อย่างชัดเจน; ห้ามทำข้อมูลล่าสุดหายเงียบ ๆ.
- [ ] autosave เดิมยังทำงานเป็น convenience แต่ correctness ไม่ขึ้นกับ timer.
- [ ] repeated fast switching ไม่ทำให้ batch A/B overwrite กัน.
- [ ] regression test จำลอง delayed/pending save และ fail บน behavior เดิมก่อน fix.

## Blocked by
- None — can start immediately

## Files to inspect
- Batch create/open/back/navigation/autosave handlers ใน `index.html`.
- `packmaster-batch.js` และ active-batch/batch tests ที่เกี่ยวข้อง.

## Notes / constraints
- Prefer central transition operation ถ้าทำได้โดย minimal change; ห้าม rewrite state architecture.
- ห้ามเปลี่ยน framework หรือเพิ่ม dependency.
- Clear Batch persistence failure เป็น adjacent issue; ถ้าพบต้องรายงาน ไม่ขยาย scope เว้นแต่จำเป็นต่อ invariant เดียวกัน.
- Preserve local-first behavior.