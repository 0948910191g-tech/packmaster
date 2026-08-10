# PackMaster Review Confirmation UX V2 — Design Spec

## Goal

ลดเวลาตรวจ Exception และลดโอกาสสร้าง Mapping ที่ไปรบกวน SKU อื่น โดยทำให้แอดมินเห็นไฟล์ต้นทาง/ใบจริง, มี Keyword แนะนำที่ปลอดภัย, และสามารถยืนยันว่า SKU/Qty ถูกต้องได้เฉพาะ Order นั้นโดยไม่แก้ Parser/Matcher core และไม่สร้าง Shared Mapping อัตโนมัติ

## Product Principle

Feature นี้ต้องช่วยให้ร้านแพ็กเร็วขึ้นหรือผิดน้อยลง โดยยังคง Safety-first และ Exceptions-first UX

- Parser/Matcher/Qty core เป็นของเสี่ยง ห้ามแก้โดยไม่มี Real Failure Case
- การยืนยันโดยแอดมินเป็น Review-layer state ไม่ใช่การแก้ parserWarning / qtyWarning ต้นฉบับ
- การเลือก Keyword/ชื่อใน Review ห้ามสร้าง Shared SKU Mapping อัตโนมัติ
- Shared Mapping จะเกิดเฉพาะเมื่อผู้ใช้กด action ชัดเจนว่า `บันทึกเป็น Mapping และใช้`

## Scope

1. แสดงชื่อไฟล์ที่อยู่ในแต่ละ Batch
2. ทุก Exception ที่ต้องตั้ง Mapping ต้องมี Keyword แนะนำให้เลือกอย่างน้อย 1 ค่า
3. REVIEW_SKU / REVIEW_QTY มี action ยืนยันว่า `ถูกต้อง` เฉพาะ Order นั้น
4. ถ้าข้อมูลผิด ผู้ใช้ยังแก้ SKU / Qty ได้
5. หน้าต่าง Review/Fix แบบ side-by-side แสดงใบจริงด้านข้าง โดยใช้ภาพ PDF ต้นฉบับก่อน LabelCard เขียนข้อความ PackMaster ทับ
6. ไม่แก้ Matcher scoring, Shopee/TikTok parser decision logic, Qty parsing หรือ Bundle aggregation

## 1. Batch Source File Visibility

### Current State

แต่ละ Order มี `sourceFileName` และ `sourcePage` แล้ว แต่หน้า Batch ยังไม่สรุปชื่อไฟล์

### New Behavior

หน้า `งานแพ็ก / Batch` ต้องสรุป source filenames จาก Orders ใน Batch นั้นและแสดงใต้ชื่อ Batch

ตัวอย่าง:

- 1 ไฟล์: `ไฟล์: TikTok_10Aug.pdf`
- 2–3 ไฟล์: `ไฟล์: TikTok_A.pdf • Shopee_B.pdf`
- มากกว่า 3 ไฟล์: `ไฟล์: TikTok_A.pdf • Shopee_B.pdf • +3 ไฟล์`

### Data Rule

- ใช้ `order.sourceFileName` ที่มีอยู่แล้ว
- deduplicate แบบ case-insensitive
- ไม่สร้าง metadata schema ใหม่ถ้าไม่จำเป็น
- Batch ที่ยังไม่มีไฟล์ แสดง `ยังไม่มีไฟล์`
- Archived Batch ต้องแสดงได้เหมือน Active Batch ตราบใดที่ Orders ยังอยู่ใน IndexedDB

## 2. Safe Keyword Suggestions Must Always Be Present

### Intent

ห้ามปล่อย popup อยู่ในสภาพที่ระบบบังคับให้สร้าง Mapping แต่ไม่มี Keyword ให้เลือกเลย

### Important Clarification

คำว่า “แนะนำ” ใน requirement นี้หมายถึง **Keyword แนะนำ** ไม่ใช่ Internal Short Name

### UX

ใน Quick Mapping/Fix modal มี section `Keyword แนะนำ`

- แสดงเป็น chips/buttons ให้ผู้ใช้กดเลือก
- ห้าม auto-fill ช่อง Keyword
- ห้าม auto-save Mapping
- ถ้าผู้ใช้ไม่กดบันทึก Mapping การเลือกชื่อเฉพาะ Order ต้องไม่เปลี่ยน Shared SKU Library

### Candidate Priority

ให้ Keyword Assistant หา candidate ตามลำดับความเฉพาะ:

