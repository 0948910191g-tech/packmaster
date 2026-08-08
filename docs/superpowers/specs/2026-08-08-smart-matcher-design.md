# PackMaster Smart Matcher Design

## 1. Goal

ลด 3 ปัญหาหลักโดยไม่เพิ่มความเสี่ยงจับ SKU ผิด:

1. จับสินค้าเป็น SKU ผิดเมื่อชื่อคล้ายกันมาก
2. อ่าน Qty ผิดเพราะเอาตัวเลขในชื่อสินค้า/ขนาดแพ็กมาปนกับจำนวนที่ลูกค้าสั่ง
3. TikTok 1 ออเดอร์มีหลาย SKU แต่ระบบแสดงไม่ครบ เพราะ parser ปัจจุบันแยกหลายรายการเฉพาะ Shopee

หลักความปลอดภัย: **ไม่มั่นใจ = ไม่จับ** และแสดง `⚠️ ตรวจสอบ SKU` แทนการเดา

## 2. Current problem

ระบบปัจจุบัน normalize ข้อความแล้วใช้ exact `includes` ก่อน จากนั้น fallback เป็นการตรวจว่าคำใน keyword ปรากฏครบหรือไม่ โดยไม่ได้แยกน้ำหนักของคำสำคัญ เช่น `Value Pack`, `Plus`, `Cooling`, `Extra Cooling`, pack size หรือ Seller SKU

ผลคือ SKU ที่มีคำร่วมกันมากอาจชนกัน เช่น:

- `HOYA Baby Wipes 5 ห่อ` กับ `HOYA Baby Wipes Value Pack 5 ห่อ`
- `HAKU Cooling 1 ห่อ` กับ `HAKU Cooling 3 ห่อ`
- `HOYA Baby Wipes` กับ `HOYA Baby Wipes Plus`

นอกจากนี้ PDF จริงมีตัวเลขหลายประเภทในแถวเดียว เช่น pack size, จำนวนแผ่น, ความเข้มข้น, variant และ Qty

ปัญหาอีกจุดคือ multi-item parser ปัจจุบันทำงานภายใต้เงื่อนไข `platform === 'SHOPEE'` เป็นหลัก เมื่อเป็น TikTok ที่มี 2 SKU ในใบเดียว ระบบจึงมีโอกาส fallback ให้ทั้งตารางกลายเป็น `parsedItems` เพียงรายการเดียว ทำให้สินค้าอีกตัวไม่ถูกแสดงหรือถูก matcher กลืนรวมกับรายการแรก

## 3. Real fixture evidence

ใช้เฉพาะข้อความสินค้า/Qty ที่ตัดข้อมูลส่วนตัวออกจากไฟล์จริง ไม่ commit PDF ต้นฉบับขึ้น repository

ตัวอย่างที่ต้องครอบคลุม:

### Shopee

- `(6ห่อ) Haku Cooling ... 30 แผ่น ...` โดย Qty สั่งซื้อ = `3`
- `(1ห่อ) HAKU Extra Cooling ... กลิ่นMENTHOL 1` โดย Qty สั่งซื้อ = `2`
- `แพ็ค3ห่อ HOYA Baby Wipes ...` โดย Qty สั่งซื้ออาจเป็น `1` หรือ `2`
- `(ยกลัง24ห่อ) HOYA ... baby Wipes ... x 24แพ็ค` โดย Qty สั่งซื้อ = `1`
- `(10ห่อมีน้ำหอม) HOYA ... baby Wipes Plus ...` โดย Qty สั่งซื้อ = `1`

### TikTok

