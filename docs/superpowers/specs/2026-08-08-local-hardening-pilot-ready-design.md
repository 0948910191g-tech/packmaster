# PackMaster Local Hardening → Pilot-ready Design Spec

**Date:** 2026-08-08  
**Scope:** Phase 3 through Local-first External Pilot readiness  
**Repository:** `0948910191g-tech/packmaster`  
**Source of truth:** PackMaster Project Handoff 2026-08-08 + current `main` after Phase 2 Local Batch System  

## Goal

ทำให้ PackMaster จาก Local Batch System ที่ใช้งานได้ กลายเป็น Local-first product ที่พร้อมให้ร้านภายนอกทดลองใช้งานจริง โดยเพิ่มความปลอดภัยของข้อมูล ความสามารถกู้คืนงาน การป้องกันงานซ้ำ การจัดการ Exception ที่เร็วขึ้น การดูแลพื้นที่ Browser และเครื่องมือเก็บ Pilot Metrics แบบ Local โดยไม่แตะ Parser / Matcher / Qty / Print core ที่เสถียรแล้ว

ผลลัพธ์ที่ต้องได้คือ:

1. ผู้ใช้สำรองและกู้คืน Workspace ได้เอง
2. ลดความเสี่ยงอัปโหลดงานซ้ำและแพ็กซ้ำ
3. พนักงานเห็นเฉพาะ Exception ที่ต้องแก้
4. Batch เก่าไม่รกและจัด Lifecycle ได้
5. Browser storage มี warning / cleanup flow ที่ปลอดภัย
6. Error สำคัญบอกผลกระทบและวิธีกู้คืนชัดเจน
7. ระบบรองรับ Batch จำนวนมากขึ้นโดยไม่ทำให้ UX ช้าลงอย่างเห็นได้ชัด
8. Pilot สามารถ Export Metrics แบบ Local เพื่อวัดผลได้
9. มี First-run / Pilot checklist / Version info / Diagnostic export สำหรับการทดลองกับร้านจริง

## Non-negotiable Constraints

### No paid services

ห้ามเพิ่มหรือเปิดใช้งานบริการที่อาจมีค่าใช้จ่าย เช่น:

- Paid API
- Paid AI API
- Paid analytics / monitoring
- Paid hosting feature
- Paid cloud storage
- Marketplace paid API
- Payment / billing service

GitHub / GitHub Pages / GitHub Actions ที่มีอยู่เดิมใช้ต่อได้ในขอบเขตปัจจุบัน แต่ห้ามเพิ่ม dependency ต่อบริการภายนอกที่ต้องเปิด Billing หรือเสียค่าใช้จ่ายเพื่อให้ feature ทำงาน

### No database / cloud backend

ห้ามเพิ่ม:

- Supabase
- Firebase
- PostgreSQL / MySQL / SQLite server
- Cloud DB ทุกชนิด
- Login / Auth ที่ต้องมี backend
- Multi-user sync
- Cloud Batch History
- Server-side background worker
- Shared real-time SKU dictionary

Storage ที่อนุญาต:

- IndexedDB ใน Browser
- LocalStorage สำหรับ preferences/settings ที่เหมาะสม
- Downloaded JSON/CSV backup/export
- In-memory state ระหว่าง session

### Frozen Core

ห้ามแก้โดยไม่มี Real Failure Case + fixture + regression test:

- Shopee Parser
- TikTok Parser
- Multi-SKU parsing
- Qty Parsing
- SKU Matcher
- Bundle Matching
- Quantity Aggregation
- Print / Save PDF / Thermal rendering logic

งาน Phase 3 ต้องอยู่รอบ Core ไม่ใช่ rewrite Core

## Product Principle

ทุก feature ต้องตอบอย่างน้อยหนึ่งข้อ:

- ช่วยให้ร้านแพ็กเร็วขึ้นหรือไม่
- ช่วยลดโอกาสแพ็กผิดหรือไม่
- ช่วยลดโอกาสข้อมูลหายหรือไม่
- ช่วยให้ร้านภายนอกทดลองใช้ได้อย่างปลอดภัยหรือไม่

