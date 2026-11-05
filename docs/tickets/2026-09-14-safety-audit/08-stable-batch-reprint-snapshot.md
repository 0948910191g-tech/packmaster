# Ticket 08 — Completed/Reprint Batch ต้องคงผล Mapping เดิม

Status: ready-for-agent
Priority: High Integrity

## What to build
ทำให้ batch ที่ผ่าน review/print completion แล้วมี stable resolved snapshot สำหรับ reprint แทนการ rematch ด้วย global dictionary ล่าสุดแบบเงียบ ๆ.
การใช้ dictionary ใหม่กับ batch เก่าต้องเป็น explicit action แยกต่างหากถ้ามีในอนาคต.

## Demo path
ทำ Batch ให้ resolve เป็นเด้งม่วง5 แล้วปิดงาน; แก้ global mapping ภายหลัง; เปิด reprint batch เดิม ผลต้องยังเป็นเด้งม่วง5.

## Acceptance criteria
- [ ] completed/reprint batch ใช้ persisted resolved result ที่ stable ต่อ dictionary changes.
- [ ] active/incomplete batch behavior ไม่ถูก freeze ก่อนจังหวะที่กำหนดชัดเจน.
- [ ] snapshot เก็บข้อมูลพอ audit ได้ว่า item ใช้ rule/output อะไร โดยไม่เพิ่ม cloud dependency.
- [ ] dictionary edit/delete หลัง completion ไม่เปลี่ยน historical print output.
- [ ] regression test พิสูจน์ old behavior rematches และ new behavior remains stable.

## Blocked by
- Ticket 01 — Review ต้อง Fail Closed
- Ticket 02 — Matcher Identity Gate
- Ticket 07 — Save-before-Switch

## Files to inspect
- Batch persistence/open/reprint flow ใน `index.html`, `packmaster-batch.js` และ related tests.
- Current mapped order data shape ก่อนกำหนด snapshot fields; ห้ามเดา schema โดยไม่อ่าน code.

## Notes / constraints
- Local-first / IndexedDB เท่านั้น; ห้ามเพิ่ม Supabase/Login/Subscription.
- ห้าม snapshot wrong/ambiguous auto-match; readiness invariant จาก Ticket 01 ต้องมาก่อน.
- ห้าม silently reprocess historical batch; ถ้าต้องการ reprocess ให้เป็น explicit future feature.
- Preserve backward compatibility หรือทำ migration ที่ fail safe สำหรับ batch เก่า.