- `(แพ็ค 6ห่อ) ... Haku Cooling ... Seller SKU: Menthol 6ห่อ` โดย Qty = `1`
- `80แผ่น/ห่อ x 5แพ็ค ... HOYA baby Wipes ... Seller SKU: แพ็ค 5ห่อ` โดย Qty มีทั้ง `1` และ `3` ในไฟล์จริง
- `(ราคาส่ง ยกลัง 24ห่อ) HOYA Baby Wipes Value Pack ... Seller SKU: HOYA Value Pack 24ห่อ` โดย Qty = `1`
- `(มีกลิ่นหอม 5ห่อ) HOYA ... baby Wipes Plus ... Seller SKU: HOYA ชมพู *5ห่อ` โดย Qty = `1`
- `(แพ็ค 3ห่อ) HAKU Extra Cooling ... Seller SKU: Mix X 3` โดย Qty = `1`
- Multi-SKU fixture จริง: ออเดอร์เดียวมี `HOYA Baby Wipes Value Pack 10` และ `HOYA Baby Wipes 5แพ็ค` อยู่ในตารางเดียว โดย `Qty Total: 3` ต้องแยกเป็น 2 `parsedItems` และเก็บ Qty ของแต่ละรายการให้ครบ

## 4. Design principles

1. **Product identity และ order quantity เป็นคนละข้อมูล**
2. ตัวเลขในชื่อสินค้า เช่น `5ห่อ`, `6ห่อ`, `24ห่อ`, `80แผ่น`, `95%` ห้ามถูกใช้เป็น Qty สั่งซื้อ
3. Qty ต้องมาจากตำแหน่ง Qty/Qty Total ที่ parser ระบุเท่านั้น
4. Matcher ต้องให้ความสำคัญกับ discriminators มากกว่าคำทั่วไป
5. ห้าม fuzzy match แบบเลือกตัวที่ใกล้ที่สุดโดยไม่มี confidence gate
6. ถ้าคะแนนสูสีหรือมี conflict สำคัญ ให้ return ambiguous แทน matched
7. TikTok multi-SKU ต้องถูก split เป็นรายการก่อน matcher ห้ามส่งทั้งตารางเข้า matcher เป็น item เดียว
8. ถ้า parser แยกจำนวนรายการหรือ Qty ไม่มั่นใจ ต้องขึ้น warning แทนการซ่อนสินค้า
9. ไม่ใช้ AI API และไม่ใช้ OCR เพิ่มในรอบนี้ เพราะ PDF มี text layer อยู่แล้ว

## 5. TikTok multi-SKU parsing

### 5.1 Source boundary

สำหรับ TikTok ให้เริ่มจากช่วงหลัง header `Product Name SKU Seller SKU Qty` และจบก่อน `Qty Total:`

ห้ามตัดคำ `SKU`, `Seller SKU`, `Qty` ออกจากข้อความก่อนแยก row เพราะคอลัมน์เหล่านี้เป็น boundary สำคัญสำหรับ multi-SKU

### 5.2 Row extraction

แยกแต่ละ row เป็น object:

```js
{
  productText: string,
  skuText: string,
  sellerSkuText: string,
  qty: number,
}
```

หลักการ:

- Qty ของแต่ละ row ต้องเป็นเลขท้ายคอลัมน์ Qty ของ row นั้น ไม่ใช่เลข pack size ภายใน Product Name/Seller SKU
- ใช้ Seller SKU เป็น anchor ช่วยแยก row เพราะใน PDF TikTok จริง Seller SKU อยู่ใกล้ Qty และเป็นข้อความสั้นกว่าชื่อสินค้า
- ถ้าแยกได้หลาย row ให้สร้าง `parsedItems` แยกตาม row และส่ง matcher ทีละ item
- ห้ามเอา `Qty Total` ไป overwrite Qty ของแต่ละ row

### 5.3 Multi-SKU validation

หลัง parse:

```js
const parsedQtyTotal = parsedItems.reduce((sum, item) => sum + item.qty, 0);
```

เทียบกับ `Qty Total` จาก PDF:

- เท่ากัน → `qtyWarning = false`
- ไม่เท่ากัน → `qtyWarning = true`
- ถ้าข้อความก่อน `Qty Total` มี evidence ของหลาย row แต่ parser ได้เพียง 1 item → `skuWarning = true`

กรณี warning ห้ามซ่อนข้อมูลเงียบ ๆ ให้ UI แสดง `⚠️ ตรวจสอบ SKU` หรือ `⚠️ ตรวจสอบ Qty`

### 5.4 Single-SKU compatibility

TikTok 1 SKU ที่ปัจจุบันทำงานได้ต้องยังทำงานเหมือนเดิม เช่น Qty = 2 ต้องยังสร้าง 1 `parsedItem` ที่ qty = 2 ไม่แตกเป็น row ปลอมจากตัวเลขในชื่อสินค้า