ถ้าไม่ตอบข้อใดข้อหนึ่ง ให้ลด Priority

---

# Phase 3A — Workspace Backup / Restore

## Pain Point

Phase 2 เก็บ Batch ใน IndexedDB ซึ่งเป็น Local-first ที่เหมาะกับสถานะปัจจุบัน แต่ Browser storage อาจถูกลบโดยผู้ใช้ การล้าง site data หรือการย้ายเครื่อง ดังนั้นก่อน Pilot ต้องมีทางสำรองข้อมูลที่ผู้ใช้ควบคุมเอง

## User Flow

### Backup

1. ผู้ใช้เข้า `การตั้งค่า / Backup`
2. เห็น Summary ว่าจะสำรองอะไรบ้าง
3. กด `สำรอง Workspace`
4. Browser สร้าง JSON และดาวน์โหลดให้ผู้ใช้
5. ไม่มีข้อมูลถูกส่งขึ้น Server

### Restore

1. ผู้ใช้เลือกไฟล์ Backup JSON
2. ระบบ Parse และ Validate ก่อนเปลี่ยนข้อมูลจริง
3. แสดง Preview:
   - Backup version
   - จำนวน SKU rules
   - จำนวน Batch
   - จำนวน Orders
   - วันที่ Backup
4. ผู้ใช้เลือก Restore mode ที่รองรับ
5. ระบบเขียนข้อมูล Local แล้ว Reload state

## Backup Format

```text
schema: packmaster-workspace-backup
version: 1
createdAt
appVersion
settings
skuRules
batches[]
batchOrders[]
```

หลักการ:

- มี `schema` + `version` เสมอ
- ห้ามใช้ implicit data shape
- Restore ต้อง reject schema/version ที่ไม่รองรับ
- ห้าม silently coerce ข้อมูลสำคัญ
- Unknown optional fields อาจ ignore ได้
- Missing required fields ต้อง reject

## Restore Strategy

Phase แรกใช้ `Replace Workspace` เป็น default ที่ชัดเจนและปลอดภัยที่สุด เพราะ Merge SKU/Batch แบบอัตโนมัติมีโอกาสสร้าง conflict ที่อธิบายยาก

ก่อน Replace:

- สร้าง Safety Snapshot ใน memory
- Validate ทุกส่วนก่อนเริ่มเขียน
- ถ้า write fail ต้องพยายามรักษา current workspace เดิมและแจ้ง recovery instruction

`Merge` จะทำเฉพาะเมื่อ rule deterministic และมี tests ครบ ไม่ทำเพราะความสะดวกอย่างเดียว

## Privacy

Backup อาจมี parsed order data ที่เป็นข้อมูลลูกค้า จึงต้องแสดงคำเตือนว่าไฟล์นี้ควรเก็บเป็นข้อมูลภายในร้าน ห้าม commit fixture จริงเข้า Repo

---

# Phase 3B — Duplicate Upload Detection

## Pain Point

การอัปโหลด PDF เดิมซ้ำเข้า Batch เดียวกันอาจทำให้ Orders ซ้ำและนำไปสู่การแพ็กซ้ำ ซึ่งเป็นความเสียหายโดยตรง

## Design Principle

ห้ามแก้ Parser เพื่อแก้ปัญหานี้ Duplicate Detection ต้องเป็น safety layer รอบ upload flow

## Detection Levels

### File-level fingerprint

เมื่อ Browser File API รองรับ ให้ fingerprint จาก raw file bytes ด้วย Web Crypto SHA-256

```text
fileHash = SHA-256(file bytes)
```

เก็บ fingerprint เฉพาะใน Batch metadata/local storage layer

ข้อดี:
- exact duplicate แม่นยำ
- ไม่ขึ้นกับ parser output

### Order-level duplicate signal

