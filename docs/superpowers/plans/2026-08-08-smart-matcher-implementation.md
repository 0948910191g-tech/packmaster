# PackMaster Smart Matcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ลดการจับ SKU ผิดและ Qty ผิด พร้อมรองรับ TikTok 1 ออเดอร์หลาย SKU โดยใช้ข้อมูลจาก text layer ของ PDF เท่านั้น

**Architecture:** คง single-file React เดิมใน `index.html` แต่แยก helper เชิงตรรกะให้ทดสอบได้: text normalization, TikTok row parsing, confidence scoring, Qty cross-check และ warning mapping. ใช้ fixture ที่ sanitize จาก PDF จริง ไม่ commit PDF/PII.

**Tech Stack:** React 18 UMD, Babel standalone, pdf.js, Node built-in test runner/assert

## Global Constraints

- ไม่เปลี่ยนขนาด PDF 100mm x 150mm
- ไม่เปลี่ยน thermal rendering/export flow นอกจากข้อมูล warning ที่แสดงใน preview
- ไม่ใช้ OCR, AI API หรือ dependency ใหม่
- ไม่ commit ชื่อ ที่อยู่ เบอร์โทร tracking หรือ order ID จาก PDF จริง
- ไม่ให้ fuzzy matcher เดาสินค้าเมื่อ confidence ต่ำ: ambiguous ต้องแสดง `⚠️ ตรวจสอบ SKU`
- Pack size ในชื่อสินค้าไม่ใช่ Order Qty
- TikTok multi-SKU ต้องแยกแต่ละสินค้าและ Qty รายตัวก่อนเข้า matcher
- Shopee parser เดิมคงโครงหลัก เพิ่มเฉพาะ Qty cross-check/fail-safe ที่จำเป็น

---

### Task 1: Sanitized regression fixtures

**Files:**
- Create: `tests/fixtures/smart-matcher-cases.mjs`
- Create: `tests/packmaster-smart-matcher.test.mjs`

**Interfaces:**
- Consumes: sanitized product-table text from real Shopee/TikTok PDFs
- Produces: deterministic fixtures for matcher/parser/qty regression

- [ ] เพิ่ม fixture TikTok multi-SKU: Value Pack 10 + HOYA 5 pack, Qty รวม 3
- [ ] เพิ่ม fixture TikTok single-SKU pack-size != Qty
- [ ] เพิ่ม fixture Shopee Haku Cooling 6 pack / Qty 3 และ HAKU Extra Cooling 1 pack / Qty 2
- [ ] เพิ่ม rules ที่ intentionally ชนกัน เช่น HOYA Baby Wipes vs Value Pack, Cooling vs Extra Cooling
- [ ] รัน test ก่อน implementation และยืนยันว่า fail ที่ helper/parser ใหม่ยังไม่มี

### Task 2: Smart matcher helpers

**Files:**
- Modify: `index.html`
- Test: `tests/packmaster-smart-matcher.test.mjs`

**Interfaces:**
- Produces: `normalizeMatchText`, `extractPackTokens`, `scoreSkuRule`, `matchSkuRule`
- `matchSkuRule(text, rules)` returns `{ status, rule, score, runnerUpScore, reason }`

- [ ] normalize zero-width/NBSP/Thai private-use marks โดยเก็บตัวเลขไว้
- [ ] ให้ exact keyword, variant/discriminator และ pack token มีน้ำหนักสูงกว่าคำ common
- [ ] ลงโทษ pack/variant conflict อย่างแรง
- [ ] ใช้ confidence gate: best >= 80, gap >= 20, no hard conflict
- [ ] ambiguous/unmatched ห้ามคืน rule ที่จะถูกพิมพ์จริง
- [ ] regression เดิม `Hoya V2 ... 1 ลัง` Qty 2 ต้องยังคง V2 และรวมเฉพาะเลขจำนวนสุดท้าย

### Task 3: TikTok multi-SKU parser

**Files:**
- Modify: `index.html`
- Test: `tests/packmaster-smart-matcher.test.mjs`

**Interfaces:**
- Produces: `parseTikTokItems(tableText)` => `{ items:[{text, qty}], totalQty, qtyWarning }`

- [ ] ดึง `Qty Total` ก่อนตัด footer
- [ ] แยก TikTok row จากท้ายแต่ละ row ที่เป็น Qty โดยห้ามใช้ pack size ใน product name เป็น Qty
- [ ] fixture multi-SKU ต้องได้ 2 items และ qty ราย item ตามจริง
- [ ] ถ้า sum(item.qty) != Qty Total ให้ `qtyWarning=true`
- [ ] single-SKU TikTok เดิมต้องยัง parse ได้
- [ ] หากแยก row ไม่มั่นใจ ห้ามยุบหลายสินค้ากลายเป็น SKU เดียวแบบเงียบ ๆ

### Task 4: Shopee Qty cross-check + UI warnings

**Files:**
- Modify: `index.html`
- Test: `tests/packmaster-smart-matcher.test.mjs`

**Interfaces:**
- Orders gain optional `qtyWarning` and matcher warning state

- [ ] อ่าน `จำนวนรวม` ก่อนตัดออกจาก zone
- [ ] เทียบ sum(item.qty) กับ total เมื่อหา total ได้
- [ ] ไม่ overwrite Qty ราย item ด้วยตัวเลขจากชื่อสินค้า
- [ ] Preview table แสดง `⚠️ ตรวจสอบ Qty` เมื่อ mismatch
- [ ] Matcher ambiguous แสดง `⚠️ ตรวจสอบ SKU`
- [ ] Print/export ต้องพิมพ์ warning แทน SKU ที่เดา ไม่พิมพ์ candidate ที่ไม่มั่นใจ

### Task 5: Verification and deploy

**Files:**
- Verify: `index.html`, tests, fixture only

- [ ] รัน Node regression tests ทั้ง guardrail/smart matcher ถ้ามี
- [ ] ตรวจ diff ว่าไม่มี PDF/PII และไม่มี unrelated refactor
- [ ] เปิด Draft PR แล้วตรวจ mergeable/head SHA
- [ ] Merge ด้วย expected head SHA หลัง test ผ่าน
- [ ] ตรวจ `main` commit หลัง merge
- [ ] ตรวจ GitHub Pages deployment/status ถ้ามี workflow; ถ้าไม่มีให้ยืนยัน main แล้วทดสอบ production URL ด้วย browser/manual smoke test
- [ ] Smoke test production: TikTok single SKU, TikTok multi-SKU, Value Pack vs normal, Cooling vs Extra Cooling, Qty aggregation
