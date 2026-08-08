# PackMaster Local Hardening → Pilot-ready Master Rollout

**Scope:** Phase 3A ถึง External Pilot readiness

ไฟล์นี้ใช้ล็อกลำดับงานและข้อห้ามร่วม ส่วนรายละเอียด implementation ให้ยึด per-feature plan ล่าสุดของแต่ละ Phase

## Hard Gates

1. ห้ามใช้บริการที่มีค่าใช้จ่ายหรือ feature ที่ต้องเปิด Billing
2. ห้ามเพิ่ม Supabase, Firebase, Cloud DB, backend persistence, Login/Auth, multi-user sync หรือ Cloud Batch
3. IndexedDB จาก Phase 2 เป็น frozen local persistence boundary
4. ตลอด Phase 3 ห้ามเปลี่ยน `packmaster-batch.js`, `DB_NAME`, `DB_VERSION`, object stores หรือทำ schema migration เว้นแต่มี Real Failure Case ที่ existing public API แก้ไม่ได้และผู้ใช้ออกคำสั่งใหม่
5. ใช้ public Batch APIs เดิมเท่านั้น: `listBatches`, `loadBatch`, `saveBatch`, `deleteBatch`
6. ข้อมูลเสริมของ Phase 3 ให้ใช้ LocalStorage sidecar หรือ derived state ก่อน
7. ห้ามแก้ Shopee Parser, TikTok Parser, Multi-SKU, Qty Parsing, SKU Matcher, Bundle Matching, Quantity Aggregation และ Print/Save PDF/Thermal core โดยไม่มี Real Failure Case + regression
8. ห้าม commit fixture/backup/PDF จริงจากลูกค้า
9. Print / Save PDF ต้องยังอิง full `MappedOrders`

## Release Pattern

ทุก Phase ใช้:

`Plan → TDD RED → Minimal implementation → Existing regressions → Browser smoke → Diff review → Draft PR → PR CI → Merge → Main CI → GitHub Pages → Production smoke`

ห้ามรวม subsystem เสี่ยงหลายเรื่องใน PR เดียว

## Phase 3A — Workspace Backup / Restore

Authoritative plan: `2026-08-08-workspace-backup-restore.md`

- เพิ่ม `packmaster-workspace.js`
- Backup JSON มี schema/version
- Backup SKU rules, settings, Batch metadata และ Batch orders
- Restore แบบ Replace Workspace เท่านั้นในรอบแรก
- Validate + Preview + explicit confirm ก่อนเขียน
- ใช้ existing Batch public APIs เท่านั้น
- ไม่มี network request
- ห้ามแก้ `packmaster-batch.js`

## Phase 3B — Duplicate Upload Detection

- เพิ่ม pure helper สำหรับ SHA-256 file fingerprint และ order duplicate signals
- Exact duplicate: block default + explicit override
- Possible order duplicate: warning เท่านั้น
- ห้ามแก้ Parser/Matcher/Qty
- Fingerprint persistence ใช้ LocalStorage sidecar keyed by Batch ID
- ไม่เพิ่ม field ใหม่ใน IndexedDB Batch metadata

## Phase 3C — Exception Inbox

- Derived view จาก `MappedOrders` / existing warning flags เท่านั้น
- Primary summary precedence: Review Qty → Review SKU/parser warning → Unmapped → Ready
- Order หนึ่งรายการมีหลาย warning badge ได้
- ไม่ mutate `orders` หรือ `MappedOrders`
- Print/Export ไม่เปลี่ยน

## Phase 3D — Batch Archive / Lifecycle

- Archive state ใช้ LocalStorage sidecar keyed by Batch ID
- Operational status ใน IndexedDB เดิมไม่เปลี่ยน
- Archive / Restore Archive / Active-Archived filter
- Delete ใช้ existing `deleteBatch(id)` และต้อง explicit confirm
- ห้าม auto-delete / auto-archive

## Phase 3E — Storage Health / Safe Cleanup

- ใช้ `navigator.storage.estimate()` เมื่อ Browser รองรับ
- ถ้าไม่รองรับต้อง degrade safely
- Cleanup เฉพาะ Batch ที่ผู้ใช้เลือกเอง
- ใช้ `loadBatch(id)` → strip `pdfImage` → `saveBatch(existingMeta, orders)`
- ห้าม migration / auto cleanup / auto delete

## Phase 3F — Recovery UX / Local Diagnostics

- Error สำคัญต้องบอกว่าเกิดอะไรขึ้น, ข้อมูลยังอยู่ไหม, ทำอะไรต่อ
- Diagnostic export เป็น aggregate/sanitized data เท่านั้น
- ไม่ export raw PDF image หรือ direct customer/order identifiers
- JSON/CSV download local-only ไม่มี telemetry network

## Phase 3G — Performance Hardening

- ใช้ synthetic data เท่านั้น
- วัด hotspot ก่อน optimize
- ใช้ Set/Map/memoization/debounce เมื่อมีหลักฐาน
- ห้าม refactor Parser/Matcher แบบเดา

## Phase 3H / Phase 4 — Pilot-ready Package

เพิ่ม:

- First-run local data notice
- App/build version
- Pilot checklist
- Recovery guide
- Local data privacy guide
- Sanitized sample
- Local KPI/diagnostic export
- Production smoke suite

## External Pilot Gate

เมื่อ Phase 3A–3H พร้อมและ Production smoke ผ่าน ให้หยุดที่ External Pilot ก่อน

เก็บ KPI แบบ Local/Manual เช่น Orders/day, Ready %, Review %, Unmapped %, Duplicate prevented, time saved และ browser/storage issues

แม้ Pilot ภายหลังชี้ว่าต้องมี Database ก็ห้ามเริ่ม Database/Login/SaaS โดยอัตโนมัติ ต้องได้รับคำสั่งใหม่จากผู้ใช้ก่อน

## Definition of Done

- ทุก Phase ผ่าน regression + browser smoke + production smoke
- ไม่มี paid service dependency
- `packmaster-batch.js`, `DB_NAME`, `DB_VERSION`, object stores และ Core Parser/Matcher/Qty/Print ไม่ถูกเปลี่ยนใน Phase 3
- ระบบพร้อม External Pilot แบบ Local-first
- หยุดที่ Pilot Gate