หลัง parse แล้ว สามารถตรวจ signal ที่ระบบมีอยู่แล้ว เช่น order reference / tracking + platform ใน Batch ปัจจุบัน เพื่อเตือนกรณีไฟล์ต่างกันแต่มี order ซ้ำ

ข้อจำกัด:
- ห้ามใช้ signal นี้เปลี่ยน Qty หรือ Matcher
- ถ้าหลักฐานไม่พอให้ Warning ไม่ auto-delete

## UX

สถานะ:

- `ใหม่` — process ต่อ
- `ซ้ำแน่นอน` — block default และให้ผู้ใช้ยืนยันแบบ explicit ถ้าต้องการนำเข้าอีกครั้ง
- `อาจซ้ำ` — warning + แสดงจำนวน order ที่ชน

Duplicate Detector ต้องไม่ลบข้อมูลเดิมเอง

---

# Phase 3C — Exception Inbox

## Goal

ทำ Exceptions-first ให้เป็น workflow จริง ไม่ใช่แค่ filter ใน Review page

## Exception Types

- Review SKU
- Review Qty
- Unmapped / ยังไม่ตั้งชื่อ
- Parser warning ที่มีอยู่แล้ว

## UX

เพิ่ม section `ต้องตรวจ` ที่สรุป Exception ทั้งหมดของ Active Batch

แต่ละรายการแสดง:

- Tracking / Order reference แบบที่ UI ปัจจุบันแสดงอยู่
- Platform
- Exception type
- Current output
- Action ที่พาไป context เดิม

ฟังก์ชันหลัก:

- Filter by type
- Search
- Next exception / Previous exception
- `แสดงทั้งหมด` กลับ Review table

## Data

Exception Inbox เป็น derived view จาก `MappedOrders` / existing warning flags เท่านั้น

ห้ามสร้าง secondary source of truth ที่ต้อง sync กลับ Core

## Safety

ถ้า Order มีหลาย warning ให้ UI แสดงได้หลาย badge แต่ Summary count ต้องมี rule ที่ deterministic และ test ได้

Primary status precedence ใช้เพื่อ summary เท่านั้น:

1. Review Qty
2. Review SKU / parser warning
3. Unmapped
4. Ready

แต่การ filter `มี warning นี้` ต้องยัง match warning ทุกตัวที่ Order มี ไม่ใช่แค่ primary status

---

# Phase 3D — Batch Lifecycle / Archive

## Goal

ไม่ให้ Batch list โตจนรก และแยกงานปัจจุบันออกจากงานที่จบแล้ว

## Status Lifecycle

Core operational status เดิม:

```text
WAITING → READY / REVIEW → COMPLETED
```

เพิ่ม archival state แยกจาก operational status:

```text
archivedAt: null | ISO timestamp
```

ไม่สร้าง status `ARCHIVED` ทับ operational status เพื่อให้รู้ได้ว่า Batch ที่ archive ก่อนหน้านั้น Completed หรือ Review

## Actions

- Archive Batch
- Restore Archived Batch
- Filter Active / Archived / All
- Delete archived Batch แบบ confirm
- Bulk delete archived Batch เฉพาะเมื่อผู้ใช้เลือกเอง

## Safety

- ห้าม auto-delete
- ห้าม archive active batch อัตโนมัติทันทีหลัง print
- Batch ที่มี unresolved exceptions สามารถ archive ได้ แต่ต้องมี warning ชัด

---

# Phase 3E — Storage Health / Cleanup

## Pain Point

Batch Orders อาจมี `pdfImage` เพื่อ reprint ทำให้ IndexedDB โตเร็ว

## Storage Health

เมื่อ Browser รองรับ ใช้:

```text
navigator.storage.estimate()
```

เพื่อแสดง:

- estimated used bytes
- estimated quota
- percent used

ถ้า Browser ไม่รองรับ ให้แสดง `ไม่สามารถประเมินพื้นที่ได้` โดยไม่ถือเป็น error

## Cleanup Levels