1. Seller SKU / model / variant identity ที่เป็นข้อความเฉพาะและอยู่ใน source text
2. Brand + product identity + variant/model/scent/pack descriptor
3. ชุดคำ Product Identity ที่ยาวและเฉพาะที่สุด
4. ถ้าไม่มี candidate สั้นที่ผ่าน safety ให้ใช้ **full source product text ที่ normalize แล้ว** เป็น fallback candidate

### Forbidden Weak Keywords

ห้ามแนะนำ keyword ที่เป็น generic token เดี่ยว เช่น:

- `HOYA`
- `HAKU`
- `Baby`
- `Wipes`
- `Cooling`
- `30 Sheets`

เว้นแต่ข้อความนั้นเป็น exact seller/model identity ที่ระบบยืนยัน uniqueness ได้จริง

### Safety Checks Before Showing a Recommended Keyword

Keyword ที่ได้สถานะ `recommended` ต้อง:

- ไม่ซ้ำ keyword เดิมใน SKU Library
- ไม่ทำให้ผล routing ของ SKU เดิมเปลี่ยน
- ไม่ cross-match กับ item อื่นใน Batch ปัจจุบัน
- ต้อง match source item ของตัวเองได้
- ต้องไม่เป็น metadata เช่น Order ID, Tracking, Phone, Address, Qty total

### Guaranteed Fallback

ถ้า candidate สั้นทั้งหมดไม่ผ่าน:

- สร้าง fallback จาก full source product text
- fallback ต้องผ่าน normalization และตัด metadata noise
- ถ้ายังชนกับ item อื่นใน Batch ให้เพิ่ม discriminator ที่มีอยู่จริงใน source text เช่น Seller SKU / variant/model token
- ถ้าไม่มี discriminator จริง ห้ามประดิษฐ์ keyword ที่ไม่มีในเอกสาร
- ในกรณีที่ไม่สามารถพิสูจน์ uniqueness ข้ามข้อมูลอนาคตได้ ให้แสดง label `เฉพาะที่สุดจากข้อมูลปัจจุบัน` แทนการอ้างว่า “ปลอดภัย 100%”

### Future Collision Principle

ระบบไม่สามารถรับประกันว่า SKU ใหม่ในอนาคตจะไม่มีข้อความเหมือนกัน 100% ได้ ดังนั้นต้องลดความเสี่ยงด้วยการใช้ identity ที่เฉพาะที่สุดจาก source ปัจจุบัน และไม่ auto-save mapping

## 3. Review Acknowledgements — Option A

### Intent

ถ้า PackMaster เตือน REVIEW_SKU / REVIEW_QTY แต่แอดมินตรวจใบจริงแล้วพบว่าระบบอ่านถูก ต้องสามารถยืนยันและเคลียร์ Exception เฉพาะ Order นั้นได้ทันที

### Data Shape

เพิ่ม review-layer state บน Order แบบ backward-compatible:

```js
reviewAcknowledgements: {
  sku: {
    confirmed: true,
    confirmedAt: "ISO timestamp"
  },
  qty: {
    confirmed: true,
    confirmedAt: "ISO timestamp"
  }
}
```

สามารถมีเฉพาะ `sku` หรือ `qty` ได้

### Hard Rule

- ห้ามเปลี่ยน `parserWarning` จาก true เป็น false เมื่อแอดมินยืนยัน
- ห้ามเปลี่ยน `qtyWarning` ต้นฉบับเพื่อซ่อนประวัติ
- Exception layer ต้องหัก acknowledgement ออกจากสถานะที่ต้องตรวจ

ตัวอย่าง:

```text
parserWarning = true
reviewAcknowledgements.sku.confirmed = true
=> REVIEW_SKU ถือว่า resolved สำหรับ Order นี้
```

```text
qtyWarning = true
reviewAcknowledgements.qty.confirmed = true
=> REVIEW_QTY ถือว่า resolved สำหรับ Order นี้
```

### UI

ใน Exception Review:

- `☐ SKU ถูกต้อง`
- `☐ Qty ถูกต้อง`

แสดงเฉพาะประเภท warning ที่ Order นั้นมี

เมื่อยืนยัน:

- checkbox/action ต้องบอกชัดว่า `ยืนยันว่าตรวจแล้วและถูกต้อง`
- Exception count อัปเดตทันที
- ถ้าไม่มี Exception อื่น Order เปลี่ยนเป็น Ready
- Batch readiness อัปเดตทันที
- ไม่สร้าง Mapping
- ไม่แก้ Matcher

### Incorrect Case

ถ้าไม่ถูก:

- REVIEW_SKU มี action `แก้ SKU`
- REVIEW_QTY มี action `แก้ Qty`
- การแก้ต้องเป็น Review-layer override และไม่แก้ Parser core

สำหรับ Qty override ให้เก็บค่าที่ผู้ใช้แก้แบบ per-order/per-item โดยแยกจาก parsed qty ต้นฉบับ เพื่อให้ audit/debug ได้

## 4. Side-by-Side Exception Review Modal

### Desktop Layout

Modal/Drawer ขยายเป็น 2 columns:

```text
┌───────────────────────────┬───────────────────────────┐
│ ใบ PDF ต้นฉบับ            │ Review Controls           │
│                           │ Order / Tracking          │
│ ใช้ order.pdfImage        │ Source file + page        │
│                           │ Product source text       │
│ ไม่มี PackMaster overlay  │ Keyword suggestions      │
│                           │ Internal name             │
│                           │ Qty parsed/override       │
│                           │ SKU ถูกต้อง / Qty ถูกต้อง │
│                           │ Save actions              │
└───────────────────────────┴───────────────────────────┘
```

### Source Image Rule

- ใช้ `order.pdfImage` ที่สร้างจาก PDF page ตอน upload
- ห้ามใช้ `LabelCard` เป็นภาพอ้างอิงใน modal เพราะ LabelCard มีข้อความผลลัพธ์ของ PackMaster ทับอยู่
- ภาพต้อง zoom/scroll ได้พอให้แอดมินอ่าน Product Name / Seller SKU / Qty จากใบจริง

### Mobile / Narrow Screen

เรียงเป็น:

1. ใบ PDF ต้นฉบับ
2. Review Controls

ไม่บังคับ 2 columns ถ้าหน้าจอแคบ

### Controls

ฝั่ง Review ต้องมี:

- Order / Tracking
- `Source: <filename> • หน้า <n>`
- source product text
- Keyword suggestions
- Keyword input สำหรับ Shared Mapping เท่านั้น
- Internal Short Name searchable from existing library + manual entry
- `ใช้กับ Order นี้`
- `บันทึกเป็น Mapping และใช้`
- SKU acknowledgement ถ้ามี REVIEW_SKU
- Qty acknowledgement ถ้ามี REVIEW_QTY
- Qty correction control ถ้าผู้ใช้ระบุว่า Qty ผิด

## 5. Exception Resolution Rules

Exception status ต้องคำนวณจาก raw warning + review acknowledgement/override

### REVIEW_SKU Resolved When

อย่างใดอย่างหนึ่งเป็นจริง:

- Admin ยืนยัน `SKU ถูกต้อง`
- SKU ถูกแก้ด้วย per-order manual override จนได้ผลลัพธ์ที่พิมพ์ได้

### REVIEW_QTY Resolved When

อย่างใดอย่างหนึ่งเป็นจริง:

- Admin ยืนยัน `Qty ถูกต้อง`
- Qty ถูกแก้ด้วย per-order Review Qty override ที่ valid

### UNMAPPED Resolved When

- มี per-order Internal Short Name override ที่ valid
- หรือผู้ใช้บันทึก Shared Mapping ที่ผ่าน Safety Check แล้ว mapping สำเร็จ

### Parser Warning

Parser warning ยังคงถูกเก็บใน raw Order แต่ไม่ควรบล็อก Print ถ้า review acknowledgements ที่เกี่ยวข้องถูกยืนยันครบแล้ว

## 6. Qty Correction Scope

### Goal

ให้ผู้ใช้แก้ Qty ผิดจากหน้า Review โดยไม่แก้ parser algorithm

### Rule

- Qty override ต้องเป็นค่าจำนวนเต็มบวก
- ผูกกับ item/sourceText ที่ผู้ใช้กำลังตรวจ
- ใช้ override ในการ aggregate/print สำหรับ Order นั้นเท่านั้น
- เก็บ parsed Qty เดิมไว้
- ห้ามแก้ pack-size/model-number logic
- ห้ามสร้าง `x2/x3`; output aggregation ยังต้องเป็นจำนวนบวกตาม business rule เดิม

## 7. Safety / Non-Goals

### Must Not Change

- `scoreSkuRule` / matcher scoring
- Shopee parser decision logic
- TikTok parser decision logic
- Multi-SKU parser
- Qty parser
- Bundle matching / quantity aggregation core
- Print thermal layout logic
- Shared SKU Library data shape เดิมโดยไม่จำเป็น
- Framework / dependency

### Not In This Feature

