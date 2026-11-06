# PackMaster — Handoff to Codex (2026-10-19)

ผู้รับ: Codex (ตรวจและวางแผนต่อ) | เจ้าของ/ผู้อนุมัติ: เจ้าของโปรเจกต์ (สื่อสารภาษาไทย)
โฟลเดอร์ซอร์ส: `packmaster/` (เป็น git repo ของตัวเอง) | branch ที่ทำงานอยู่: `ux-flow-v5`
เอกสารนี้สรุปทุกอย่างที่รู้ ณ 19 ต.ค. 2026 ประมาณ 14:00 น. **ข้อเท็จจริงด้านล่างตรวจกับไฟล์และ git จริงแล้ว ยกเว้นที่ระบุว่า "ยังไม่ยืนยัน"** อ่านข้อ 6 (สิ่งที่ยังไม่ได้ตรวจ) ก่อนเชื่อผลใด ๆ

## 1. PackMaster คืออะไร
แอปเว็บไฟล์เดียว (`index.html` ~4,100 บรรทัด, React 18 + Babel standalone + Tailwind CDN + pdf.js + html2canvas + jsPDF จาก CDN) ที่อ่านใบปะหน้า PDF ของ Shopee/TikTok Shop จับคู่ SKU เป็นชื่อภายใน ตรวจจำนวน แล้วพิมพ์ใบแพ็คของ
- ไม่มี backend ข้อมูลทั้งหมด (ออเดอร์, Batch, กฎ SKU) อยู่ใน `localStorage` ของเบราว์เซอร์เครื่องที่ใช้ ข้อมูลที่อยู่ลูกค้าไม่ออกจากเครื่อง
- โมดูล logic แยกเป็น `packmaster-*.js` 16 ไฟล์ (matcher, batch, workspace, duplicate, keyword assistant ฯลฯ) มีเทสต์ 52 ไฟล์ใน `tests/*.test.mjs` (รันด้วย `node <ไฟล์>` เดี่ยว ๆ ไม่มี package.json)
- **ขึ้นเว็บจริงผ่าน GitHub Pages อัตโนมัติเมื่อ push เข้า `main`:** `https://0948910191g-tech.github.io/packmaster/` และ `.github/workflows/production-smoke.yml` ตรวจสตริงในหน้าเว็บจริงหลัง push (ดูข้อ 7)
- เจ้าของใช้งานมาหลายเดือนแล้ว ระบบมีปัญหาเล็กน้อยแต่ใช้ได้ เจ้าของไม่อยากแก้ระบบเยอะ

## 2. สถานะตอนนี้ (ตรวจแล้ว)
- `main` = `dd558a9` (ticket 10: surface corrupt local metadata) เท่ากับ `origin/main` **ยังไม่มีอะไร push ขึ้นเว็บจริง**
- branch `ux-flow-v5` (local เท่านั้น ยังไม่มี `origin/ux-flow-v5` ยังไม่มี PR) ไล่ commit จากเก่าไปใหม่:
  1. `e661848` fix: keyword safety, tiktok footer, continuation (งานค้างเดิมที่ยังไม่เคย commit ถูก commit แยกตามกติกา)
  2. `cf19152` docs: add ux flow v5 approved implementation plan
  3. `52e01e9` UX-01 รวมเมนูเป็น sidebar และเก็บ header
  4. `7a93e51` UX-02 stepper 4 ขั้น + ปุ่ม "ขั้นต่อไป"
  5. `dc5d77e` UX-03 แทน `window.confirm` ด้วย `PMConfirmDialog`/`requestConfirm`
  6. `f2f65a6` UX-04 type scale และขนาด touch target
  7. `663d9c2` UX-05 focus / aria / reduced motion
