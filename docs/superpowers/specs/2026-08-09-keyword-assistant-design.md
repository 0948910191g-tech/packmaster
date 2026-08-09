# PackMaster Keyword Assistant — Design Spec

Date: 2026-08-09
Status: Approved direction, implementation pending
Base: `main` at `19f0b010f8e494bfcceed7942bdc89da39963805`

## Goal

ช่วยผู้ใช้ตั้ง `Keyword` สำหรับสินค้าใหม่ที่ยังไม่ Mapping โดยเสนอ Keyword สั้น 2–3 ตัวเลือกจากข้อความสินค้าจริง แทนการยัดชื่อสินค้ายาวทั้งประโยคลงช่อง Keyword

ฟีเจอร์นี้ช่วยเฉพาะการเลือก Keyword เท่านั้น

- ระบบ **ไม่ตั้งชื่อภายในให้เอง**
- ระบบ **ไม่เลือก Keyword ให้เอง**
- ผู้ใช้ต้องกดเลือก suggestion เอง
- ผู้ใช้แก้ Keyword ต่อเองได้ก่อนบันทึก
- SKU rule ที่บันทึกยังมี Data Shape เดิม `{ id, keyword, shortName }`

## Problem

ปัจจุบัน `PackMasterPilotSafety.getSkuFixSeed()` เลือก unresolved item แบบปลอดภัย แต่ return ข้อความสินค้าทั้งก้อนเมื่อมี unresolved item เดียว

ตัวอย่าง:

`(1 แถม 1) ทิชชู่เปียกเครื่องสำอาง EXCARE MAKEUP REMOVER ช่วยขจัดเมคอัพและทำความสะอาดผิว 30 แผ่นใหญ่`

Keyword แบบนี้ยาว ดูแลยาก และเปราะต่อ copy ของ Marketplace แต่การย่ออัตโนมัติแล้ว save ทันทีเสี่ยงชนสินค้าอื่น

## Selected UX — Option B

เมื่อเปิด Quick Mapping สำหรับ `UNMAPPED` / `REVIEW_SKU`:

1. Keyword input เริ่มจาก safe seed เดิมเสมอ
2. ใต้ช่องมี `Keyword แนะนำ`
3. แสดงได้สูงสุด 3 candidate
4. ผู้ใช้ต้องกด candidate เองเพื่อแทนค่าช่อง Keyword
5. ไม่มี candidate ใดถูกเลือกหรือบันทึกอัตโนมัติ
6. `ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์` ยังว่างและต้องกรอกเอง
7. ผู้ใช้ยังเก็บ Keyword ยาวเดิมหรือแก้เองได้

ตัวอย่าง source ด้านบนสามารถเสนอ:

- `EXCARE MAKEUP REMOVER` — แนะนำ
- `MAKEUP REMOVER`
- `EXCARE MAKEUP`

ระบบต้องไม่เสนอ `EXCARE` เพียงคำเดียวถ้ากว้างเกินไป

## Matcher Compatibility — Hard Requirement

Matcher ปัจจุบันให้ความสำคัญกับ exact path ที่ใช้ normalized `searchArea.includes(keyword)` ก่อน fuzzy scoring

ดังนั้น Keyword Assistant ต้องรักษาหลักนี้:

- Candidate ที่ติดป้าย `แนะนำ` ต้องเป็น **ช่วงข้อความต่อเนื่องจริง** ใน normalized source text
- ห้ามสร้าง candidate โดยเอาคำจากคนละตำแหน่งมาต่อกัน เช่น `EXCARE MAKEUP REMOVER 30` ถ้า `30` อยู่ห่างออกไปหลัง descriptive tail
- Candidate ที่ไม่ใช่ contiguous substring ห้ามติดป้าย `แนะนำ`
- เป้าหมายคือให้ suggestion ใช้ exact/strong matcher path เดิมให้มากที่สุด โดยไม่แก้ Matcher

## Architecture

เพิ่ม helper แยก `packmaster-keyword-assistant.js`

หน้าที่:

- รับ source text ที่ผ่าน Pilot Safety แล้ว
- normalize เพื่อการวิเคราะห์เท่านั้น
- สร้าง candidate แบบ contiguous token windows
- ให้คะแนนความเฉพาะ
- ตรวจ collision แบบ conservative กับ context ที่ caller ส่งเข้าไป
- return suggestions พร้อม metadata

Helper ห้าม:

- parse PDF
- เปลี่ยน Qty
- เปลี่ยน Model Number
- match SKU แทน Matcher เดิม
- save SKU rule
- mutate source/order
- เรียก network/AI/cloud

## Input

```js
generateKeywordSuggestions({
  sourceText,
  existingRules,
  batchItemTexts,
  maxSuggestions: 3
})
```

`sourceText` ต้องมาจาก `getSkuFixSeed()` เดิมเท่านั้น

## Candidate Generation

Generation เป็น deterministic local heuristic

### Normalization

ทำเฉพาะเพื่อวิเคราะห์:

- trim
- collapse whitespace
- remove zero-width / NBSP noise
- normalize punctuation boundaries
- preserve original letters/digits

ห้ามแก้:

- ตัวเลข
- model/version เช่น `V2`
- `%`
- bundle/pack/variant identity
- source text ใน order

### Candidate Source Windows

สร้าง candidate จาก **ช่วงคำต่อเนื่องใน source เท่านั้น**

ลำดับ priority:

1. contiguous Latin/alphanumeric identity run 2–5 tokens เช่น `EXCARE MAKEUP REMOVER`
2. contiguous windows ที่มี model/version/variant token เช่น `HOYA V2 HAKU`
3. contiguous windows ที่มี bundle identity เช่น `HOYA 5แถม5`
4. ถ้าไม่มี strong Latin/model anchor สามารถลอง contiguous Thai/mixed windows 2–4 tokens แต่ต้องผ่าน collision checks; ถ้าไม่มั่นใจให้ไม่เสนอ

อาจตัด promotional prefix ที่ชัดเจน เช่น `(1 แถม 1)` เพื่อหา window แต่ห้ามตัด bundle identity เช่น `5แถม5`

### Candidate Ranking

คะแนนสูงขึ้นเมื่อ:

- มี 2+ identity tokens
- มี product token ที่ไม่ generic
- มี model/version/variant ที่ช่วยแยก sibling products
- เป็น exact contiguous substring ของ source
- ไม่ชน context ปัจจุบัน

คะแนนต่ำลงเมื่อ:

- สั้นเกินไป
- generic มาก
- มี collision กับหลาย distinct product texts
- ซ้อนกับ existing rule แบบเสี่ยง ambiguity

## Collision / Safety Checks

ตรวจอย่าง conservative กับ:

1. `skuRules` ปัจจุบัน
2. raw `parsedItems[].text` ใน Active Batch
3. source item ปัจจุบัน

Reject candidate เมื่อ:

- ว่าง/สั้นเกิน threshold
- generic single token เช่น `HOYA`, `HAKU`, `BABY`, `EXCARE`
- candidate ไม่อยู่แบบ contiguous substring ใน source
- candidate เท่ากับ existing keyword ที่ชี้ไป rule อื่นโดยไม่มีเหตุผลให้สร้างซ้ำ

Downgrade เป็น `review` เมื่อ:

- candidate ปรากฏใน distinct batch product texts หลายรายการ
- candidate เป็น prefix/subset ของ existing rule ที่อาจทำให้กว้างเกินไป
- sibling context แสดงว่าการตัด model/variant ทำให้หลายสินค้าแชร์ candidate เดียวกัน

ถ้าไม่มั่นใจ ห้ามติดป้าย `แนะนำ`

## Result Shape

Ephemeral only:

```js
{
  value: 'EXCARE MAKEUP REMOVER',
  confidence: 'recommended' | 'review',
  reason: 'identity-run' | 'model-window' | 'shortest-safe',
  collisions: 0
}
```

ไม่มีการ persist suggestion metadata

## UI

### Quick Mapping Modal

ใต้ Keyword input:

`Keyword แนะนำ`