## 6. Matching pipeline

### 6.1 Normalize

สร้าง normalized text สำหรับการ match โดย:

- lowercase
- collapse whitespace
- ลบ zero-width / NBSP
- normalize Thai combining marks แบบเดิม
- รองรับ Thai private-use marks ที่พบใน PDF จริง
- เก็บตัวเลขไว้ เพราะ pack size เป็น discriminator สำคัญ

### 6.2 Candidate generation

สร้าง candidate จากทุก rule ที่มี token สำคัญตรงกับข้อความอย่างน้อย 1 กลุ่ม โดย exact substring ยังมี priority สูงสุด แต่ไม่จบ match ทันทีหากมี candidate ที่เฉพาะเจาะจงกว่า

### 6.3 Token classes

แบ่ง token เพื่อให้คะแนน:

- `brand/common`: hoya, haku, baby, wipes, ทิชชู่เปียก
- `variant/discriminator`: value, pack, plus, cooling, extra, menthol, lavender, mix, adult, nono
- `pack`: รูปแบบจำนวน + หน่วย เช่น `3ห่อ`, `5ห่อ`, `6ห่อ`, `10ห่อ`, `24ห่อ`, `36ห่อ`, `5แพ็ค`
- `seller`: Seller SKU text ถ้ามี

### 6.4 Score

คะแนนเริ่มต้น 0:

- exact normalized keyword substring: +100
- discriminator token ตรง: +25 ต่อ token
- pack token ตรง: +30
- seller SKU token ตรง: +35
- common token ตรง: +5 ต่อ token
- discriminator ที่ rule ต้องการแต่ข้อความไม่มี: -35
- pack token conflict เช่น rule `3ห่อ` แต่ข้อความชัดว่า `6ห่อ`: -60
- variant conflict เช่น `Value Pack` vs rule ที่ไม่มี `Value Pack` ในกลุ่ม candidate เดียวกัน: -45

ค่าคะแนนเป็นค่าภายในและปรับได้จาก regression test แต่ต้องรักษาหลักว่า conflict สำคัญลงโทษแรงกว่าคำทั่วไปที่ตรงกัน

## 7. Confidence gate

ให้ candidate อันดับ 1 เป็น best และอันดับ 2 เป็น runner-up

Match อัตโนมัติเมื่อ:

- best score >= 80
- และ best - runner-up >= 20
- และไม่มี hard conflict

ถ้าไม่ผ่านให้ผลเป็น:

```text
⚠️ ตรวจสอบ SKU
```

พร้อมเก็บ best candidate สำหรับ debug UI ภายในได้ แต่ห้ามพิมพ์ SKU นั้นเป็นผลจริง

## 8. Quantity parsing

### 8.1 Shopee

ใช้ Qty ที่ parser แยกจากคอลัมน์/ท้ายรายการตามโครงสร้างเดิม ไม่อ่านเลขจากชื่อสินค้าเพื่อเป็น Qty

เมื่อมี `จำนวนรวม` ให้ใช้เป็น cross-check เท่านั้น:

- ถ้า sum(item.qty) = total qty: ผ่าน
- ถ้าไม่เท่ากัน: mark `qtyWarning = true`
- ห้าม overwrite item qty ด้วยเลขจากชื่อสินค้า

### 8.2 TikTok

ใช้เลขจากคอลัมน์ `Qty` ของแต่ละ row เป็น source of truth และใช้ `Qty Total` เป็น cross-check เท่านั้น

- pack size ที่อยู่ใน Product Name / SKU / Seller SKU เป็น product identity
- `Qty Total` ห้ามใช้แทน Qty ของ row
- ถ้า mismatch ให้ mark `qtyWarning = true`
- 2 SKU คนละสินค้าในออเดอร์เดียวต้องสร้าง 2 `parsedItems` ก่อน matcher

## 9. Result contract

Matcher เปลี่ยนจาก return rule/null เป็น object:

```js
{
  status: 'matched' | 'ambiguous' | 'unmatched',
  rule: matchedRuleOrNull,
  score: number,
  runnerUpScore: number,
  reason: string,
}
```