- Supabase / Login / Cloud sync
- Multi-user review
- AI/LLM-generated keywords
- Auto-learning from acknowledgement
- Auto-create Shared Mapping when checkbox is confirmed

## 8. Persistence

Review acknowledgements และ per-order overrides ต้องถูกเก็บใน Orders ของ Batch ผ่าน IndexedDB เดิม เพื่อให้:

- เปิด Batch กลับมาแล้วสถานะยังอยู่
- Browser refresh แล้ว acknowledgement ไม่หาย
- Backup/Restore สามารถพาข้อมูลนี้ไปด้วยโดยอาศัย existing Order payload

Backward compatibility:

- Order เก่าที่ไม่มี `reviewAcknowledgements` ต้องทำงานเหมือน `{}`
- Order เก่าที่ไม่มี Qty override ต้องใช้ parsed Qty เดิม

## 9. UI Copy

ใช้คำสั้นและ operational:

- `Keyword แนะนำ`
- `เลือก Keyword`
- `SKU ถูกต้อง`
- `Qty ถูกต้อง`
- `ยืนยันว่าตรวจแล้ว`
- `แก้ SKU`
- `แก้ Qty`
- `ใช้กับ Order นี้`
- `บันทึกเป็น Mapping และใช้`
- `เฉพาะที่สุดจากข้อมูลปัจจุบัน`

หลีกเลี่ยง copy ที่อ้างว่าปลอดภัยในอนาคต 100%

## 10. Test Requirements

### Batch Files

- 1 source file แสดงชื่อถูกต้อง
- หลาย Order จากไฟล์เดียว deduplicate เหลือชื่อเดียว
- หลายไฟล์แสดง unique names
- ไม่มี sourceFileName แสดง fallback

### Keyword Suggestions

- ห้าม auto-fill keyword
- weak generic candidate ไม่ขึ้นเป็น recommended
- candidate ที่เปลี่ยน routing SKU เดิมต้องไม่ recommended
- candidate ที่ชน item อื่นใน Batch ต้องไม่ recommended
- เมื่อไม่มี short candidate ต้องมี fallback จาก source identity ให้เลือก
- fallback ห้ามใช้ metadata/order/tracking/phone/address

### Acknowledgements

- SKU acknowledgement ทำให้ REVIEW_SKU หายแต่ `parserWarning` เดิมยังอยู่
- Qty acknowledgement ทำให้ REVIEW_QTY หายแต่ raw warning เดิมยังอยู่
- acknowledge SKU ไม่เคลียร์ Qty warning
- acknowledge Qty ไม่เคลียร์ SKU warning
- เมื่อทุก Exception ถูก resolve Order เป็น Ready
- acknowledgement persist หลัง save/load Batch

### Qty Override

- positive integer accepted
- zero/negative/NaN rejected
- override affects only target Order/item
- parsed qty ต้นฉบับไม่ถูกแก้
- quantity aggregation business rule เดิมยังผ่าน regression

### Modal

- ใช้ `pdfImage` ไม่ใช่ LabelCard preview สำหรับ source panel
- source filename/page แสดงถูกต้อง
- modal มี Keyword suggestions + internal name + acknowledgement controls
- desktop เป็น side-by-side, narrow screen stack

### Regression

ต้องรัน regression เดิมทั้งหมด โดยเฉพาะ:

- Smart Matcher
- Shopee/TikTok parser fixtures
- Multi-SKU
- Qty
- Bundle aggregation
- Print/Save PDF/Thermal
- Local Batch persistence
- Workspace Backup/Restore
- Quick Mapping safety
- Print scope/override

## 11. Rollout

1. ทำใน isolated feature branch
2. TDD: failing contract tests ก่อน production code
3. Implement minimal Review-layer helpers
4. Integrate UI
5. Run full regression suite
6. Open PR to main
7. CI green
8. Merge only after verification
9. GitHub Pages build
10. Production smoke test

## Definition of Done

- หน้า Batch เห็น source filenames
- Exception ที่ต้อง Mapping มี Keyword recommendation ให้เลือกเสมอ โดยไม่ auto-fill/auto-save
- Admin ยืนยัน SKU/Qty ถูกต้องแยกกันได้และ Exception หายตามประเภท
- Admin แก้ SKU/Qty ผิดได้แบบ per-order Review override
- Review modal เห็นใบ PDF ต้นฉบับด้านข้าง
- Raw warnings ยังอยู่เพื่อ debug/audit
- ไม่มี Parser/Matcher/Qty core change
- Full regression และ production smoke ผ่าน