Suggestion เป็น clickable chips/cards:

- `EXCARE MAKEUP REMOVER` + badge `แนะนำ`
- `MAKEUP REMOVER`
- `EXCARE MAKEUP`

เมื่อกด:

- set `quickMapState.keyword` เป็น candidate
- highlight candidate ที่เลือก
- ไม่ save
- ไม่แก้ `shortName`

ถ้าไม่มี candidate:

`ยังไม่มี Keyword สั้นที่ระบบแนะนำได้อย่างปลอดภัย — ใช้ชื่อเดิมหรือแก้ Keyword เอง`

### SKU Library Handoff

`เปิดคลังคำศัพท์` ส่ง Keyword ที่ผู้ใช้เลือก/แก้ล่าสุดไป form เดิม ไม่มี Data Shape ใหม่

### Manual SKU Library Form

รอบแรกไม่เพิ่ม suggestion ให้ blank form เพื่อคุม scope ฟีเจอร์ทำงานเฉพาะเมื่อมี safe source text จาก Review

## Error Handling

ถ้า helper โหลดไม่ได้หรือ throw:

- Quick Mapping ยังเปิดได้
- safe seed เดิมยังอยู่ใน Keyword input
- manual edit/save ทำงานเดิม
- helper failure ห้าม block workflow

## Hard Restrictions

ห้ามแก้ behavior ของ:

- Shopee Parser
- TikTok Parser
- Multi-SKU
- Qty Parsing
- Quantity Aggregation
- SKU Matcher
- Bundle Matching
- Print engine
- Save PDF engine/scope
- `packmaster-batch.js`
- IndexedDB schema / `DB_VERSION`
- Workspace backup schema

ห้ามเพิ่ม Database / Backend / Auth / AI API / Cloud / Paid service / telemetry

## Tests

### Helper

1. long mixed Thai/English source produces <= 3 suggestions
2. recommended candidate is contiguous normalized substring of source
3. `EXCARE MAKEUP REMOVER` can be recommended for the sample source
4. synthetic non-contiguous `EXCARE MAKEUP REMOVER 30` is not recommended when not contiguous
5. generic `EXCARE`, `HOYA`, `HAKU`, `Baby` alone is rejected
6. `V2`, `95%`, model/variant values are preserved when present in candidate
7. `5แถม5` is not removed as promo noise
8. existing-rule collision downgrades/rejects candidate
9. active-batch sibling collision downgrades/rejects candidate
10. same input/context returns same ordered suggestions
11. no safe candidate returns `[]`

### UI

12. Quick Mapping starts from safe seed
13. suggestion section appears when candidates exist
14. clicking suggestion changes only Keyword input
15. `shortName` remains blank until user types it
16. clicking suggestion does not save rule
17. save still writes ordinary `{ keyword, shortName }` rule through existing path
18. `เปิดคลังคำศัพท์` carries selected/manual Keyword forward
19. helper failure/no suggestion falls back to manual workflow

### Regression

20. Smart Matcher tests unchanged
21. Qty/Bundle tests unchanged
22. Pilot Safety and Review Exception tests pass
23. Print/Save PDF full-Batch invariant passes
24. frozen `packmaster-batch.js` hash unchanged
25. JSX compile passes
26. Chromium Quick Mapping smoke passes

## Rollout

1. Feature branch from latest main
2. RED helper/UI tests
3. Implement standalone helper
4. Wire Quick Mapping presentation only
5. Full regression + JSX + guardrails
6. Chromium with sanitized synthetic products
7. PR merge-result CI
8. Merge only clean diff without Core changes
9. Main CI + Pages + Production Smoke
10. Production Chromium verification

## Definition of Done

- Safe long source can show up to 3 shorter Keyword suggestions
- Recommended candidates stay on exact contiguous matcher path
- User selects manually
- Internal Short Name is never guessed/auto-filled
- Manual long seed remains fallback
- Collision-prone suggestions are downgraded/omitted
- SKU rule data shape unchanged
- Matcher/Parser/Qty/Print/Batch adapter untouched
- Regression + Chromium + Production verification pass
