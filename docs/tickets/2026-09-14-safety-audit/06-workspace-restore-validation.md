# Ticket 06 — Workspace Restore ต้อง Reject Malformed Orders ก่อน Replace

Status: ready-for-agent
Priority: High Safety

## What to build
เพิ่ม validation ระดับ Order ก่อน destructive workspace replace เพื่อไม่ให้ backup ที่โครงสร้างบนสุดถูกแต่ orders ภายในเสียผ่านเข้า storage.
Validation failure ต้องรักษา workspace ปัจจุบันไว้ครบ.

## Demo path
Restore payload ที่มี batchOrders:[{batchId:'b1',orders:[{}]}]; ระบบต้อง reject ก่อน replace และ workspace เดิมยังเปิดใช้งานได้.

## Acceptance criteria
- [ ] malformed order shape ถูก reject พร้อม actionable validation error.
- [ ] validation เกิดก่อน delete/replace storage ใด ๆ.
- [ ] valid backup version ปัจจุบัน restore ได้เหมือนเดิม.
- [ ] unsupported/older schema ใช้ explicit migration หรือ reject; ห้ามเติม field เดาแบบเงียบ ๆ.
- [ ] tests พิสูจน์ทั้ง malformed reject, current data preserved และ valid restore success.

## Blocked by
- None — can start immediately

## Files to inspect
- `packmaster-workspace.js` validation/restore flow และ UI restore handler ใน `index.html`.
- `tests/packmaster-workspace-validation.test.mjs`, `tests/packmaster-workspace.test.mjs`.

## Notes / constraints
- Local-first/IndexedDB เดิม; ห้ามเพิ่ม Database/Login/Cloud.
- ตรวจเฉพาะ shape/invariants ที่ code ปัจจุบันต้องใช้จริง เช่น parsedItems ก่อนเรียก `.length`.
- ห้าม mutate workspace ปัจจุบันจน payload ผ่าน validation ครบ.
- Dictionary integrity ใน restore ให้ Ticket 05 เป็น owner; อย่ารวม scope จนเสี่ยง.