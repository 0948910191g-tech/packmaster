# PackMaster Frontend V3 — Operational UI Design

**Date:** 2026-08-08  
**Status:** Approved visual direction from the user-provided PackMaster Design Concept  
**Target:** Existing static React/Babel/Tailwind application on GitHub Pages

## 1. Goal

Bring the production frontend up to the approved PackMaster design direction while preserving the stable packing engine.

The UI must feel like an operational warehouse product, not a prototype. Every visible action must be backed by real state/handlers or intentionally disabled with an explicit reason. No decorative fake controls.

Primary outcomes:
- make the current workflow immediately understandable;
- reduce time spent finding the next action;
- prioritize exceptions instead of forcing users to inspect every order;
- surface local safety features without adding cloud/backend dependencies;
- preserve all parser/matcher/qty/print behavior.

## 2. Hard Restrictions

Do not change:
- Shopee parser;
- TikTok parser;
- matcher scoring/business rules;
- quantity parsing or aggregation;
- bundle aggregation;
- thermal label rendering;
- Print/Save PDF engine;
- `packmaster-batch.js` frozen Phase 2 adapter;
- IndexedDB DB version/object-store schema;
- database/backend/auth architecture.

Do not add:
- Supabase/Firebase/cloud database;
- login/auth;
- paid services;
- analytics SaaS;
- framework rewrite;
- fake admin/account behavior.

## 3. Visual Direction

Reference: user-provided PackMaster Design Concept image + Handoff UI/UX direction.

Keywords:
- clean;
- operational;
- warehouse-ready;
- modern SaaS;
- navy / white / soft gray;
- strong information hierarchy;
- compact but readable;
- clear status colors;
- restrained rounded cards;
- large click targets.

Status language:
- green = Ready / safe;
- amber = needs human review;
- red = blocking/error;
- blue = primary/information;
- gray = neutral/unmapped/archive.

## 4. App Shell

### Header
Persistent navy command header with:
- PackMaster identity;
- short product description;
- primary shortcuts that navigate to real views/actions:
  - Read PDF → active Batch upload view;
  - SKU Library → SKU page;
  - Batch → Batch page;
  - Review Exceptions → Review page with exception filter;
  - Print → Review page / print action only when print safety allows;
  - Local Safety → Workspace Safety page.

No shortcut directly mutates data without the existing safety checks.

### Sidebar
Desktop sidebar with:
1. งานแพ็ก
2. อัปโหลด
3. คลังคำศัพท์
4. รีวิว & พิมพ์
5. สำรองข้อมูล

If no active Batch exists, opening Upload should guide the user to create/select a Batch instead of creating hidden state.

No fake Admin profile. Footer shows Local Workspace / Local-first status only.

### Responsive behavior
- desktop: persistent sidebar;
- medium/small screens: compact top navigation / horizontally scrollable actions;
- print DOM remains isolated from app-shell CSS.

## 5. Page 1 — งานแพ็ก / Batch

### Header
- title + helper copy;
- `+ สร้าง Batch ใหม่` real action.

### KPI strip
Derived from real local batches:
- Active/Recent Batch count;
- Orders;
- Ready;
- Needs Review.

### Batch list
Each Batch card contains:
- name;
- operational status;
- created/updated time;
- total orders;
- ready count;
- review count;
- Shopee/TikTok counts when derivable from stored orders;
- progress bar based on ready / total;
- Open;
- Reprint/Review when applicable;
- Archive/Restore;
- selected archive delete controls only in archive mode.

Filters:
- recent / archived;
- no fake server history.

### Safety message
Explain that each Batch is isolated locally and creating a new Batch does not erase previous work.

## 6. Page 2 — Upload & Processing

This is a real view of the active Batch, not a second storage model.

### Workflow stepper
1. Select Batch
2. Upload PDF
3. Read PDF
4. Match SKU
5. Review/Print

Stepper state is derived from:
- active Batch presence;
- upload/loading state;
- active order count;
- unresolved exception count;
- printed/completed state.

### Upload zone
Reuse the existing file input/drag-and-drop handler.
- Shopee/TikTok PDF only;
- loading progress visible;
- duplicate detection remains active;
- existing page-count/safety limits remain active.

### Upload/source activity
Show real current-session / stored fingerprint metadata where available:
- file name;
- duplicate status;
- processed state/time when available.

Do not invent file processing states that the app does not know.

### Processing summary
For active Batch:
- pages/orders processed where real data exists;
- total orders;
- ready;
- exceptions.

### Problem summary
Derived from real exceptions:
- unmapped;
- review SKU;
- review Qty;
- duplicate warning if present.

Clicking an issue navigates to Review with the corresponding filter.

