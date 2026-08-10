# PackMaster — Review Quick Mapping & Print Override Design

Date: 2026-08-10

## Goal

แก้ Pain หน้างานในหน้า Review & Print โดยไม่แตะ Parser / Matcher / Qty core:

1. ผู้ใช้ต้องสามารถตั้งชื่อ SKU ใหม่ได้เสมอ แม้ Keyword Assistant ไม่มีคำที่ปลอดภัย
2. การกดชื่อ/คำแนะนำใน Quick Mapping ต้องไม่สร้าง Mapping ใหม่โดยอัตโนมัติ
3. การแก้ SKU เฉพาะ Order ต้องไม่เปลี่ยนผลจับคู่ SKU อื่น
4. ผู้ใช้ต้องเห็น Source PDF / Page ของ Order เพื่อย้อนตรวจต้นทางได้
5. Print Safety ต้องยังเตือน แต่ผู้ใช้มีทางเลือกพิมพ์เฉพาะ Ready หรือยืนยันพิมพ์ทั้ง Batch ได้

## Confirmed Root Cause

Matcher หลักไม่ได้เป็นปัญหาในเคสนี้

ปัญหาเกิดจาก Quick Mapping ปัจจุบัน:

- ระบบเลือก Keyword suggestion แรกให้อัตโนมัติ
- ปุ่ม `บันทึกและใช้` เรียก `saveSkuRule(...)` เสมอ
- ดังนั้นการแก้ Unmapped หนึ่ง Order จะเพิ่ม Rule เข้า shared SKU Library
- Safety Check ตรวจได้เฉพาะกฎและ SKU ที่มีอยู่ใน context ปัจจุบัน จึงไม่สามารถรับประกัน SKU ใหม่ในอนาคตที่ชื่อคล้ายกัน
- Rule ใหม่จึงอาจแย่งเส้นทาง SKU เดิมหรือ SKU ใหม่ภายหลัง แม้ Matcher หลักจะทำงานตามกฎถูกต้อง

## Approaches Considered

### A. ทำ Keyword Assistant ให้เข้มขึ้นอย่างเดียว

ข้อดี: เปลี่ยน UX น้อย

ข้อเสีย: ยังแก้ข้อจำกัดเชิงโครงสร้างไม่ได้ เพราะไม่มีทางรู้ SKU ที่จะเข้ามาในอนาคตทั้งหมด และยังผูก “แก้ Order” กับ “สอนระบบ” อยู่

### B. ปิด Keyword Assistant แล้วให้กรอกเองทั้งหมด

ข้อดี: ปลอดภัย

ข้อเสีย: ช้าสำหรับหน้างาน และผู้ใช้หา Internal Name ยาก

### C. แยก “แก้ Order” ออกจาก “บันทึก Mapping” — เลือกแนวทางนี้

ข้อดี: ปลอดภัยที่สุดและตรง workflow จริง

- Default action = ใช้ชื่อกับ Order นี้เท่านั้น
- การสร้าง Mapping ใหม่เป็น explicit action แยกต่างหาก
- Keyword suggestion ยังช่วยได้ แต่ไม่มีสิทธิ์เปลี่ยน shared mapping จนกว่าผู้ใช้ตั้งใจบันทึก
- ไม่ต้องแก้ Matcher scoring

## UX Design

### Quick Mapping

เมื่อเปิดจาก `UNMAPPED` หรือ `REVIEW_SKU`:

1. แสดง Order / Tracking
2. แสดง Source PDF + Page ถ้ามี
3. แสดง `ชื่อภายในที่เลือกได้` จาก SKU Library เป็นรายการค้นหา/เลือกได้
4. มีช่องกรอกชื่อภายในเองเสมอ
5. Keyword suggestion ยังคงแสดงได้ แต่ไม่ auto-select suggestion แรก
6. ไม่แสดง dead-end แบบ “ไม่มีชื่อแนะนำแล้วทำต่อไม่ได้”

Actions:

- `ใช้กับ Order นี้` — Primary/default
  - ต้องมี Internal Short Name
  - ไม่ต้องมี Keyword
  - ไม่เพิ่ม skuRules
  - ปิด Exception ของ item เป้าหมายใน Order นี้

- `บันทึกเป็น Mapping และใช้`
  - ต้องมี Keyword + Internal Short Name
  - ต้องผ่าน Keyword Safety Check ปัจจุบัน
  - เพิ่ม shared SKU rule
  - ใช้ behavior เดิมของ SKU Library

- `เปิดคลังคำศัพท์`
  - คงไว้สำหรับจัดการ mapping เต็มรูปแบบ

## Manual Order Override Data

