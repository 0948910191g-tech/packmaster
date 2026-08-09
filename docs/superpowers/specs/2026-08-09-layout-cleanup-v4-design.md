# PackMaster Layout Cleanup V4 Design

## Goal
จัดระเบียบ Frontend ทุกหน้าให้สะอาด อ่านง่าย และไม่มี UI sticky/fixed ทับเนื้อหา โดยรักษา workflow และ Core logic เดิมทั้งหมด

## Evidence / Current Problem
จาก Production screenshots หลัง Frontend V3 + usability pass + collapsible sidebar พบว่า Active Batch bar และ Review action dock สามารถบัง/ทับ page content ขณะ scroll ได้ และแต่ละหน้ามี spacing/hierarchy ไม่สม่ำเสมอ

## Design Principles
- มี sticky หลักเพียง Global Command Header เท่านั้นบน desktop
- Sidebar ยังคง sticky/collapsible ตาม implementation ปัจจุบัน
- Active Batch context ต้องอยู่ใน normal document flow และไม่ overlay page header/content
- Review action dock ต้องอยู่ใน normal document flow และไม่ overlay Label cards
- ทุกหน้าใช้ page padding, section gap, card gap และ control height จาก token ชุดเดียวกัน
- Page Header, Context, Toolbar, Content และ Actions ต้องแยก visual hierarchy ชัดเจน
- Desktop-first, responsive โดยไม่เกิด horizontal overflow

## Layout Foundation
เพิ่ม CSS tokens กลาง:
- `--pm-header-h: 82px`
- `--pm-header-h-mobile: 68px`
- `--pm-page-pad-x: 24px`
- `--pm-page-pad-y: 20px`
- `--pm-section-gap: 16px`
- `--pm-card-gap: 14px`
- `--pm-control-h: 40px`
- `--pm-content-max: 1240px`
- `--pm-content-wide: 1520px`

`pm-page` ใช้ spacing จาก token และไม่มี layout transform ที่ทำให้ positioning คาดเดายาก

## Global Active Batch Context
- คงข้อมูลเดิม: Batch name, total, ready, exceptions, readiness, back-to-batches, resolve/print action
- เปลี่ยนจาก sticky overlay เป็น static context strip ใน normal flow
- แสดงชิดด้านบนของ main content ไม่มีช่องว่างลอย และไม่บัง Page Header
- Mobile stack ได้ตามพื้นที่

## Batches Page
- Header + primary create action อยู่บรรทัดเดียวเมื่อมีพื้นที่
- KPI row และ batch filters/list ใช้ section gap สม่ำเสมอ
- ไม่มี floating/sticky element เพิ่ม

## Upload Page
- Active Batch context อยู่เหนือ page header
- Upload hero/stepper/log/summary ใช้ container rhythm เดียวกัน
- Primary upload zone ยังเด่นที่สุด

## SKU Library
- Header/action row ไม่ถูก Active Batch bar บัง
- Desktop ใช้ 2-column layout: form/test column 340-380px + flexible library column
- Search/sort/filter chips รวมเป็น toolbar group เดียว
- Tablet/mobile collapse เป็น 1 column

## Review & Print
- Page header + print controls อยู่ใน flow
- Summary cards → safety/exception notice → filter toolbar → exception inbox → preview/list
- Hybrid label grid เดิมยังอยู่
- Review bottom action เปลี่ยนจาก fixed overlay เป็น static action dock หลัง review content (และ top print controls ยังคงอยู่) เพื่อไม่บัง Label cards
- ไม่ต้องมี `pm-review-bottom-space` สำหรับชดเชย fixed barอีก

## Safety Page
- ใช้ page header/section/card spacing เดียวกับหน้าอื่น
- ไม่เพิ่ม sticky element

## Responsive
- <=1023px: page header stack, controls wrap, active batch context stack
- <=900px: mobile sidebar drawer เดิมทำงานต่อ
- <=639px: compact page padding; action groups full-width when needed
- ต้องไม่มี horizontal overflow จาก sidebar/dock/toolbars

## Safety / Hard Restrictions
- ห้ามแก้ Shopee Parser / TikTok Parser
- ห้ามแก้ Matcher / Multi-SKU / Qty / Bundle / Quantity Aggregation
- ห้ามแก้ Print / Save PDF engine หรือขอบเขตการพิมพ์
- ห้ามแก้ `packmaster-batch.js`
- ห้ามเปลี่ยน IndexedDB schema / DB_VERSION
- ห้ามเพิ่ม Database / Backend / Auth / Cloud / Paid service
- Print และ Save PDF ต้องยังใช้ full `MappedOrders` ของ Active Batch

## Verification
- Permanent layout contract test
- Existing full regression suite
- JSX compile
- Frozen batch adapter hash guard
- Desktop Chromium: Batches, Upload, SKU, Review, Safety; measure no context/header/action overlap
- Review long-scroll: no fixed dock covering cards
- Collapsed Sidebar desktop still expands workspace
- Mobile drawer + all pages no horizontal overflow
- Production smoke + GitHub Pages + live Chromium after merge
