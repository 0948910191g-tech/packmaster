# PackMaster Local Batch System — Design Spec

**Date:** 2026-08-08  
**Phase:** 2 — Local Batch System  
**Source of truth:** PackMaster Project Handoff 2026-08-08

## Goal

เปลี่ยน PackMaster จากการมีข้อมูลชุดเดียวที่ต้อง Clear ก่อน Upload รอบใหม่ เป็น Local-first Packing Jobs ที่สร้างและสลับหลาย Batch ได้ใน Browser เดียวกัน โดยไม่เพิ่ม Database / Login / Supabase และไม่แตะ Parser / Matcher / Qty / Print core

## User Flow

1. เปิดเมนู `งานแพ็ก`
2. เห็นรายการ Batch ล่าสุดและสถานะของแต่ละ Batch
3. กด `+ สร้าง Batch ใหม่`
4. ระบบสร้างชื่ออัตโนมัติ เช่น `8 Aug / Batch #004`
5. Upload Shopee / TikTok PDF ตาม flow เดิม
6. Parse / Match / Review ตาม logic เดิม
7. Batch แสดง Summary: Orders / Ready / Review SKU / Review Qty / Unmapped
8. ผู้ใช้เข้า `รีวิว & พิมพ์`
9. Print หรือ Save PDF แล้ว Batch ถูก Mark เป็น `Completed`
10. กลับหน้า `งานแพ็ก` และสร้าง Batch ถัดไปได้โดยไม่ Clear Batch เดิม
11. เปิด Batch เก่าเพื่อ Review / Reprint ได้

## Architecture

เพิ่ม Local Batch layer โดยแยก Storage ออกจาก Parser:

```text
Parser / Matcher Core (unchanged)
        ↓
React UI + current orders state
        ↓
PackMasterBatch adapter
        ↓
IndexedDB
```

ไฟล์ใหม่ `packmaster-batch.js` รับผิดชอบเฉพาะ:
- Batch metadata helpers
- Batch status derivation
- IndexedDB open/read/write/delete

`index.html` ยังเป็น UI หลักและ reuse `orders`, `MappedOrders`, Upload handler, Review UI, Print และ Save PDF เดิม

## IndexedDB Data

Database: `packmaster-local-v1`

### Store: `batchMeta`

```text
id
name
createdAt
updatedAt
status
printedAt?
totalOrders
readyCount
reviewSkuCount
reviewQtyCount
unmappedCount
```

### Store: `batchOrders`

```text
batchId
orders[]
updatedAt
```

`orders[]` ใช้ current parsed order shape เดิม รวม `pdfImage` เพื่อให้ recent batch สามารถเปิดและ Reprint บนเครื่องเดิมได้

### Privacy / Retention

- ข้อมูลเก็บ Local Browser เท่านั้น
- ไม่ Upload Cloud
- ไม่เพิ่ม Account
- PDF ต้นฉบับไม่ถูกเก็บเป็นไฟล์ถาวร
- `pdfImage` เป็นข้อมูลสำหรับ short-term local reprint และผู้ใช้สามารถลบ Batch ได้
- Storage cleanup / archive policy ขั้นสูงอยู่ Phase 3

## Batch Status

- `WAITING` — ยังไม่มี Order
- `READY` — มี Order และไม่มี Exception
- `REVIEW` — มี Review SKU / Review Qty / Unmapped อย่างน้อยหนึ่งรายการ
- `COMPLETED` — Print หรือ Save PDF สำเร็จแล้ว

Completed ไม่ถูกยกเลิกอัตโนมัติเมื่อกลับมาเปิดดู แต่ถ้ามีการ Upload Order เพิ่มเข้า Batch เดิมให้กลับไปคำนวณ status ตาม Exceptions ใหม่

## UI / UX

### งานแพ็ก

เมื่อยังไม่ได้เปิด Batch:
- Header `งานแพ็ก`
- Primary button `+ สร้าง Batch ใหม่`
- Batch Cards เรียง Updated ล่าสุด
- Card แสดงชื่อ, Orders, Ready, Review, Status, Updated time
- Actions: `เปิดงาน`, `ลบ`

เมื่อเปิด Batch:
- Batch header + status
- `← กลับรายการ Batch`
- Upload Hero เดิม
- Summary สั้น ๆ
- ไป `รีวิว & พิมพ์`

### Review & Print

- แสดงชื่อ Active Batch ใต้ Page Header
- Search / Filters / Summary จาก Phase 1 ทำงานเหมือนเดิม
- Print / Save PDF ยังใช้ `MappedOrders` ทั้งชุด ไม่ใช้ filtered list
- เมื่อ Print หรือ Save PDF สำเร็จ Mark Batch `COMPLETED`

## Failure Handling

ถ้า IndexedDB เปิดหรือ Save ไม่สำเร็จ:
- แจ้ง Toast ชัดเจนว่า Local Batch storage มีปัญหา
- ห้ามทำให้ Parser / Review / Print crash
- Current in-memory orders ยังใช้งานต่อใน session ได้

## Hard Restrictions

- ห้ามแก้ Shopee Parser
- ห้ามแก้ TikTok Parser
- ห้ามแก้ SKU Matcher algorithm
- ห้ามแก้ Quantity aggregation
- ห้ามเปลี่ยน Print layout / Thermal behavior
- ห้ามเพิ่ม Supabase / Database server / Auth
- ห้าม Rewrite Framework
- ห้ามเปลี่ยน existing SKU rule data shape

## Tests

1. Existing matcher/parser regression tests ต้องผ่านเหมือนเดิม
2. Batch helper tests:
   - Auto batch naming
   - WAITING / READY / REVIEW / COMPLETED status
   - Summary → metadata mapping
3. JSX syntax compile
4. Safety invariants:
   - Export loop ยัง iterate `MappedOrders`
   - Print area ยัง render `MappedOrders`
5. Browser smoke:
   - Create Batch
   - IndexedDB มี batchMeta + batchOrders
   - Reload แล้ว Batch ยังอยู่
   - Switch Batch แล้ว orders ไม่ปนกัน
   - Delete Batch แล้วหาย
6. Production smoke หลัง GitHub Pages deploy

## Definition of Done

- สร้าง Batch ใหม่ได้
- Upload และ Review ภายใน Batch ได้
- สร้าง Batch ถัดไปได้โดยไม่ Clear Batch เก่า
- Reload Browser แล้ว recent batches ยังอยู่
- Switch Batch แล้วข้อมูลไม่ปนกัน
- Batch เดิมเปิด Reprint ได้
- Print / Save PDF Mark Completed
- Existing Parser / Matcher / Qty regressions ผ่าน
- Production GitHub Pages deploy และ smoke test ผ่าน
