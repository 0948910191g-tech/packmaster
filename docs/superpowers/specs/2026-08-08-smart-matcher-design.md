# PackMaster Smart Matcher Design

## 1. Goal

ลด 2 ปัญหาหลักโดยไม่เพิ่มความเสี่ยงจับ SKU ผิด:

1. จับสินค้าเป็น SKU ผิดเมื่อชื่อคล้ายกันมาก
2. อ่าน Qty ผิดเพราะเอาตัวเลขในชื่อสินค้า/ขนาดแพ็กมาปนกับจำนวนที่ลูกค้าสั่ง

หลักความปลอดภัย: **ไม่มั่นใจ = ไม่จับ** และแสดง `⚠️ ตรวจสอบ SKU` แทนการเดา

## 2. Current problem

ระบบปัจจุบัน normalize ข้อความแล้วใช้ exact `includes` ก่อน จากนั้น fallback เป็นการตรวจว่าคำใน keyword ปรากฏครบหรือไม่ โดยไม่ได้แยกน้ำหนักของคำสำคัญ เช่น `Value Pack`, `Plus`, `Cooling`, `Extra Cooling`, pack size หรือ Seller SKU

ผลคือ SKU ที่มีคำร่วมกันมากอาจชนกัน เช่น:

- `HOYA Baby Wipes 5 ห่อ` กับ `HOYA Baby Wipes Value Pack 5 ห่อ`
- `HAKU Cooling 1 ห่อ` กับ `HAKU Cooling 3 ห่อ`
- `HOYA Baby Wipes` กับ `HOYA Baby Wipes Plus`

นอกจากนี้ PDF จริงมีตัวเลขหลายประเภทในแถวเดียว เช่น pack size, จำนวนแผ่น, ความเข้มข้น, variant และ Qty

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

## 4. Design principles

1. **Product identity และ order quantity เป็นคนละข้อมูล**
2. ตัวเลขในชื่อสินค้า เช่น `5ห่อ`, `6ห่อ`, `24ห่อ`, `80แผ่น`, `95%` ห้ามถูกใช้เป็น Qty สั่งซื้อ
3. Qty ต้องมาจากตำแหน่ง Qty/Qty Total ที่ parser ระบุเท่านั้น
4. Matcher ต้องให้ความสำคัญกับ discriminators มากกว่าคำทั่วไป
5. ห้าม fuzzy match แบบเลือกตัวที่ใกล้ที่สุดโดยไม่มี confidence gate
6. ถ้าคะแนนสูสีหรือมี conflict สำคัญ ให้ return ambiguous แทน matched
7. ไม่ใช้ AI API และไม่ใช้ OCR เพิ่มในรอบนี้ เพราะ PDF มี text layer อยู่แล้ว

## 5. Matching pipeline

### 5.1 Normalize

สร้าง normalized text สำหรับการ match โดย:

- lowercase
- collapse whitespace
- ลบ zero-width / NBSP
- normalize Thai combining marks แบบเดิม
- รองรับ Thai private-use marks ที่พบใน PDF จริง
- เก็บตัวเลขไว้ เพราะ pack size เป็น discriminator สำคัญ

### 5.2 Candidate generation

สร้าง candidate จากทุก rule ที่มี token สำคัญตรงกับข้อความอย่างน้อย 1 กลุ่ม โดย exact substring ยังมี priority สูงสุด แต่ไม่จบ match ทันทีหากมี candidate ที่เฉพาะเจาะจงกว่า

### 5.3 Token classes

แบ่ง token เพื่อให้คะแนน:

- `brand/common`: hoya, haku, baby, wipes, ทิชชู่เปียก
- `variant/discriminator`: value, pack, plus, cooling, extra, menthol, lavender, mix, adult, nono
- `pack`: รูปแบบจำนวน + หน่วย เช่น `3ห่อ`, `5ห่อ`, `6ห่อ`, `10ห่อ`, `24ห่อ`, `36ห่อ`, `5แพ็ค`
- `seller`: Seller SKU text ถ้ามี

### 5.4 Score

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

## 6. Confidence gate

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

## 7. Quantity parsing

### 7.1 Shopee

ใช้ Qty ที่ parser แยกจากคอลัมน์/ท้ายรายการตามโครงสร้างเดิม ไม่อ่านเลขจากชื่อสินค้าเพื่อเป็น Qty

เมื่อมี `จำนวนรวม` ให้ใช้เป็น cross-check เท่านั้น:

- ถ้า sum(item.qty) = total qty: ผ่าน
- ถ้าไม่เท่ากัน: mark `qtyWarning = true`
- ห้าม overwrite item qty ด้วยเลขจากชื่อสินค้า

### 7.2 TikTok

ใช้เลขจากคอลัมน์ `Qty` หรือ `Qty Total` เป็นแหล่ง Qty

- pack size ที่อยู่ใน Product Name / SKU / Seller SKU เป็น product identity
- `Qty Total` ใช้เป็น cross-check กับผลรวมของ item qty
- ถ้า mismatch ให้ mark `qtyWarning = true`

## 8. Result contract

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

UI mapping:

- matched → แสดง Base SKU ตามปกติ
- ambiguous → `⚠️ ตรวจสอบ SKU`
- unmatched → `ยังไม่ตั้งชื่อ (เพิ่มกฎ SKU)`

ถ้า `qtyWarning` เป็น true ให้เพิ่ม badge/ข้อความ `⚠️ ตรวจสอบ Qty` ในหน้าตารางพรีวิว และห้ามแก้ Qty เดาเอง

## 9. Regression tests

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
9. คะแนนสูสีต้องได้ `ambiguous`
10. exact legacy keyword ที่ชัดเจนยังต้อง match เพื่อไม่ให้ behavior เดิมถอยหลัง

## 10. Files

คงโครงสร้างโปรเจกต์เดิมและแก้ให้น้อยที่สุด:

- Modify: `index.html`
- Create: `tests/packmaster-smart-matcher.test.mjs`
- Create: `tests/fixtures/smart-matcher-cases.mjs` เฉพาะข้อความสินค้าที่ sanitize แล้ว ไม่มีชื่อ ที่อยู่ เบอร์โทร tracking หรือ order ID

ไม่แยก React/Next.js และไม่ refactor architecture ใหญ่ในรอบนี้

## 11. Out of scope

- OCR จากภาพ
- AI/LLM matching
- database
- เปลี่ยนหน้าตาใหญ่
- ลบ/แก้ SKU rule เดิมอัตโนมัติ
- commit PDF จริงที่มีข้อมูลลูกค้า

## 12. Acceptance criteria

1. เคสสินค้าคล้ายกันใน fixture จริงไม่จับผิด SKU
2. Qty test จาก fixture จริงผ่านทั้งหมด
3. เคส ambiguous ไม่เลือก SKU เอง
4. quantity aggregation จาก PR #1 ยังผ่าน regression เดิม
5. PDF size / print / export behavior ไม่เปลี่ยน
6. ไม่มีข้อมูลส่วนตัวจาก PDF จริงถูกเพิ่มใน repository
7. diff จำกัดเฉพาะ matcher/parser guardrail/test ที่จำเป็น