### Level 1 — Remove reprint images from archived batches

ลบเฉพาะ heavy image payload แต่คง Batch metadata + parsed display data ที่จำเป็นสำหรับ history/metrics ถ้า data shape รองรับอย่างปลอดภัย

หลัง cleanup ต้องบอกชัดว่า Batch นั้นอาจ Reprint label image เดิมไม่ได้

### Level 2 — Delete archived batches

ทำเฉพาะเมื่อผู้ใช้เลือกและ confirm

## Warning Thresholds

ใช้ UI warning แบบ conservative เช่น:

- < 70%: Normal
- 70–85%: Warning
- > 85%: Critical warning

ค่าพวกนี้เป็น UX threshold ไม่ใช่ guarantee ของ Browser quota

---

# Phase 3F — Error Recovery UX

## Error Model

Error สำคัญต้องตอบ 3 อย่าง:

1. เกิดอะไรขึ้น
2. ข้อมูลปัจจุบันยังอยู่หรือไม่
3. ผู้ใช้ควรทำอะไรต่อ

## Error Groups

### Storage unavailable

- current in-memory orders ยังอยู่
- block batch switching ถ้ายัง save ไม่ได้
- แนะนำ backup/export ถ้าทำได้

### Storage quota exceeded

- ห้าม clear data อัตโนมัติ
- แสดง storage cleanup action
- current session ยังอยู่ถ้า memory ไม่หาย

### Restore invalid

- ไม่เปลี่ยน current workspace
- บอก validation reason แบบเข้าใจได้

### PDF processing failure

- ไม่เพิ่ม partial orders ถ้า transaction ของ upload นั้นไม่สมบูรณ์ตาม flow เดิม
- ไม่แก้ parser จาก error ที่ยังไม่มี fixture

### Export failure

- Batch ห้าม mark Completed ถ้า Save PDF ล้มเหลว
- Print mark Completed ตาม existing Phase 2 behavior หลัง print action ถูกเรียก

---

# Phase 3G — High-volume Performance Hardening

## Principle

ห้าม optimize จากความรู้สึก ต้องวัดก่อน

## Areas to Measure

- Batch list render with many batches
- Review table / Exception Inbox with many orders
- Search/filter latency
- IndexedDB autosave time
- Backup serialization time / file size
- Restore parse + write time
- Save PDF time (observe only unless real failure requires core-adjacent change)

## Allowed Improvements

- debounce search/autosave
- memoized derived views
- chunked non-core processing
- lazy rendering/pagination for Batch history or Exception rows
- avoid unnecessary image retention in memory

## Not Allowed

- parser rewrite
- matcher rewrite
- quantity logic rewrite
- framework migration
- adding paid monitoring

## Performance Fixtures

ใช้ generated/sanitized fixture data ไม่มี PII

Target scenarios:

- 50 Orders
- 150 Orders (current per-batch upload limit)
- many Batch metadata rows for history UI

ไม่ claim production capacity เกินที่ทดสอบจริง

---

# Phase 3H — Local Pilot Metrics / Diagnostics

## Goal

เก็บข้อมูลที่จำเป็นต่อ Product Decision โดยไม่ใช้ analytics SaaS และไม่ส่งข้อมูลออกจากเครื่องอัตโนมัติ

## Metrics

ต่อ Batch:

- totalOrders
- readyCount
- reviewSkuCount
- reviewQtyCount
- unmappedCount
- duplicateBlockedCount
- duplicateWarningCount
- createdAt / completedAt
- optionally processing duration ถ้าวัดโดยไม่ผูกกับ Core

Workspace summary:

- number of batches
- completed batches
- exception rate
- ready rate
- storage warning state

## Export

เพิ่ม `Export Pilot Report` เป็น JSON และ/หรือ CSV

หลักการ privacy:

- default report ไม่ใส่ customer name/address/phone
- ไม่ใส่ raw PDF image
- ไม่ใส่ tracking/order reference ถ้าไม่จำเป็นต่อ metric
- diagnostic mode ที่มี identifiers ต้อง explicit opt-in และมีคำเตือน