- Working tree สะอาด (`git status` ว่าง)
- เทสต์: **52/52 ผ่าน** บน `ux-flow-v5` (รันทีละไฟล์ด้วย node)
- ตัวชี้วัดบน `index.html` เทียบก่อนเริ่ม: `window.confirm` 16 → **0**, `:focus-visible` 0 → 18, `aria-live` 0 → 4, `prefers-reduced-motion` 0 → 1, `transition-all` 2 → 0, `text-[8–11px]` ~52 → **7** (เหลือ badge/label 11px ที่ยังไม่ได้ตัดสินใจ), ข้อความ "Frontend V3" เหลือใน comment 2 จุดและป้ายเวอร์ชันบนหน้า Safety 1 จุด (ป้ายในหัวแอปถูกเอาออกแล้ว — ยังไม่ยืนยันด้วยการเปิดดู)
- diff `main..ux-flow-v5`: 12 ไฟล์ +995/−160; `index.html` +631/−147 (ไม่มีเสียงรบกวนจาก line ending: ไฟล์ `index.html` ยังเป็น CRLF 4,135 บรรทัด ห้ามแปลงเป็น LF)
- ไฟล์ logic `packmaster-*.js` ที่เปลี่ยนมีแค่ 2 ไฟล์ และทั้งสองมาจากงานค้างเดิมใน commit 1 (`packmaster-duplicate.js` 1 บรรทัด, `packmaster-keyword-assistant.js` +51) UX-01–05 ไม่แตะ logic
- Gemini หยุดหลัง UX-05 ตามที่สั่ง **UX-06 (คำศัพท์) และ UX-07 (ดีไซน์ใหม่ทั้งชุด) ยังไม่ได้ทำ**

## 3. ประวัติงาน (ใครทำอะไร)
- ก่อนหน้า: Tickets 01–10 (fail-closed review, print scope, duplicate, SKU integrity, restore validation, batch transition, reprint snapshot, Qty override, metadata health) commit ลง `main` โดยเจ้าของ/ทีม
- 19 ต.ค. Claude: ตรวจสถานะ Pack master, ตรวจงานค้างที่ยังไม่ commit (ซึ่งเจ้าของระบุว่าเป็นงานของ Gemini), ทำ UX audit จากโค้ด, เขียนแผน `docs/superpowers/plans/2026-10-19-ux-flow-v5.md`, ทำพรีวิวดีไซน์ UI ใหม่ 4 หน้า (ข้อ 9), เขียนพร้อมท์ส่งให้ Gemini
- 19 ต.ค. Gemini: ทำตามพร้อมท์ — commit งานค้างแยก แตก branch ทำ UX-01–05 และหยุด (หลักฐาน: git log ข้างบน)
- **ยังไม่มีรีวิวอิสระจริงของ UX-01–05** ตัวเลขในข้อ 2 มาจาก grep/เทสต์ ไม่ใช่การอ่านโค้ดทีละบรรทัด และไม่มีใครเปิดแอปรันดูผลที่เรนเดอร์

## 4. การตัดสินใจและข้อจำกัดจากเจ้าของ (ห้ามย้อน)
1. รอบนี้แก้ **เฉพาะ UX/UI flow และหน้าตา** ไม่แก้ระบบ/logic เยอะ
2. อยากใช้งานผ่านเว็บแทนรันในเครื่อง — ตอนนี้ก็อยู่บน GitHub Pages แล้ว สิ่งที่ยังผูกกับเครื่องคือข้อมูลใน `localStorage` Claude แนะนำ **อย่าทำ backend/login/sync หลายเครื่องรอบนี้** (งานใหญ่ ขัดกับ "ไม่แก้เยอะ" และมีเรื่องข้อมูลลูกค้า) เจ้าของยังไม่ได้ตอบว่าใช้กี่คน กี่เครื่อง (ถ้าคนเดียวเครื่องเดียว backend ไม่จำเป็น)
3. Gemini เป็นผู้ลงมือ, Codex เป็นผู้ตรวจและวางแผนต่อ
4. เจ้าของให้ Gemini ทำแค่ถึง UX-05 แล้วหยุดรออนุมัติ
5. คำศัพท์ UI (UX-06) **ต้องให้เจ้าของเซ็นตารางก่อนแก้ข้อความ** ตารางที่ Claude เสนอ: Batch→ชุดงาน, Exception→รายการที่ต้องแก้, Review→ตรวจรายการ, Reprint→พิมพ์ซ้ำ, Local Safety→ความปลอดภัยข้อมูล (ยังไม่ได้ตอบ)
6. ใช้ Noto Sans Thai ตามที่เจ้าของชอบ ไม่ใช้ฟอนต์น้ำหนัก 800–900

