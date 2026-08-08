# PackMaster Collapsible Sidebar Design

Date: 2026-08-09
Status: Approved direction, pre-implementation
Base: main @ 979b867899acb90da96ab1b4fbb2090c0b65f56f

## Goal
เพิ่มพื้นที่ทำงานแนวนอนให้ PackMaster โดยเฉพาะหน้า Review & Print โดยทำ Sidebar แบบย่อ/ขยายได้ แต่ยังคง navigation ที่ชัดเจน คาดเดาได้ และเหมาะกับงานคลัง

Feature นี้ต้องช่วยให้พนักงานเห็น Label/Order ได้กว้างขึ้นโดยไม่เพิ่มความเสี่ยงต่อ Packing Core

## Current Context
- Frontend V3 ใช้ Sidebar คงที่ประมาณ 205px
- Primary navigation ปัจจุบันเหลือ 3 workspace หลัก: งานแพ็ก / คลังคำศัพท์ / รีวิว & พิมพ์
- Upload และ Local Safety เป็น secondary tools
- หน้า Review ต้องใช้พื้นที่แนวนอนมากเพื่อแสดง Hybrid Label cards
- Product เป็น Local-first และยังไม่มี Login/Auth/Cloud preference sync

## Chosen Interaction
### Desktop
- Expanded width: คงรูปแบบปัจจุบันประมาณ 205px
- Collapsed width: 68px
- ผู้ใช้กดปุ่ม toggle เองเท่านั้น
- ไม่ auto-expand เมื่อ hover
- ไม่ auto-collapse เมื่อเข้า Review
- Collapsed state แสดง icon เท่านั้น
- ทุก nav item ต้องมี tooltip/title ที่อ่านชื่อเมนูได้เมื่อ collapsed
- Active state ต้องยังชัดทั้ง expanded/collapsed
- Toggle ต้องมี aria-label ที่สื่อความหมาย เช่น "ย่อเมนูด้านข้าง" / "ขยายเมนูด้านข้าง"

### Persistence
- เก็บ preference ด้วย localStorage key แยกเฉพาะ UI preference เช่น `packmasterSidebarCollapsedV1`
- ค่าเป็น presentation preference เท่านั้น
- ถ้า localStorage อ่านไม่ได้ ให้ fallback เป็น Expanded และแอปต้องยังทำงานได้
- ห้ามใช้ IndexedDB / batch metadata / workspace backup เป็น source of truth ของ preference นี้

### Mobile / Narrow Screens
- ไม่ใช้ mini-sidebar 68px
- Sidebar เปลี่ยนเป็น off-canvas drawer
- มีปุ่ม menu ใน header เพื่อเปิด drawer
- drawer มี backdrop
- กด backdrop, ปุ่มปิด, หรือเลือก navigation item แล้ว drawer ต้องปิด
- body/content ต้องไม่ถูกบีบให้เหลือพื้นที่แคบเหมือน desktop collapsed mode
- desktop collapse preference ต้องไม่ทำให้ mobile drawer เริ่มค้างเปิด

## Layout Behavior
- `.pm-app-frame` และ `.pm-main` ต้อง reflow อย่างนุ่มนวลเมื่อ desktop sidebar เปลี่ยน width
- หลีกเลี่ยง layout jump ที่กระทบ Review fixed action bar
- Review Hybrid Grid ต้องได้พื้นที่แนวนอนคืนจริงเมื่อ collapsed
- ห้ามเปลี่ยน LabelCard sizing/Print styling เพื่อแลกกับ feature นี้

## Visual Direction
- ใช้ Design Language Frontend V3 เดิม
- Navy sidebar / blue active state / white tooltip
- Toggle เป็น icon buttonขนาดเล็ก ไม่เด่นกว่า workflow action
- Collapsed sidebar ต้องไม่ดูเหมือน navigation หายไป
- Local Workspace status ด้านล่างใน collapsed mode ให้เหลือ indicator/icon + tooltip แทนข้อความยาว

## Navigation Contract
- Primary nav ยังคง 3 workspace หลักเดิม
- Secondary Upload/Safety ยังเข้าถึงได้จริง
- Collapse/Drawer เป็น presentation layer เท่านั้น
- `activeView` และ handler เดิมต้อง reuse
- ห้ามสร้าง navigation state ชุดใหม่ซ้อนกับ `activeView`

