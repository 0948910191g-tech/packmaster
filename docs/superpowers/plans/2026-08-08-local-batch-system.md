# PackMaster Local Batch System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม Local-first Batch workflow ให้ PackMaster สร้าง/สลับ/เก็บ/เปิดงานแพ็กหลายชุดได้โดยไม่ต้อง Clear ข้อมูลชุดก่อนหน้า

**Architecture:** เพิ่ม `packmaster-batch.js` เป็น storage adapter + pure batch helpers แล้วให้ `index.html` ใช้ adapter ผ่าน `window.PackMasterBatch`. Parser / Matcher / Qty / Print core ไม่รับรู้ IndexedDB และไม่ถูกแก้ logic.

**Tech Stack:** React 18 UMD, Babel Standalone, Tailwind CDN, IndexedDB, PDF.js, html2canvas, jsPDF, Node 22 regression tests

## Global Constraints

- Do NOT change Shopee parser.
- Do NOT change TikTok parser.
- Do NOT change SKU matching algorithm.
- Do NOT change quantity aggregation.
- Do NOT rewrite the app into Next.js.
- Do NOT add Supabase / database server / auth.
- Print / Save PDF must continue to operate on full `MappedOrders`.
- Existing SKU rule data shape must remain unchanged.

---

### Task 1: Batch helper + IndexedDB adapter

**Files:**
- Create: `packmaster-batch.js`
- Create: `tests/packmaster-batch.test.mjs`

**Interfaces:**
- Produces `window.PackMasterBatch.createBatchMeta(existingBatches, now)`
- Produces `window.PackMasterBatch.deriveBatchStatus(summary, printedAt)`
- Produces `window.PackMasterBatch.buildBatchMeta(meta, summary, overrides)`
- Produces async `listBatches()`, `saveBatch(meta, orders)`, `loadBatch(id)`, `deleteBatch(id)`

- [ ] **Step 1:** Write helper tests for deterministic naming and status derivation.
- [ ] **Step 2:** Run `node tests/packmaster-batch.test.mjs` and verify it fails because adapter does not exist.
- [ ] **Step 3:** Implement pure helpers and IndexedDB adapter in `packmaster-batch.js`.
- [ ] **Step 4:** Run `node tests/packmaster-batch.test.mjs` and verify pass.
- [ ] **Step 5:** Run existing `node tests/packmaster-smart-matcher.test.mjs` and verify pass.

### Task 2: Wire Batch state into React without touching core parser

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes `window.PackMasterBatch`
- Adds React states: `batches`, `activeBatchId`, `batchStorageReady`, `batchLoading`
- Adds handlers: `refreshBatches`, `handleCreateBatch`, `handleOpenBatch`, `handleDeleteBatch`, `handleBackToBatchList`, `markActiveBatchPrinted`

- [ ] **Step 1:** Add `<script src="./packmaster-batch.js"></script>` before application Babel script.
- [ ] **Step 2:** Add batch state and initialization effect that loads metadata from IndexedDB.
- [ ] **Step 3:** Add open/create/delete/back handlers; switching batch must replace `orders`, never merge two batch arrays.
- [ ] **Step 4:** Add debounced persistence effect that saves current `orders` + derived summary only when an active batch exists.
- [ ] **Step 5:** Ensure storage failures show toast but do not disable current-session upload/review/print.

### Task 3: Packing Jobs UI

**Files:**
- Modify: `index.html`

**Interfaces:**
- Uses current `activeTab === 'upload'` as `งานแพ็ก`
- Batch list mode when `activeBatchId === null`
- Active batch mode when `activeBatchId !== null`

- [ ] **Step 1:** Replace single upload landing page with Batch List header + `+ สร้าง Batch ใหม่` when no batch is active.
- [ ] **Step 2:** Render recent Batch cards sorted by `updatedAt` descending with counts and status chip.
- [ ] **Step 3:** Add `เปิดงาน` and confirm-before-delete action.
- [ ] **Step 4:** When batch is active, render back button, active batch name/status/summary and reuse existing upload Hero unchanged below it.
- [ ] **Step 5:** Add shortcut to Review & Print when current batch has orders.

### Task 4: Completion / Reprint behavior

**Files:**
- Modify: `index.html`

**Interfaces:**
- `handleExportPDF()` calls `markActiveBatchPrinted()` only after PDF save succeeds.
- New `handlePrint()` marks active batch completed and then invokes `window.print()`.

- [ ] **Step 1:** Add active batch name to Review header.
- [ ] **Step 2:** Wrap print action in `handlePrint` without modifying print-area rendering.
- [ ] **Step 3:** Mark Save PDF completion after successful export.
- [ ] **Step 4:** Keep full `MappedOrders` for hidden export arena and print area.
- [ ] **Step 5:** Opening a completed batch restores persisted orders so user can print again.

### Task 5: Verification + release

**Files:**
- Verify: `index.html`, `packmaster-batch.js`, tests

- [ ] **Step 1:** Run `node tests/packmaster-batch.test.mjs`.
- [ ] **Step 2:** Run `node tests/packmaster-smart-matcher.test.mjs`.
- [ ] **Step 3:** Extract Babel script from `index.html` and compile with `@babel/preset-react`.
- [ ] **Step 4:** Verify static safety invariants for `MappedOrders` Print/Export.
- [ ] **Step 5:** Browser smoke IndexedDB create/reload/switch/delete using headless browser.
- [ ] **Step 6:** Compare branch against `main`; reject unrelated parser/matcher changes.
- [ ] **Step 7:** Open PR, wait CI, merge only when green.
- [ ] **Step 8:** Wait GitHub Pages deploy and run production smoke test.

## Self-review

- Spec coverage: Create/Switch/Status/IndexedDB/history/reprint included.
- Parser / Matcher / Qty logic explicitly excluded.
- No placeholder requirements.
- Storage boundary is isolated so future Supabase/API adapter can replace IndexedDB without parser changes.