## 5. ผลตรวจ UX ก่อนแก้ (Claude, ตรวจจากโค้ด ไม่ได้รันแอป)
เลขบรรทัดอ้างอิง `index.html` เวอร์ชัน `main` ก่อน UX-01 (ตอนนี้เลื่อนแล้ว)
| ปัญหา | หลักฐานเดิม | สถานะบน branch |
|---|---|---|
| เมนูซ้ำ header + sidebar | 3321–3326 / 3344–3354 | แก้แล้ว (UX-01) ตรวจจากเทสต์เท่านั้น |
| เมนู "พิมพ์" พาไปหน้า Review | 3325 | เปลี่ยนเป็น "ตรวจและพิมพ์" (เทสต์ยืนยันข้อความ) |
| ไม่มีตัวบอกขั้นตอน/ขั้นถัดไป | 3494 | เพิ่ม `data-pm-stepper` (UX-02) |
| `window.confirm` 16 จุด | 1448…3132 | แทนด้วย `requestConfirm` ครบ (UX-03) — **ดูข้อ 7.1** |
| ตัวอักษร 8–11px ~52 จุด | หลายจุด | เหลือ 7 จุด (UX-04) |
| ไม่มี aria-live / focus-visible / reduced-motion | ทั้งไฟล์ | เพิ่มแล้ว (UX-05) ยังไม่ได้ทดสอบด้วยคีย์บอร์ดจริง |
| ภาษาไทยปนอังกฤษ | ทั้งแอป | **ยังไม่แก้** (รอ UX-06) |
| หน้า Review แน่น | 3599–3668 | **ยังไม่แก้** (รอ UX-07) |
| พึ่ง CDN (Tailwind, Babel, React, pdf.js ฯลฯ) | `<head>` | **นอกขอบเขต** ถ้าเน็ตหลุดหน้างาน แอปเปิดไม่ขึ้น |

## 6. สิ่งที่ยังไม่ได้ตรวจ (สำคัญ)
- **ยังไม่มีใครเปิดแอปรันจริงและดูผล** ไม่มี screenshot ที่ 1366×768 / 1920×1080 / 390×844 ที่ Claude ตรวจเอง (Claude ไม่สามารถรัน browser บนไฟล์ในเครื่องเจ้าของได้ในรอบนี้) ไม่ทราบว่า Gemini ถ่ายไว้หรือไม่
- ยังไม่ได้ลองกับ **PDF Shopee/TikTok จริง** (หลายหน้า, continuation, ใบที่มีคำว่า `Seller SKU`/`Qty Total`)
- ยังไม่ได้เดิน flow ด้วยคีย์บอร์ดอย่างเดียว ยังไม่ได้ทดสอบ focus trap / Esc / คืนโฟกัสของ `PMConfirmDialog`
- ยังไม่ทราบว่าเว็บ production ขึ้นปกติหรือไม่ (เครื่อง Claude เข้า GitHub Pages ไม่ได้)
- ยังไม่ได้เทียบ UI ที่ Gemini ทำกับพรีวิวดีไซน์ (ข้อ 9)
- ยังไม่ได้ตรวจว่า CI workflow ครอบคลุมครบ 52 ไฟล์ (มี 9 ขั้นตอนใหม่ที่ Gemini เพิ่มใน commit 1)
- Claude **ไม่ทราบ** ว่า `docs/PILOT_CHECKLIST.md` ผ่านกี่ข้อ (ไม่มีช่องติ๊ก)

