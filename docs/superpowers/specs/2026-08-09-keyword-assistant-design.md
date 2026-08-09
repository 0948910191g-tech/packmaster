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

ปัจจุบัน `PackMasterPilotSafety.getSkuFixSeed()` เลือกข้อความ SKU ที่ยัง unresolved แบบปลอดภัย แต่ return ข้อความสินค้าทั้งก้อน เมื่อมี unresolved item เดียว

ผลคือสินค้าใหม่อาจได้ Keyword เช่น:

`(1 แถม 1) ทิชชู่เปียกเครื่องสำอาง EXCARE MAKEUP REMOVER ช่วยขจัดเมคอัพและทำความสะอาดผิว 30 แผ่นใหญ่`

Keyword แบบนี้:

- ยาวเกินไป
- อ่านและดูแลยาก
- เปราะต่อการเปลี่ยน copy ของ marketplace
- ทำให้พนักงานต้องคิดเองว่าจะตัดคำตรงไหน

แต่การย่อคำอัตโนมัติแล้ว save ทันทีมีความเสี่ยงสูง เพราะ Keyword ที่สั้นเกินไปอาจชนสินค้าอื่น

## Selected UX — Option B

เมื่อเปิด Quick Mapping สำหรับ `UNMAPPED` / `REVIEW_SKU`:

1. ช่อง Keyword ยังคงเริ่มจาก safe seed เดิม เพื่อไม่ทำข้อมูลหาย
2. ใต้ช่อง Keyword มี section `Keyword แนะนำ`
3. ระบบแสดงได้สูงสุด 3 candidate
4. ผู้ใช้ต้องกด candidate เพื่อแทนค่าช่อง Keyword
5. ไม่มี candidate ใดถูกเลือกหรือบันทึกอัตโนมัติ
6. ช่อง `ชื่อภายใน / ผลลัพธ์ที่จะพิมพ์` ยังว่างและต้องกรอกเอง
7. ผู้ใช้ยังสามารถเก็บ Keyword ยาวเดิมหรือแก้เองได้

ตัวอย่าง:

Source:
`(1 แถม 1) ทิชชู่เปียกเครื่องสำอาง EXCARE MAKEUP REMOVER ช่วยขจัดเมคอัพและทำความสะอาดผิว 30 แผ่นใหญ่`

Suggested candidates:

- `EXCARE MAKEUP REMOVER 30` — แนะนำ
- `EXCARE MAKEUP REMOVER`
- `MAKEUP REMOVER 30`

ระบบต้องไม่เสนอ `EXCARE` เพียงคำเดียวถ้ากว้างเกินไป

## Architecture

เพิ่ม helper แยกจาก Parser/Matcher เช่น `packmaster-keyword-assistant.js`

หน้าที่ของ helper:

- รับ source text ที่ผ่าน Pilot Safety แล้ว
- normalize เพื่อการวิเคราะห์เท่านั้น
- สร้าง candidate 2–3 แบบ
- ให้คะแนนความเฉพาะของ candidate
- ตรวจ collision แบบ conservative กับ context ที่ caller ส่งเข้าไป
- return suggestions พร้อม reason/risk metadata

ตัว helper **ห้าม**:

- parse PDF
- เปลี่ยน Qty
- เปลี่ยน Model Number
- match SKU แทน matcher เดิม
- save SKU rule
- mutate source text/order
- เรียก network/AI/cloud

## Input

Conceptual API:

```js
generateKeywordSuggestions({
  sourceText,
  existingRules,
  batchItemTexts,
  maxSuggestions: 3
})
```

`sourceText` ต้องมาจาก safe seed เดิม (`getSkuFixSeed`) ไม่ดึงข้อความใหม่จาก PDF เอง

## Candidate Generation

Generation เป็น deterministic local heuristic เท่านั้น

### Normalization

ทำเฉพาะเพื่อสร้าง suggestion:

- trim
- collapse whitespace
- normalize non-breaking spaces / zero-width noise
- normalize punctuation boundaries
- preserve original letter/digit values

ห้ามแก้:

- ตัวเลข
- model/version เช่น `V2`
- `%`
- pack/variant identity
- ข้อความต้นฉบับใน order

### Candidate A — Strong identity tokens

พยายามเก็บ token ที่มี identity สูง เช่น:

- brand/product English tokens (`EXCARE`, `MAKEUP`, `REMOVER`)
- model/version/alphanumeric token
- ตัวเลขที่อยู่ในชื่อสินค้า
- variant token ที่เด่น

ตัดเฉพาะ token/phrase ที่ชัดว่าเป็น promotional noise จากชุด stop phrase จำกัดและ reviewable เช่น `1 แถม 1` เมื่อไม่ได้เป็น bundle identity ที่ matcher ต้องใช้

**ข้อควรระวัง:** ถ้าข้อความมี bundle/pack identity ที่อาจมีผลต่อสินค้า เช่น `5แถม5`, ห้ามตัดด้วยกฎ promo ทั่วไป

### Candidate B — Product identity without descriptive tail

สร้าง candidate ที่ยาวกว่า A เล็กน้อย โดยตัด descriptive tail ที่เป็นคำอธิบายทั่วไปเมื่อทำได้อย่างมั่นใจ

ตัวอย่าง:

`EXCARE MAKEUP REMOVER ช่วยขจัดเมคอัพและทำความสะอาดผิว 30 แผ่นใหญ่`
→ candidate อาจเป็น `EXCARE MAKEUP REMOVER 30`

ถ้า heuristic ไม่มั่นใจ ให้ไม่สร้าง candidate B แทนการเดา

### Candidate C — Shortest safe candidate

จาก token windows ที่ derive จาก source เดิม เลือก candidate ที่สั้นที่สุดซึ่งยังผ่าน collision checks

ถ้าไม่มี candidate ที่ปลอดภัยพอ ให้แสดงน้อยกว่า 3 ตัวได้ หรือไม่แสดง suggestion เลย

## Collision / Safety Checks

Keyword Assistant ไม่สามารถรับประกันอนาคต 100% จึงใช้คำว่า `แนะนำ` เฉพาะ candidate ที่ผ่าน checks ปัจจุบัน

แต่ละ candidate ต้องถูกตรวจอย่าง conservative กับ:

1. `skuRules` ปัจจุบัน
2. raw `parsedItems[].text` ใน Active Batch
3. source item ปัจจุบันต้อง match candidate ด้วย normalization เดียวกัน

Reject / downgrade candidate เมื่อ:

- สั้นเกิน threshold
- เป็น generic brand/common term เพียงอย่างเดียว เช่น `HOYA`, `HAKU`, `Baby`, `EXCARE`
- candidate เกิดใน source products หลายรายการที่มี identity ต่างกัน
- candidate ใกล้/ซ้อนกับ existing rule จนไม่สามารถแยกสินค้าได้อย่างชัดเจน
- candidate ตัดตัวเลข/model/variant สำคัญออกในกรณีที่ context แสดงว่ามี sibling products ต่างกันที่ token นั้น

ถ้า collision status ไม่ชัดเจน ให้ `risk: review` หรือไม่เสนอเลย — ห้ามติดป้าย `แนะนำ`

## Suggestion Result Shape

Ephemeral only; ไม่ persist:

```js
{
  value: 'EXCARE MAKEUP REMOVER 30',
  confidence: 'recommended' | 'review',
  reason: 'distinctive-tokens' | 'shortest-safe',
  collisions: 0
}
```

Data shape ของ `skuMappingRules` เดิมไม่เปลี่ยน

## UI

### Quick Mapping Modal

ใต้ Keyword input:

`Keyword แนะนำ`

แสดง suggestion เป็น clickable chips/cards:

- `EXCARE MAKEUP REMOVER 30` + badge `แนะนำ`
- `EXCARE MAKEUP REMOVER`
- `MAKEUP REMOVER 30`

เมื่อกด:

- set `quickMapState.keyword` เป็น candidate
- highlight candidate ที่เลือก
- ไม่มีการ save

ถ้าไม่มี candidate ที่ปลอดภัย:

`ยังไม่มี Keyword สั้นที่ระบบแนะนำได้อย่างปลอดภัย — ใช้ชื่อเดิมหรือแก้ Keyword เอง`

### SKU Library Handoff

ถ้าผู้ใช้กด `เปิดคลังคำศัพท์` จาก Quick Mapping:

- Keyword ที่ผู้ใช้เลือก/แก้ล่าสุดต้องถูกส่งไปเหมือนเดิม
- ไม่ต้องเพิ่ม Data Shape ใหม่
- ไม่ต้อง persist suggestion metadata

### Manual SKU Library Form

รอบแรกไม่เพิ่ม suggestion ให้ manual blank form เพื่อหลีกเลี่ยง scope creep

ฟีเจอร์ทำงานเฉพาะเมื่อมี source text จาก Review/Quick Mapping ที่ผ่าน Pilot Safety แล้ว

## Error Handling

Keyword Assistant เป็น convenience layer เท่านั้น

ถ้า helper โหลดไม่ได้หรือ throw:

- Quick Mapping ต้องยังเปิดได้
- safe seed เดิมต้องยังอยู่ใน Keyword input
- ผู้ใช้กรอก/แก้ Keyword เองและบันทึกได้ตามเดิม
- แสดงคำช่วยสั้น ๆ ว่า recommendation unavailable ได้ แต่ห้าม block workflow

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
- Workspace backup schema โดยไม่จำเป็น

ห้ามเพิ่ม:

- Database
- Backend
- Auth/Login
- AI API
- Cloud service
- Paid service
- telemetry

## Tests

### Helper tests

1. long mixed Thai/English product produces <= 3 suggestions
2. `EXCARE MAKEUP REMOVER ... 30` can recommend a shorter identity candidate containing discriminative product terms
3. generic single token such as `EXCARE` is rejected
4. model/version numbers are preserved when used in candidate
5. `%` / variant identity is not silently rewritten
6. bundle signature such as `5แถม5` is not removed by promo cleanup
7. collision with existing rules downgrades/rejects candidate
8. collision across active batch products downgrades/rejects candidate
9. no safe candidate returns empty list
10. deterministic: same input/context returns same ordered suggestions

### UI tests

11. Quick Mapping still starts from Pilot Safety safe seed
12. suggestion section appears when candidates exist
13. clicking suggestion changes only Keyword input
14. shortName remains blank until user enters it
15. clicking suggestion does not save rule
16. save still writes ordinary `{ keyword, shortName }` rule through existing save path
17. `เปิดคลังคำศัพท์` carries selected/manual Keyword forward
18. helper failure falls back to current Quick Mapping behavior

### Regression / safety

19. existing Smart Matcher tests pass unchanged
20. Qty tests pass unchanged
21. Bundle tests pass unchanged
22. Pilot Safety tests pass
23. Review exception workflow passes
24. Print/Save PDF full-Batch invariant passes
25. frozen `packmaster-batch.js` hash remains unchanged
26. JSX compile passes
27. Chromium Quick Mapping smoke passes

## Rollout

1. Branch from latest `main`
2. RED helper/UI contract tests
3. Implement standalone helper
4. Wire Quick Mapping presentation only
5. Full regression + JSX compile + guardrails
6. Chromium smoke with synthetic SKU names
7. PR + merge-result CI
8. Merge only if clean diff contains no Core parser/matcher/qty/batch changes
9. Main CI + Pages + Production smoke
10. Production Chromium verification

## Definition of Done

- สินค้าใหม่ที่มี safe source text ยาวสามารถเห็น Keyword แนะนำสูงสุด 3 ตัวเลือก
- ผู้ใช้เป็นคนกดเลือกเอง
- ชื่อภายในไม่ถูกเดาหรือเติมอัตโนมัติ
- Keyword เดิมยังแก้เองได้
- collision-prone candidate ไม่ถูกติดป้ายแนะนำ
- ไม่มี suggestion ที่ปลอดภัยก็ไม่ block workflow
- saved SKU rule data shape เดิม
- Matcher/Parser/Qty/Print/Batch adapter ไม่ถูกแก้
- Regression + Chromium + Production verification ผ่าน