## 7. Page 3 — คลังคำศัพท์

Two-column operational layout.

### Left — Add/Edit rule
Reuse existing SKU rule state/handlers:
- Keyword;
- Internal Short Name;
- Category if already supported by current rule behavior;
- Alias/additional keyword input only if backed by existing rule shape;
- Optional note only if current data shape already supports it; otherwise omit.
- Save / Cancel.

No silent SKU rule shape migration.

### Right — Library
- count summary;
- Import;
- Export;
- Search;
- category filters;
- sort control if safely derived client-side;
- Edit;
- Delete;
- pagination/client-side page size for usability.

All search/filter/sort/pagination are presentation-only and cannot mutate SKU rules.

## 8. Page 4 — รีวิว & พิมพ์

Highest-priority page.

### Summary cards
Exclusive/derived counts from existing exception logic:
- All;
- Ready;
- Review SKU;
- Review Qty;
- Unmapped.

Clicking a card applies that filter.

### Controls
- search Order/SKU/Internal Name;
- platform filter;
- status filter;
- grid/list toggle;
- clear filter;
- Print;
- Save PDF.

Print/Save PDF must continue using the complete active Batch, never just the visible page/filter subset, and remain blocked by the existing Pilot Print Safety when unresolved exceptions exist.

### Grid view
Operational order cards with:
- platform;
- order reference;
- status;
- label preview;
- mapped internal SKU;
- quantity/warning text;
- direct handoff to SKU Library for unmapped/SKU-review items where the existing safe handler supports it.

### Compact list view
Dense audit view for high-volume batches.

### Pagination
Client-side pagination affects review rendering only. It must never mutate source data or change Print/Save PDF scope.

## 9. Page 5 — สำรองข้อมูล / Local Safety

Use existing real modules:
- Workspace Backup;
- Workspace Restore preview + validation;
- Storage Health;
- archived reprint-image cleanup;
- privacy-safe diagnostics export;
- local-only/privacy explanation;
- version/build info where available.

No server/cloud wording implying upload or sync.

## 10. Navigation / State Model

Keep current React state and handler architecture.

Frontend V3 may add presentation state only, e.g.:
- `activeView` / view aliases;
- mobile nav open state;
- review page number/page size;
- SKU page number/page size;
- client-only batch filter;
- client-only sort choice.

Existing core state remains source of truth:
- orders;
- mapped orders;
- batch metadata/orders;
- SKU rules;
- review filters;
- workspace/duplicate/archive/storage modules.

## 11. Error and Empty States

Every page has explicit states:
- storage initializing;
- no Batch;
- empty active Batch;
- processing;
- no matching filter results;
- module unavailable;
- operation blocked by safety rule.

Errors explain:
1. what happened;
2. whether local data is still safe;
3. what the user should do next.

## 12. Implementation Strategy

Recommended approach: **Surgical Frontend Rebuild**.

- Keep the current stable app/runtime.
- Rebuild the visible shell and page markup around existing handlers/state.
- Add small pure UI helper components inside `index.html` if that reduces duplication.
- Add no framework migration.
- Add no new persistence model.
- Prefer inline SVG icon primitives or CSS rather than a large new icon dependency.

Rejected approaches:
- full React/Next.js rewrite: too risky and unrelated to packing accuracy;
- CSS-only facelift without information architecture changes: insufficient to match the approved operational design.

## 13. Testing

### Permanent regression
Run all existing tests including:
- smart matcher;
- batch;
- workspace;
- duplicate;
- exception inbox;
- archive;
- storage health;
- diagnostics/pilot safety;
- no-database/no-paid-service guardrails.

### Frontend V3 tests
Add presentation-level guards for:
- required five navigation destinations;
- functional shortcut targets;
- real handler wiring for create Batch/upload/import/export/backup/restore/print/save PDF/archive;
- print scope remains full active Batch;
- review pagination/filter remains presentation-only;
- no parser/matcher/qty code changes;
- frozen `packmaster-batch.js` unchanged;
- JSX compilation.

### Browser smoke
Production-like Chromium smoke:
- create/select Batch;
- navigate all five views;
- upload control is usable;
- SKU search/filter/add-edit form wiring visible;
- Review filters/grid-list/pagination work;
- exceptions block printing when required;
- Backup/Restore UI works;
- Archive/Restore UI works;
- reload keeps local state;
- no console/page errors.

## 14. Definition of Done

Frontend V3 is done only when:
- production visually follows the approved concept;
- every displayed control is functional or explicitly disabled with reason;
- no fake admin/auth/server behavior exists;
- all existing packing features remain available;
- all regression tests pass;
- frozen core/storage guardrails pass;
- GitHub Pages deploy passes;
- production Chromium smoke passes.