## 7. จุดที่ Codex ควรตรวจเป็นพิเศษ
1. **`requestConfirm` เป็น async แทน `window.confirm` แบบ sync (17 จุดเรียก)** ตรวจว่า handler ที่เคยหยุดรอแล้วทำต่อ (อัปโหลด/นำเข้าซ้ำ, ล้าง/ลบ Batch, พิมพ์/Save PDF ที่ยังมี Exception, restore, ลบกฎ SKU) ยังไม่มี race เช่น กดซ้ำระหว่างรอ, state เปลี่ยนระหว่างรอ, dialog ซ้อนกัน, ปุ่ม Esc/คลิกพื้นหลังต้องเท่ากับยกเลิก, ปุ่มโฟกัสแรกต้องเป็นปุ่มปลอดภัย, ข้อความเตือนเดิม (ย้อนกลับไม่ได้ ฯลฯ) ครบ
2. **เทสต์ที่ถูกแก้ 3 ไฟล์** (`packmaster-navigation-usability`, `packmaster-pilot-safety-ui`, `packmaster-print-override-ui`) เปลี่ยนจากตรวจ `window.confirm(` เป็น `requestConfirm(` และ navigation test **ลบ assertion เดิมที่ว่า Upload/Safety "ต้องไม่เป็น primary nav เท่ากัน"** แล้วกลับเป็น "อัปโหลด PDF ต้องอยู่ใน primary navigation" เป็นการกลับนโยบายเดิม ต้องให้เจ้าของยืนยันว่าตั้งใจ
3. **การ detect TikTok เพิ่มจาก `Seller SKU` / `Qty Total`** (commit 1, `index.html` ใกล้ `platform = ... 'TIKTOK'`): ถ้าใบ Shopee บางแบบมีคำนี้จะถูกอ่านเป็น TikTok ผิด ต้องทดสอบกับ PDF จริง
4. `findContinuationTargetOrder` ผูกหน้าต่อเนื่องของ TikTok กับออเดอร์หลักล่าสุดในไฟล์เดียวกัน ตรวจกรณีไฟล์เดียวมีหลายออเดอร์ต่อกัน
5. `.github/workflows/apply-smart-matcher.yml` เพิ่ม 9 ขั้นตอน เช็กว่าไฟล์เทสต์ที่อ้างมีจริงทุกไฟล์
6. `production-smoke.yml` ตรวจสตริงเหล่านี้ใน `index.html` (ตอนนี้ครบทั้งหมดบน branch ตรวจด้วย grep): `PackMaster Pilot`, `ใช้กับ Order นี้`, `พิมพ์เฉพาะรายการพร้อม`, `data-pm-view="review"`, `data-pm-review-layout="hybrid-grid"`, `data-pm-batch-source-files`, `data-pm-review-original-pdf`, `data-pm-review-confirm-sku`, `data-pm-review-confirm-qty`, `data-pm-review-qty-override`, `data-pm-keyword-suggestion` ถ้า UX-06/07 เปลี่ยนข้อความ ต้องแก้ workflow พร้อมกัน
7. `localStorage` เป็นที่เก็บข้อมูลเดียว: เคลียร์เบราว์เซอร์/เปลี่ยนเครื่อง = ข้อมูลหาย ต้องพึ่ง backup workspace ด้วยมือ ก่อน merge ให้เจ้าของ export backup จากหน้า "สำรองข้อมูล/ความปลอดภัย"