---

# Phase 4 — Pilot-ready Product Package

## First-run Guide

หน้า `งานแพ็ก` เมื่อไม่มี Batch และยังไม่เคยใช้งาน:

1. สร้าง Batch
2. Upload PDF
3. แก้ Exception
4. Print
5. Backup เป็นระยะ

ไม่ทำ wizard ยาวหรือ onboarding ที่ขวางงาน

## Version / Build Information

แสดง version/build identifier ที่ตรวจสอบกับ source ได้ เพื่อให้ bug report ระบุ build ที่เกิดปัญหา

## Diagnostic Export

ไฟล์ diagnostic แบบ sanitized ประกอบด้วย:

- app version
- browser basic info
- feature flags / storage availability
- batch summary counts
- error records ที่ app เก็บเฉพาะ local และไม่มี PII โดย default

## Pilot Checklist

เอกสารใน Repo:

- supported browsers
- backup before pilot
- sanitized fixture smoke
- real PDF smoke process
- how to report bug
- what data must never be committed
- rollback guidance

## Pilot KPI

เก็บ manual / exported metrics:

- orders processed per day
- ready rate
- exception rate
- time saved compared with manual baseline
- pack error / correction incidents
- browser/storage incidents

ยังไม่สร้าง remote analytics dashboard

---

# Architecture

```text
                    ┌────────────────────────────┐
                    │ Frozen Parser/Matcher/Qty │
                    └──────────────┬─────────────┘
                                   │
                                   ▼
                         Current Orders State
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
       Review / Inbox          Batch Workflow      Duplicate Guard
             │                     │                     │
             └──────────────┬──────┴──────────────┬─────┘
                            ▼                     ▼
                  Local Workspace Layer     Metrics/Diagnostics
                            │                     │
                   ┌────────┴────────┐            │
                   ▼                 ▼            ▼
               IndexedDB        LocalStorage   JSON / CSV Export
                   │
                   ▼
              JSON Backup
```

## Module Direction

เพื่อไม่ให้ `index.html` โตแบบไร้ขอบเขต Phase 3 สามารถเพิ่ม pure/local modules ได้ เช่น:

- `packmaster-workspace.js` — backup/restore/schema validation
- `packmaster-duplicates.js` — file/order fingerprints
- `packmaster-storage-health.js` — storage estimate/cleanup helpers
- `packmaster-metrics.js` — local metrics aggregation/export

แต่ห้าม refactor Core functions ออกจาก `index.html` เพียงเพื่อความสวยงามใน Phase นี้

แต่ละ module ต้อง:

- ไม่มี network dependency
- มี pure helpers ที่ unit test ได้
- expose browser API ผ่าน `window.*` และ CommonJS export แบบเดียวกับ `packmaster-batch.js` หากเหมาะสม
- ไม่ถือ source of truth ซ้ำกับ Orders/Core

---

# Data Flow

## Upload

```text
File selected
→ file fingerprint
→ exact duplicate check
→ existing PDF parse flow
→ order-level duplicate signal
→ user warning/block decision
→ add to active batch
→ autosave local snapshot
```

## Review

```text
orders
→ MappedOrders (existing)
→ exception flags (derived)
→ Review / Exception Inbox UI
```

## Backup

```text
SKU rules + settings + batch metadata + batch orders
→ validate serializability
→ workspace backup document
→ browser download
```

## Restore

```text
selected JSON
→ parse
→ schema validation
→ semantic validation
→ preview
→ explicit confirmation
→ local replace transaction
→ state reload
```

## Pilot Metrics

```text
existing batch metadata + derived summaries + local event counters
→ sanitized aggregate report
→ JSON / CSV download
```

---

# Testing Strategy

## Existing tests — mandatory unchanged behavior

ทุก PR ต้องรัน existing Parser/Matcher/Qty guardrails ก่อน merge

## New tests

### Workspace