## Data / State
State ใหม่ที่อนุญาต:
- `sidebarCollapsed` — desktop presentation preference
- `mobileSidebarOpen` — ephemeral mobile drawer state

Derived behavior:
- desktop: `sidebarCollapsed` คุม CSS class/data attribute
- mobile: viewport CSS + `mobileSidebarOpen` คุม drawer visibility

ห้าม persist `mobileSidebarOpen`

## Accessibility
- Toggle และ mobile menu button ต้องเป็น `<button>`
- มี `aria-expanded` / `aria-controls` ตามความเหมาะสม
- Tooltip ต้องไม่เป็นวิธีเดียวที่ screen reader เข้าถึงชื่อเมนู; nav button ยังต้องมี accessible name
- Escape ปิด mobile drawer ถ้าทำได้โดยไม่เพิ่ม dependency
- focus state ต้องเห็นชัด

## Error Handling
- localStorage get/set ต้องไม่ทำให้ render crash
- ถ้า preference value เสีย/ไม่รู้จัก ให้ fallback Expanded
- resize desktop ↔ mobile ต้องไม่ทำให้ drawer/collapsed state ชนกันจน content ใช้ไม่ได้

## Hard Restrictions
ห้ามแก้:
- Shopee Parser
- TikTok Parser
- Multi-SKU
- Qty Parsing
- SKU Matcher
- Bundle Matching
- Quantity Aggregation
- Print engine
- Save PDF engine
- `packmaster-batch.js`
- IndexedDB schema / DB_VERSION
- Database / Backend / Auth / Cloud
- Paid service / telemetry

ห้ามเปลี่ยน Print/Save PDF scope; ต้องยังใช้ Active Batch ทั้งหมดตาม safety contract เดิม

## Implementation Scope
คาดว่าแก้หลัก ๆ:
- `index.html` — CSS + React UI state/markup สำหรับ sidebar
- permanent frontend regression test สำหรับ collapse/persistence/mobile drawer
- CI test wiring เฉพาะเมื่อจำเป็น

ไม่ควรมี runtime module อื่นใน diff

## Test Cases
1. Desktop เปิดครั้งแรก = Expanded
2. กด Collapse → sidebar เหลือประมาณ 68px
3. Main content ได้พื้นที่เพิ่มจริง
4. กด Expand → กลับประมาณ 205px
5. Refresh แล้วจำ collapsed preference
6. Nav active state ยังถูกต้องตอน collapsed
7. ทุก nav item มี accessible name และ tooltip/title
8. Primary nav 3 เมนูเดิมยังใช้งานได้
9. Upload/Safety secondary tools ยังใช้งานได้
10. Mobile viewport ใช้ drawer ไม่ใช้ mini sidebar
11. เปิด/ปิด mobile drawer ได้
12. เลือกเมนูบน mobile แล้ว drawer ปิด
13. Backdrop ปิด drawerได้
14. Desktop preference ไม่เปิด mobile drawerเอง
15. Resize ไม่ทำให้ main content หายหรือ overflow ผิดปกติ
16. Review fixed action bar ยัง fixed จริง
17. Review hybrid cards ยังแสดงตามเดิม
18. Print/Save PDF full-Batch invariant ยังผ่าน
19. `packmaster-batch.js` frozen hash ไม่เปลี่ยน
20. Regression suite เดิมทั้งหมดผ่าน
21. Chromium ไม่มี pageerror / relevant console error

## Rollout
1. Feature branch จาก latest main
2. RED UI contract test
3. Minimal UI implementation
4. Full regression + JSX compile + frozen core guards
5. Chromium desktop + mobile smoke
6. PR review / merge-result CI
7. Squash merge
8. Main regression + Production smoke + Pages deploy
9. Production Chromium desktop/mobile verification

## Definition of Done
- Desktop Sidebar กดย่อ/ขยายได้และจำสถานะ
- Collapsed mode เพิ่มพื้นที่ Review จริง
- Mobile ใช้ drawer ที่เปิด/ปิดได้ชัดเจน
- Navigation เดิมยังทำงานครบ
- ไม่มี auto-hover behavior
- ไม่มี Core/Storage schema change
- Print/Save PDF safety invariant ไม่เปลี่ยน
- Regression + Chromium + Production verification ผ่านทั้งหมด