## 8. สิ่งที่ Codex ต้องทำต่อ (เรียงลำดับแนะนำ)
1. **รีวิวอิสระจริง** `git diff main..ux-flow-v5` (Standards + Spec ตามแผน `docs/superpowers/plans/2026-10-19-ux-flow-v5.md` + ข้อ 7) โดยเฉพาะ commit `dc5d77e` (UX-03)
2. **เปิดแอปรันจริงและถ่าย screenshot ทุกหน้า** (ชุดงาน, อัปโหลด, ตรวจ, SKU, ความปลอดภัยข้อมูล) 3 ขนาดหน้าจอ เดินด้วย `docs/PILOT_SAMPLE_DATA.json` และเดินด้วยคีย์บอร์ดอย่างเดียว (ไฟล์เปิดจากเครื่องได้เลย แต่ต้องมีเน็ตเพราะโหลด CDN)
3. **ทดสอบกับ PDF จริง** Shopee + TikTok หลายหน้า (ดูข้อ 7.3–7.4) เจ้าของต้องให้ไฟล์ตัวอย่าง (ห้ามเอาข้อมูลลูกค้าเข้า git)
4. เทียบ UI กับพรีวิวดีไซน์ (ข้อ 9) แล้วเขียนรายการช่องว่างที่เหลือเป็นแผน UX-06/UX-07
5. ขอให้เจ้าของเซ็นตารางคำศัพท์ (ข้อ 4.5) ก่อนแก้ข้อความ
6. UX-07 ดีไซน์ใหม่ (ข้อ 9) — ทำหลังเจ้าของอนุมัติ UX-01–05 เท่านั้น
7. ตัดสินใจเรื่องปล่อย: เปิด PR `ux-flow-v5` → `main` (ห้าม merge เอง) ถ้าอยากทดสอบก่อน ใช้ preview/สำเนา GitHub Pages ของ branch ไม่ใช่ `main`
8. เมื่อผ่านรีวิวแล้ว: อัปเดตแผน/สถานะ, บันทึก Notion ตามเกณฑ์ DONE ของ Brand Room (implementation ตรงสเปก, test, code review, debug, หลักฐาน, บันทึก Notion + อ่านกลับ)
9. งานภายหลัง (ยังไม่ได้อนุมัติ ห้ามเริ่ม): bundle library ออกจาก CDN, `.gitattributes` ให้ line ending คงที่, ประเมินว่าต้องใช้หลายเครื่องจริงไหมก่อนคิด backend

## 9. ทิศทางดีไซน์ UI ใหม่ (เป้าหมายของ UX-07)
หลักคิด Brand Room: "ชนะด้วยความง่าย" อ่านเร็ว ปุ่มหลักชัด เหมาะหน้างานแพ็คของ
- ฟอนต์ Noto Sans Thai น้ำหนัก 400/500/600/700
- สี: พื้นหลังแอป `#eef3f9`, sidebar `#071f3d`, ปุ่มหลัก/ขั้นปัจจุบัน `#0b63ce`, ตัวอักษร `#0f2744`, ตัวอักษรรอง `#51627a`, เส้นขอบ `#d5dfeb`, โฟกัส `#f5b301`
- สถานะ (ต้องมีข้อความ ไม่ใช้สีอย่างเดียว): พร้อมพิมพ์ bg `#dcfce7` text `#14532d` · ต้องตรวจ bg `#fef3c7` text `#7a3e00` · จำนวนไม่ตรง bg `#fee2e2` text `#7f1d1d` · รออัปโหลด bg `#e2e8f0` text `#334155` · พิมพ์แล้ว bg `#dbeafe` text `#1e3a8a`
- ข้อความใช้งาน ≥14px (ขั้นต่ำสุด 12px) ปุ่ม ≥44px ปุ่มหลัก 48–52px การ์ด radius 14–16px
- โครงหน้า: sidebar 248px แบ่ง "งานหลัก" (ชุดงาน, อัปโหลด PDF, ตรวจและพิมพ์) / "เครื่องมือ" (จับคู่ SKU, สำรองและความปลอดภัยข้อมูล) · stepper 4 ขั้น (เลือกชุดงาน → อัปโหลด PDF → ตรวจรายการ → พิมพ์) · ปุ่มหลัก "ขั้นต่อไป" ปุ่มเดียวต่อหน้า
- หน้าตรวจรายการ: ถ้ามีรายการต้องตรวจ แสดงเฉพาะรายการนั้นก่อน (แท็บ ต้องตรวจ / พร้อมพิมพ์ / ทั้งหมด) แถบพิมพ์ติดล่างบอกเหตุผลเมื่อพิมพ์ทั้งชุดยังไม่ได้ (ต้องคง logic fail-closed เดิม)
- dialog: `role="alertdialog"` ปุ่มบอกการกระทำจริง ปุ่มปลอดภัยอยู่ซ้ายและโฟกัสก่อน ปุ่มลบแดงบอกจำนวน
- พรีวิวดีไซน์ 4 หน้า (ชุดงาน, อัปโหลด, ตรวจรายการ, dialog) อยู่ใน `docs/design-preview/*.dc.html` (ไฟล์ HTML ของ canvas ใช้อ้างอิงโครงสร้างและสัดส่วน อาจแสดงผลไม่ครบเมื่อเปิดตรง ๆ เพราะต้องใช้ runtime ของ canvas) และเป็น canvas ชื่อ "PackMaster UI ใหม่ — พรีวิวดีไซน์" ในบัญชี Claude ของเจ้าของ **ข้อมูลในพรีวิวเป็นตัวอย่างที่แต่งขึ้น ไม่ใช่ข้อมูลจริง**

