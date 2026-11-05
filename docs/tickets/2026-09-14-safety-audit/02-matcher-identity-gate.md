# Ticket 02 — Matcher Identity Gate ป้องกัน Wrong Cross-Brand / Variant

Status: ready-for-agent
Priority: P0 Safety

## What to build
ทำ candidate gating ก่อน exact-longest/score เพื่อไม่ให้ keyword ที่ยาวกว่าแต่ identity ขัดกันชนะ Auto-match.
ต้องป้องกัน cross-brand และ identity conflict โดยไม่ทำให้ matcher permissive ขึ้นเพื่อไล่ coverage.

## Demo path
ใช้ sanitized cases: HOYA Wet Baby Wipes 12 ห่อ ต้องไม่ Auto-match rule brandless ที่ output เป็น HAKU; HOYA Baby สีม่วงต้องไม่ออกเด้งชมพู.

## Acceptance criteria
- [ ] Real/sanitized wrong-match cases fail บน code เดิมและผ่านหลังแก้.
- [ ] Candidate ที่มี hard brand/variant identity conflict ถูก reject ก่อน exact-longest selection.
- [ ] Exact/Strong Identity ที่ compatible ยังทำงานได้และ existing matcher regression tests ผ่าน.
- [ ] Unknown/uncertain case ไป Review/Unmapped แทนการเดา.
- [ ] Shadow test กับ dictionary ปัจจุบันรายงานผลกระทบ false-negative/ambiguous โดยไม่ซ่อน regression.

## Blocked by
- None — can start immediately

## Files to inspect
- `index.html` matcher functions รวม normalize/scoring/exact-longest path.
- `tests/packmaster-smart-matcher.test.mjs` และ matcher-related fixtures/tests.

## Notes / constraints
- ห้ามแก้ Shopee/TikTok Parser, Qty parsing, Print หรือ Data Shape ใน ticket นี้.
- False positive แพ็กผิดร้ายแรงกว่า false negative; ไม่มั่นใจ = ไม่เดา.
- ห้ามแก้ด้วยการลด threshold หรือ reject brandless rule ทั้งหมดแบบเหมารวม.
- ต้องทำ minimal fix หลังยืนยัน root cause ด้วย regression test.