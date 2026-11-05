# Ticket 05 — SKU Dictionary Integrity & Safe Rule Lifecycle

Status: ready-for-agent
Priority: High Safety

## What to build
ทำให้ Add/Edit/Import/Restore ใช้กติกา integrity เดียวกันกับ matcher normalization และไม่ยอมให้ duplicate ID หรือ normalized conflict ผ่านแบบเงียบ ๆ.
ต้องมี audit/migration ที่ปลอดภัยสำหรับ dictionary เดิม โดยไม่ auto-delete alias หรือเลือก conflict แทนผู้ใช้.

## Demo path
นำ dictionary ปัจจุบันเข้า audit: duplicate IDs ต้องถูกรายงาน/แก้เป็น unique IDs; LAVENDER 6 conflict ต้องถูกบล็อกให้ user decision ก่อน apply.

## Acceptance criteria
- [ ] Rule ID ทุกตัว unique หลัง add/edit/import/restore/migration.
- [ ] Edit/Delete rule หนึ่งไม่แก้หรือลบ alias อื่นเพราะ shared ID.
- [ ] matcher-normalized duplicate same-output ถูก report อย่างปลอดภัย; different-output conflict ห้าม auto-pick.
- [ ] ทุก mapping entry point ใช้ shared integrity/safety validation semantics.
- [ ] migration มี preview/backup/rollback path และ regression tests ครอบคลุม dictionary เดิม.

## Blocked by
- Ticket 02 — Matcher Identity Gate

## Files to inspect
- Mapping CRUD/import/restore ใน `index.html`, `packmaster-workspace.js`, `packmaster-keyword-assistant.js`.
- Tests keyword assistant/workspace/matcher ที่เกี่ยวข้อง และ mapping export จริงแบบ sanitized.

## Notes / constraints
- ห้ามทำให้ matcher permissive เพื่อให้ dictionary self-test 101/101.
- Current audit พบ duplicate-ID groups, normalized duplicate groups และ true LAVENDER conflict; ยืนยันใหม่จาก data ก่อน migrate.
- ห้ามเปลี่ยน shortName/keyword ความหมายเชิงธุรกิจอัตโนมัติ.
- Quick Mapping safety ที่มีอยู่ต้องไม่ regress.