เพิ่ม optional field ที่ Order เท่านั้น:

```js
manualSkuOverrides: [
  {
    sourceText: "exact parsed item text",
    shortName: "internal short name"
  }
]
```

Rules:

- ใช้เฉพาะ Order นั้น
- exact/normalized source item text เป็น key
- ถ้ามี override ให้ใช้ก่อนเรียก shared Matcher สำหรับ item นั้น
- Qty aggregation เดิมยังทำงานเหมือนเดิม
- Bundle quantity ใช้ original sourceText เป็น source keyword เพื่อรักษา aggregation behavior
- ไม่เปลี่ยน skuRules และไม่สร้าง rule อัตโนมัติ

## Internal Name Choices

Quick Mapping ต้องมีชื่อให้เลือกจาก SKU Library แม้ไม่มี Keyword suggestion

- Deduplicate จาก `skuRules.shortName`
- Search ได้
- การเลือกชื่อทำแค่เติม `shortName`
- ห้ามสร้าง Mapping จากการคลิกชื่อ
- ถ้าคลังว่างจริง ให้กรอกชื่อใหม่เองได้ แต่ workflow ต้องไม่ถูกบล็อก

## Source Reference

Order ใหม่ที่ parse จาก PDF จะเก็บ optional metadata:

```js
sourceFileName: "orders-round-1.pdf"
sourcePage: 3
```

แสดงใน Review table/card และ Quick Mapping

ข้อจำกัด:

- ไม่เอา Source filename ไปใช้ Match SKU
- ไม่เปลี่ยน Parser decision
- ไม่พิมพ์ source metadata ลง label โดย default

## Print Safety Design

Safety banner ยังอยู่ แต่ไม่เป็น hard dead-end

เมื่อมี Exception:

### Option 1 — Print Ready Only

- พิมพ์/Save PDF เฉพาะ Orders ที่สถานะ Ready
- Exceptions ไม่ถูกพิมพ์
- ไม่ mark Batch เป็น Completed เพราะยังมีงานค้าง

### Option 2 — Emergency Full Batch Override

- ผู้ใช้ต้อง confirm ก่อนทุกครั้ง
- พิมพ์/Save PDF ทั้ง Batch รวม Exceptions
- UI เตือนจำนวน Exception ชัดเจน
- Batch effective status ยังเป็น REVIEW ตราบใดที่ exception count > 0 แม้มี print timestamp

Default Safety behavior ยังคง block full-Batch print จนกว่าจะ explicit override

## Print Scope

สร้าง print/export scope จาก MappedOrders โดยไม่ mutate source data:

- `READY_ONLY` = getReviewFlags(order).ready === true
- `FULL_BATCH` = MappedOrders ทั้งหมด

Hidden print/export render arena ต้องใช้ scope เดียวกับ action ที่ผู้ใช้เลือก เพื่อไม่ให้หน้าจอกับผลพิมพ์ไม่ตรงกัน

## Files Expected To Change

- `index.html`
- test files under `tests/`
- optional small pure helper module if needed for testability

Do not modify unless a failing test proves necessary:

- Shopee parser logic
- TikTok parser logic
- `matchSkuRule` / matcher scoring
- Qty parsing / aggregation rules
- IndexedDB batch schema implementation

## Tests

### Quick Mapping / Manual Override

- selecting Internal Name does not mutate `skuRules`
- applying manual override changes only target Order/item
- similar SKU in another Order still routes through existing Matcher unchanged
- Quick Mapping can complete with shortName and no Keyword
- persistent Mapping action still requires Keyword Safety
- suggestion is not auto-selected on modal open

### Internal Name Choices

- unique short names are available from SKU Library
- selecting a choice fills shortName only
- no “no suggestion” state blocks manual completion

### Source Reference

- imported Order stores correct source file name and page
- continuation page preserves its own source page/file metadata
- Review search/display can surface source metadata without using it for matching

### Print Safety

- normal full print remains blocked with Exceptions
- Ready Only includes only ready Orders
- Ready Only does not mark Batch completed
- full override requires explicit confirmation path
- full override includes all Orders
- Save PDF and Print use the same selected scope
- no exception => existing full-Batch Print/Save behavior remains unchanged

### Regression

Existing parser/matcher/qty/bundle tests must remain green.

## Definition of Done

- Unmapped SKU can be resolved without creating a new shared rule
- Choosing a suggested/internal name never silently teaches the matcher
- User can always choose/search an internal name or type one manually
- Source PDF/Page visible for traceability
- User can print Ready orders while exceptions remain
- User can explicitly override and print full Batch after warning
- Parser, Matcher scoring, Qty and bundle behavior unchanged
- all tests pass