Order เพิ่ม warning flags:

```js
{
  skuWarning: boolean,
  qtyWarning: boolean,
}
```

UI mapping:

- matched → แสดง Base SKU ตามปกติ
- ambiguous หรือ `skuWarning` → `⚠️ ตรวจสอบ SKU`
- unmatched → `ยังไม่ตั้งชื่อ (เพิ่มกฎ SKU)`
- `qtyWarning` → แสดง `⚠️ ตรวจสอบ Qty`

## 10. Regression tests

เพิ่ม Node built-in tests แบบไม่ต้องติด dependency ใหม่

ต้องมีอย่างน้อย:

1. `Hoya Baby Wipes Value Pack 24ห่อ` ต้องไม่ match rule `Hoya Baby Wipes 24ห่อ`
2. `Hoya Baby Wipes Plus 5ห่อ` ต้องไม่ match ruleธรรมดา
3. `Haku Cooling 6ห่อ` ต้องไม่ match `Haku Cooling 3ห่อ`
4. `Haku Extra Cooling 3ห่อ` ต้องเลือก Extra Cooling เหนือ Cooling
5. pack size 5 + Qty 3 ต้องคำนวณ Base SKU ตาม Qty 3 ไม่ใช่ Qty 5
6. pack size 6 + Qty 1 ต้องคง Qty 1
7. Shopee fixture `(6ห่อ) Haku Cooling` Qty 3 ต้องได้ qty=3
8. TikTok fixture `5แพ็ค HOYA` Qty 3 ต้องได้ qty=3
9. TikTok multi-SKU fixture ต้อง parse เป็น 2 items ไม่ใช่ 1 item
10. ผลรวม Qty ของ 2 items ต้องเท่ากับ `Qty Total: 3`
11. item `Value Pack 10` ต้อง match rule Value Pack และ item `HOYA 5แพ็ค` ต้อง match ruleปกติ แยกกัน
12. TikTok single-SKU Qty 2 regression เดิมต้องยังผ่าน
13. คะแนนสูสีต้องได้ `ambiguous`
14. exact legacy keyword ที่ชัดเจนยังต้อง match เพื่อไม่ให้ behavior เดิมถอยหลัง

## 11. Files

คงโครงสร้างโปรเจกต์เดิมและแก้ให้น้อยที่สุด:

- Modify: `index.html`
- Create: `tests/packmaster-smart-matcher.test.mjs`
- Create: `tests/fixtures/smart-matcher-cases.mjs` เฉพาะข้อความสินค้าที่ sanitize แล้ว ไม่มีชื่อ ที่อยู่ เบอร์โทร tracking หรือ order ID

ไม่แยก React/Next.js และไม่ refactor architecture ใหญ่ในรอบนี้

## 12. Out of scope

- OCR จากภาพ
- AI/LLM matching
- database
- เปลี่ยนหน้าตาใหญ่
- ลบ/แก้ SKU rule เดิมอัตโนมัติ
- commit PDF จริงที่มีข้อมูลลูกค้า

## 13. Acceptance criteria

1. เคสสินค้าคล้ายกันใน fixture จริงไม่จับผิด SKU
2. Qty test จาก fixture จริงผ่านทั้งหมด
3. TikTok 2 SKU คนละสินค้าในออเดอร์เดียวแสดงครบทั้ง 2 รายการ
4. Qty ของแต่ละ TikTok SKU ถูกต้องและ sum เท่ากับ Qty Total เมื่อ PDF ให้ข้อมูลครบ
5. ถ้า parser/matcher ไม่มั่นใจต้องขึ้น warning ไม่ซ่อน SKU เงียบ ๆ
6. เคส ambiguous ไม่เลือก SKU เอง
7. quantity aggregation จาก PR #1 ยังผ่าน regression เดิม
8. TikTok single-SKU เดิมยังผ่าน regression
9. PDF size / print / export behavior ไม่เปลี่ยน
10. ไม่มีข้อมูลส่วนตัวจาก PDF จริงถูกเพิ่มใน repository
11. diff จำกัดเฉพาะ matcher/parser guardrail/test ที่จำเป็น