## 10. Skills ที่เกี่ยวข้อง
- จากหน้า Notion "Agent Skills สำหรับ UX/UI" (11 ส.ค. 2026): pipeline แนะนำ Explore → Art Direction → DESIGN.md → Build → Browser QA → Polish และเตือนว่า skill ภายนอกมีความเสี่ยง ต้องอ่าน SKILL.md ก่อนติดตั้ง
- `web-design-guidelines` (Vercel) และ `ux-flow-audit` (Claude เขียนสรุปเอง) เสนอให้เจ้าของบันทึกเป็น skill ใน Claude แล้ว (ยังไม่ทราบว่ากดบันทึกหรือไม่) ใช้ตรวจ `index.html` ได้
- `Impeccable` ติดตั้งในเครื่องเจ้าของแล้ว (skill ส่วนบุคคลใน VS Code) Claude ยังไม่ได้เรียกใช้จริง

## 11. กฎตายตัว
- ห้าม push / merge เข้า `main` / deploy / publish / เปลี่ยน production โดยไม่ได้รับอนุญาต (**push เข้า `main` = ขึ้นเว็บจริงทันที**)
- ห้ามแก้ `packmaster-*.js` ถ้าเจ้าของไม่อนุญาต; ห้ามเปลี่ยน line ending ของไฟล์ (index.html เป็น CRLF)
- เก็บ `data-pm-*` และ id เดิมทั้งหมด ถ้าต้องเปลี่ยนให้แก้เทสต์/workflow ใน commit เดียวกันและบอกเหตุผล
- ห้ามเพิ่ม backend, analytics, service ภายนอก; ห้ามเปลี่ยน schema `localStorage`
- ห้ามใส่ secret/token ในโค้ด; ข้อมูลดิบลูกค้า/ใบปะหน้าจริงห้ามเข้า git
- ห้ามสร้างตัวเลข/คำโฆษณาที่ไม่มีจริงใน UI; ห้ามตัดคำเตือนความปลอดภัย
- รันเทสต์ทั้ง 52 ไฟล์ทุกครั้งก่อนส่งงาน: `for f in tests/*.test.mjs; do node "$f" || echo FAIL $f; done`
- ถ้าไม่แน่ใจให้หยุดและถามเจ้าของ ห้ามเดา; ตอบสั้น ตรงประเด็น ไม่ชมเกินจริง ห้ามเห็นด้วยทุกเรื่อง ถ้าเห็นว่าไม่ดีให้บอกพร้อมเสนอทางเลือก

## 12. เอกสารและไฟล์ที่ควรอ่านต่อ
- `docs/superpowers/plans/2026-10-19-ux-flow-v5.md` — แผน UX-01…07, กติกา, QA gate, rollback
- `docs/handoff/CODEX_HANDOFF_PACKMASTER_2026-10-19.md` — ไฟล์นี้
- `docs/design-preview/` — พรีวิวดีไซน์ 4 หน้า
- `docs/PILOT_CHECKLIST.md`, `docs/PRIVACY_LOCAL_DATA.md`, `docs/RECOVERY_GUIDE.md`, `docs/PILOT_SAMPLE_DATA.json`
- `docs/superpowers/specs|plans/` — spec/plan ของ Ticket เดิม (smart matcher, review confirmation UX v2, ฯลฯ)
- `../CLAUDE.md`, `../README.md` — กติกา workspace "เขียนโค้ด"