- backup schema/version
- backup round-trip
- invalid JSON rejected
- unsupported version rejected
- required field missing rejected
- restore does not mutate input

### Duplicate

- same bytes = same file fingerprint
- different bytes = different fingerprint
- exact duplicate blocked by default
- possible order duplicate warns without deleting data

### Exception Inbox

- status precedence deterministic
- multi-warning order matches all relevant filters
- filters never mutate source orders

### Lifecycle

- archive / restore metadata
- active vs archived filtering
- delete requires explicit handler path

### Storage health

- estimate supported
- estimate unsupported graceful fallback
- threshold mapping
- cleanup preserves metadata when image payload is removed

### Metrics

- aggregate counts correct
- sanitized export excludes PII fields by default

## Browser Smoke

ใช้ Chromium ใน CI / temporary test branch ตามแนวทาง Phase 2 เฉพาะเมื่อจำเป็น โดย test production flow แบบ isolated browser profile

ต้องทดสอบอย่างน้อย:

1. Create Batch
2. Upload sanitized fixture / simulated data path where practical
3. Backup workspace
4. Restore backup
5. Duplicate prevention
6. Exception Inbox navigation
7. Archive / Restore Batch
8. Storage health UI fallback
9. Pilot report export

## Release Gate

`feature branch → tests → PR → CI green → merge main → main CI green → GitHub Pages deploy → production smoke`

ห้าม merge เมื่อ regression test ล้ม

---

# Rollout Order

เพื่อจำกัดความเสี่ยง แบ่งเป็น PR ย่อยตามลำดับ:

1. **3A Workspace Backup/Restore foundation**
2. **3B Duplicate Upload Detection**
3. **3C Exception Inbox**
4. **3D Archive/Lifecycle**
5. **3E Storage Health/Cleanup**
6. **3F Error Recovery pass**
7. **3G Performance hardening based on measurements**
8. **3H Pilot Metrics/Diagnostics**
9. **Phase 4 Pilot-ready onboarding/docs/versioning**

แต่ละ PR ต้อง deploy ได้เองและไม่บังคับให้ PR ถัดไปเสร็จก่อนระบบจึงใช้งานได้

---

# Explicit Out of Scope / Stop Gate

หยุด Product Expansion และกลับมาประเมินใหม่ก่อนทำสิ่งต่อไปนี้:

- Sync ข้ามเครื่อง
- หลาย User ใช้ Batch เดียวกัน
- Multi-tenant
- Login
- Subscription
- Cloud Batch History
- Shared SKU Dictionary แบบ real-time
- Server background processing
- Marketplace API integration ที่ต้องเสียเงินหรือผูก credential ฝั่ง server
- Payment

สิ่งเหล่านี้คือ Database / SaaS Gate และถูกห้ามใน scope นี้

---

# Definition of Done

Phase 3–4 Local-first ถือว่าเสร็จเมื่อ:

- Workspace backup/restore ใช้งานและ regression ผ่าน
- Duplicate upload safety ทำงานโดยไม่แก้ Parser
- Exception Inbox ช่วยตรวจเฉพาะปัญหาได้
- Batch archive/history จัดการได้
- Storage health/cleanup มี safe flow และไม่ auto-delete
- Error สำคัญมี recovery guidance
- High-volume UI ผ่าน test scenarios ที่กำหนดโดยไม่มี regression ที่ยืนยันได้
- Pilot metrics export ไม่มี PII โดย default
- First-run guide / diagnostic export / pilot checklist / version info พร้อม
- Existing Parser/Matcher/Qty/Print regression ทั้งหมดยังผ่าน
- Production GitHub Pages smoke ผ่าน
- ไม่มี paid service dependency ใหม่
- ไม่มี database/cloud backend/login/auth

หลังจุดนี้ PackMaster พร้อมเข้าสู่ **External Pilot Gate** เพื่อเก็บ Failure Case และ Product Need จริง ก่อนพิจารณา architecture ระดับ SaaS ในอนาคต
