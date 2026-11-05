# Ticket 10 — Local Safety Metadata ต้อง Fail Visible

Status: ready-for-agent
Priority: Medium Stability

## What to build
ทำให้ duplicate/archive/source-file sidecar ที่อ่านไม่ได้หรือ JSON เสียไม่ถูกตีความเงียบ ๆ ว่าเป็น state ว่างปกติ.
ระบบต้องแสดง degraded state และหลีกเลี่ยงการเขียนทับ recovery evidence จนผู้ใช้เลือกวิธีกู้/รีเซ็ต.

## Demo path
ทำ duplicate/archive sidecar ให้ corrupt; เปิด PackMaster แล้วต้องเห็น health warning และระบบไม่รายงานว่า history ว่างแบบปกติ.

## Acceptance criteria
- [ ] corrupt sidecar ถูก detect และ surfaced เป็น degraded/local-data warning.
- [ ] read failure ไม่กลับ `{}` แบบเงียบ ๆ แล้วเขียนทับต้นฉบับโดยอัตโนมัติ.
- [ ] valid sidecar behavior เดิมยังทำงาน.
- [ ] delete batch cleanup ล้าง source filename/archive/duplicate metadata ที่เกี่ยวข้องครบ ไม่มี orphan known path.
- [ ] tests ครอบคลุม corrupt-read, no-destructive-rewrite, recovery/reset และ cleanup.

## Blocked by
- None — can start immediately

## Files to inspect
- `packmaster-duplicate.js`, `packmaster-archive.js`, `packmaster-batch-source-files.js`, `packmaster-storage-health.js`.
- Delete/archive handlers ใน `index.html` และ sidecar/storage-health tests.

## Notes / constraints
- ห้าม auto-reset corrupt data โดยไม่แจ้งผู้ใช้.
- เก็บ Local-first; ไม่เพิ่ม server sync หรือ database.
- ถ้า recovery ทำไม่ได้ ให้ export/backup guidance ที่ปลอดภัยแทนการซ่อน error.
- Workspace backup memory optimization เป็นคนละ scope; เพียงรายงานถ้าพบ.