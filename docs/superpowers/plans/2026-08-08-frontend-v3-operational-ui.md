# PackMaster Frontend V3 Operational UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the production PackMaster frontend to match the approved operational design concept while keeping every displayed control functional and preserving all stable parser/matcher/qty/print/storage behavior.

**Architecture:** Keep the existing static React 18 + Babel + Tailwind CDN application and existing local modules. Rebuild only the presentation shell and page markup in `index.html`, add presentation-only state for view/pagination/sort, reuse the current handlers, and add permanent UI regression guards. No framework migration and no new persistence model.

**Tech Stack:** React 18 UMD, Babel Standalone, Tailwind CDN, PDF.js, jsPDF, html2canvas, IndexedDB via frozen `packmaster-batch.js`, LocalStorage sidecars, Node `.mjs` regression tests, GitHub Pages.

## Global Constraints

- Do not change Shopee parser.
- Do not change TikTok parser.
- Do not change matcher scoring/business rules.
- Do not change quantity parsing or aggregation.
- Do not change bundle aggregation.
- Do not change thermal label rendering.
- Do not change Print/Save PDF engine.
- Do not change `packmaster-batch.js` frozen Phase 2 adapter.
- Do not change IndexedDB DB version/object-store schema.
- Do not add database/backend/auth.
- Do not add paid services or analytics SaaS.
- Do not create fake admin/account behavior.
- Every visible action must call real state/handlers or be explicitly disabled with a reason.
- Print/Save PDF must keep the complete active Batch scope and existing Pilot Print Safety gate.

---

### Task 1: Frontend V3 regression harness and visual tokens

**Files:**
- Create: `tests/packmaster-frontend-v3-ui.test.mjs`
- Modify: `index.html` style block and presentation helper area only
- Modify: `.github/workflows/apply-smart-matcher.yml`

**Interfaces:**
- Consumes: existing `index.html`, existing CI regression suite.
- Produces: stable `data-pm-view`/`data-pm-action` DOM markers and reusable presentation helpers used by Tasks 2–6.

- [ ] **Step 1: Write the failing UI contract test**

Create `tests/packmaster-frontend-v3-ui.test.mjs` that reads `index.html` and asserts these markers exist:

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const required = [
  'data-pm-shell="v3"',
  'data-pm-view="batches"',
  'data-pm-view="upload"',
  'data-pm-view="sku"',
  'data-pm-view="review"',
  'data-pm-view="safety"',
  'data-pm-action="create-batch"',
  'data-pm-action="upload-pdf"',
  'data-pm-action="print"',
  'data-pm-action="save-pdf"',
  'data-pm-action="workspace-backup"'
];
for (const marker of required) assert.ok(html.includes(marker), `missing ${marker}`);
assert.ok(html.includes('PackMaster Frontend V3'));
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node tests/packmaster-frontend-v3-ui.test.mjs
```

Expected: FAIL on missing `data-pm-shell="v3"`.

- [ ] **Step 3: Add V3 visual tokens and pure UI helpers**

Add a non-print CSS section to `index.html` with:
- `--pm-navy: #071f3d`;
- `--pm-navy-2: #0b315f`;
- `--pm-blue: #0b63ce`;
- `--pm-surface: #ffffff`;
- `--pm-canvas: #f4f7fb`;
- `--pm-border: #dfe7f1`;
- compact card shadows, focus ring, responsive shell breakpoints.

Add small pure helper components near existing presentation components:

```jsx
const PMIcon = ({ name, className = 'w-5 h-5' }) => { /* inline SVG path map */ };
const PMStatusPill = ({ tone = 'slate', children }) => <span className={`pm-status pm-status-${tone}`}>{children}</span>;
const PMMetric = ({ label, value, tone = 'blue', helper }) => (/* metric card */);
const PMEmptyState = ({ icon, title, body, action }) => (/* consistent empty state */);
```

Do not import an icon dependency.

- [ ] **Step 4: Add CI test step**

Append to `.github/workflows/apply-smart-matcher.yml` after existing UI tests:

```yaml
- name: Frontend V3 UI contract
  run: node tests/packmaster-frontend-v3-ui.test.mjs
```

- [ ] **Step 5: Run complete regression suite**

Run every existing `tests/*.test.mjs` plus the smart matcher regression command already used by CI. Expected: all PASS except later V3 page assertions not yet added.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/packmaster-frontend-v3-ui.test.mjs .github/workflows/apply-smart-matcher.yml
git commit -m "test: establish Frontend V3 UI contract"
```

---

### Task 2: Rebuild App Shell and Batch page

**Files:**
- Modify: `index.html` App render block around the current sidebar + `activeTab === 'upload'` Batch list
- Test: `tests/packmaster-frontend-v3-ui.test.mjs`

**Interfaces:**
- Consumes: `activeBatchId`, `batches`, `visibleBatches`, `batchView`, `batchLoading`, `handleCreateBatch`, `handleOpenBatch`, `handleArchiveBatch`, `handleRestoreArchivedBatch`, `handleDeleteSelectedArchived`, `getBatchStatusUi`, `getEffectiveBatchStatus`, `getBatchArchivedAt`, `formatBatchUpdated`.
- Produces: `activeView` presentation routing and functional Batch cards.

- [ ] **Step 1: Extend failing contract test for shell actions**

Assert `index.html` includes real handler wiring:

```js
for (const wiring of [
  'onClick={handleCreateBatch}',
  'handleOpenBatch(batch)',
  'handleArchiveBatch(batch)',
  'handleRestoreArchivedBatch(batch)'
]) assert.ok(html.includes(wiring), `missing wiring ${wiring}`);
```

Also assert sidebar labels `งานแพ็ก`, `อัปโหลด`, `คลังคำศัพท์`, `รีวิว & พิมพ์`, `สำรองข้อมูล` occur inside the V3 shell.

- [ ] **Step 2: Run RED**

Expected: FAIL on V3 shell/view markers.

- [ ] **Step 3: Add presentation routing state**

Near current presentation state add:

```jsx
const [activeView, setActiveView] = useState('batches');
const [mobileNavOpen, setMobileNavOpen] = useState(false);
```

Keep existing `activeTab` temporarily as compatibility state for old handlers. Add one navigation helper:

```jsx
const navigateView = (view, options = {}) => {
  if (view === 'review' && options.exceptionsOnly) {
    setReviewStatus('ALL');
    setExceptionType('ALL');
  }
  setActiveView(view);
  setMobileNavOpen(false);
};
```

Update existing handlers that currently call `setActiveTab('upload'|'settings'|'preview')` only where needed to also set the corresponding `activeView`; do not alter their data logic.

- [ ] **Step 4: Replace old shell with V3 header/sidebar**

Render:
- persistent navy header;
- real shortcut buttons using `navigateView`;
- sidebar buttons using `navigateView`;
- `Local Workspace` footer rather than Admin user;
- `data-pm-shell="v3"`.

Header shortcut mapping:

```jsx
Read PDF -> active batch ? navigateView('upload') : navigateView('batches')
SKU -> navigateView('sku')
Batch -> navigateView('batches')
Review Exceptions -> navigateView('review', { exceptionsOnly: true })
Print -> navigateView('review')
Local Safety -> navigateView('safety')
```

- [ ] **Step 5: Rebuild Batch page**

Add `data-pm-view="batches"` and show derived metrics:

```jsx
const batchDashboard = useMemo(() => {
  const rows = batches.filter(batch => !getBatchArchivedAt(batch));
  return rows.reduce((acc, batch) => {
    acc.orders += Number(batch.totalOrders) || 0;
    acc.ready += Number(batch.readyCount) || 0;
    acc.review += (Number(batch.reviewSkuCount) || 0) + (Number(batch.reviewQtyCount) || 0) + (Number(batch.unmappedCount) || 0);
    return acc;
  }, { batchCount: rows.length, orders: 0, ready: 0, review: 0 });
}, [batches]);
```

Batch cards reuse real operations and show progress `readyCount / totalOrders`. Archive mode remains real and selected archived deletion remains protected by the current confirm flow.

- [ ] **Step 6: Run V3 test + existing Batch/Archive tests + JSX compile**

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/packmaster-frontend-v3-ui.test.mjs
git commit -m "feat: rebuild PackMaster shell and Batch workspace"
```

---

### Task 3: Build functional Upload & Processing page

**Files:**
- Modify: `index.html` upload presentation only
- Test: `tests/packmaster-frontend-v3-ui.test.mjs`

**Interfaces:**
- Consumes: `activeBatch`, `activeBatchId`, `orders`, `MappedOrders`, `loadingStatus`, `uploadError`, `handleFileUpload`/existing PDF input handler, duplicate sidecar helpers, `reviewSummary`, `exceptionRows`.
- Produces: dedicated upload workflow page with stepper and real issue navigation.

- [ ] **Step 1: Add RED assertions**

Assert markers/text:

```js
for (const marker of [
  'data-pm-view="upload"',
  'data-pm-action="upload-pdf"',
  'Upload & Processing',
  'เลือก Batch',
  'อัปโหลดไฟล์',
  'อ่าน PDF',
  'จับคู่ SKU',
  'พร้อมรีวิว'
]) assert.ok(html.includes(marker), `missing ${marker}`);
```

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Create derived stepper state**

```jsx
const uploadStep = !activeBatchId ? 1
  : loadingStatus.active ? 3
  : orders.length === 0 ? 2
  : exceptionRows.length > 0 ? 4
  : 5;
```

Use this for visuals only; do not change parsing flow.

- [ ] **Step 4: Render real upload page**

If no active Batch: show explicit select/create Batch state with `handleCreateBatch` and `navigateView('batches')`.

If Batch active:
- stepper;
- drag/drop/file label wired to the current PDF input handler;
- loading progress from `loadingStatus`;
- current Batch summary from `reviewSummary`;
- issue summary from `exceptionRows`;
- duplicate warning data only when existing duplicate metadata exposes it;
- button `ดูรายการที่ต้องตรวจ` navigates to review.

No fake queue status.

- [ ] **Step 5: Run UI + Duplicate + Exception + Batch tests and JSX compile**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/packmaster-frontend-v3-ui.test.mjs
git commit -m "feat: add operational upload workflow"
```

---

### Task 4: Rebuild SKU Library into functional two-column workspace

**Files:**
- Modify: `index.html` current `activeTab === 'settings'` presentation
- Test: `tests/packmaster-frontend-v3-ui.test.mjs`

**Interfaces:**
- Consumes: `skuRules`, `filteredSkuRules`, `skuSearch`, `setSkuSearch`, `skuFilter`, `setSkuFilter`, `newRule`, `setNewRule`, `editingId`, existing add/edit/delete/import/export handlers.
- Produces: `data-pm-view="sku"`, client-side page/sort state.

- [ ] **Step 1: Add failing contract assertions**

Assert real handler names already present plus V3 markers:

```js
for (const marker of [
  'data-pm-view="sku"',
  'นำเข้า',
  'ส่งออก',
  'ค้นหา / กรองกฎ',
  'เพิ่ม / แก้ไขกฎ'
]) assert.ok(html.includes(marker));
```

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Add presentation-only SKU pagination/sort**

```jsx
const [skuPage, setSkuPage] = useState(1);
const [skuPageSize, setSkuPageSize] = useState(20);
const [skuSort, setSkuSort] = useState('keyword');
```

Compute sorted/paged rows from `filteredSkuRules`; never write them back to `skuRules`.

- [ ] **Step 4: Render two-column SKU page**

Left:
- existing Keyword + Internal Short Name fields;
- Save/Update and Cancel;
- only current data-shape-supported fields.

Right:
- real counts;
- Import/Export;
- Search;
- category chips;
- sort selector;
- table;
- Edit/Delete;
- pagination/page size.

- [ ] **Step 5: Ensure exception handoff still lands here**

Update `handleFixSkuException` presentation navigation to `setActiveView('sku')` while retaining its current safe prefill logic.

- [ ] **Step 6: Run UI tests + existing rule-related smoke/JSX compile**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/packmaster-frontend-v3-ui.test.mjs
git commit -m "feat: rebuild SKU Library workspace"
```

---

### Task 5: Rebuild Review & Print with exception-first grid/list pagination

**Files:**
- Modify: `index.html` current preview/review presentation only
- Test: `tests/packmaster-frontend-v3-ui.test.mjs`

**Interfaces:**
- Consumes: `reviewSummary`, `FilteredOrders`, `reviewSearch`, `reviewPlatform`, `reviewStatus`, `previewMode`, `setPreviewMode`, `exceptionRows`, `filteredExceptionRows`, `printBlocked`, `handleExportPDF`, current `window.print()` path.
- Produces: review pagination state and `visibleReviewOrders` used only for screen rendering.

- [ ] **Step 1: Add RED safety assertions**

```js
for (const marker of [
  'data-pm-view="review"',
  'data-pm-action="print"',
  'data-pm-action="save-pdf"',
  'ตรวจสอบ SKU',
  'ตรวจสอบ Qty',
  'ยังไม่ตั้งชื่อ'
]) assert.ok(html.includes(marker));

assert.ok(/for \(let i = 0; i < MappedOrders\.length; i\+\+\)/.test(html), 'export must remain full active batch');
assert.ok(html.includes('MappedOrders.map((order) => (<LabelCard'), 'print area must remain full active batch');
```

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Add presentation-only review pagination**

```jsx
const [reviewPage, setReviewPage] = useState(1);
const [reviewPageSize, setReviewPageSize] = useState(12);
const reviewPageCount = Math.max(1, Math.ceil(FilteredOrders.length / reviewPageSize));
const visibleReviewOrders = FilteredOrders.slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize);
```

Reset page to 1 when search/platform/status changes.

- [ ] **Step 4: Render V3 Review page**

Include:
- five clickable summary cards;
- search/platform/status controls;
- grid/list buttons;
- clear filters;
- Print + Save PDF with current print safety disabled state and reason;
- Grid uses `visibleReviewOrders` only for display;
- Compact List uses `visibleReviewOrders` only for display;
- pagination footer;
- exception strip/inbox linking to existing exception navigation.

- [ ] **Step 5: Preserve print/export scope**

Do not touch hidden render arena or print area. `handleExportPDF` must keep looping over `MappedOrders`, not `visibleReviewOrders` or `FilteredOrders`.

- [ ] **Step 6: Run UI + pilot safety + exception + matcher regression + JSX compile**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/packmaster-frontend-v3-ui.test.mjs
git commit -m "feat: rebuild exception-first Review and Print"
```

---

### Task 6: Build Local Safety page from existing modules

**Files:**
- Modify: `index.html`
- Test: `tests/packmaster-frontend-v3-ui.test.mjs`

**Interfaces:**
- Consumes: `handleWorkspaceBackup`, `handleWorkspaceRestoreFile`, `restorePreview`, restore confirmation handler, `storageHealth`, `handleCleanupReprintImages`, `handleDownloadDiagnostics`, `selectedArchivedBatchIds`, `workspaceBusy`, `storageHealthBusy`.
- Produces: `data-pm-view="safety"` with no server/cloud behavior.

- [ ] **Step 1: Add RED assertions**

Assert:

```js
for (const marker of [
  'data-pm-view="safety"',
  'data-pm-action="workspace-backup"',
  'ความปลอดภัย Workspace',
  'Storage Health',
  'Diagnostics'
]) assert.ok(html.includes(marker));
```

- [ ] **Step 2: Run RED**

- [ ] **Step 3: Render Safety page**

Sections:
- Local-only explainer;
- Backup/Restore buttons wired to existing handlers;
- restore preview/validation confirmation UI reused from current implementation;
- storage usage card from `storageHealth`;
- archived image cleanup using existing selected archive rules or explicit navigation back to archive mode when selection is required;
- Diagnostics JSON/CSV buttons;
- build/version/local capability summary.

- [ ] **Step 4: Remove duplicated old safety cards from other pages only after the new page contains the same functions**

Preserve all handlers. No functionality deletion.

- [ ] **Step 5: Run Workspace/Archive/Storage/Diagnostics tests + UI + JSX compile**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/packmaster-frontend-v3-ui.test.mjs
git commit -m "feat: add Local Safety workspace"
```

---

### Task 7: Full visual verification, CI, PR, deploy, production smoke

**Files:**
- Modify only if verification exposes a frontend defect: `index.html`, `tests/packmaster-frontend-v3-ui.test.mjs`
- No core module changes allowed.

**Interfaces:**
- Consumes: Tasks 1–6 complete branch.
- Produces: mergeable PR and verified GitHub Pages production frontend.

- [ ] **Step 1: Run every repository test**

Run all `.mjs` tests under `tests/` and the existing smart matcher regression command from CI. Expected: PASS.

- [ ] **Step 2: Freeze guard verification**

Compare branch vs `main` and verify:
- `packmaster-batch.js` unchanged;
- no parser/matcher/qty helper body changed;
- no DB version/object store change;
- no paid/cloud dependency added.

- [ ] **Step 3: Compile JSX**

Extract `<script type="text/babel">` and compile using Babel React preset exactly as existing verification workflows do. Expected: success.

- [ ] **Step 4: Browser smoke on branch artifact/static server**

Chromium checks:
1. shell loads without console/page error;
2. create Batch;
3. navigate Batch → Upload → SKU → Review → Safety;
4. Upload file input exists and accepts PDF;
5. SKU Search/Filter and edit form controls respond;
6. Review summary filters respond;
7. grid/list toggle responds;
8. pagination changes only visible review rows;
9. Print/Save PDF safety block is visible when exception fixtures are injected;
10. Backup creates JSON;
11. invalid restore is rejected;
12. Archive/Restore controls remain functional;
13. reload preserves local Batch state.

- [ ] **Step 5: Visual comparison**

At desktop width around 1440–1680px, verify against the approved concept:
- navy command header;
- compact left nav;
- white operational cards;
- four primary workflow pages visually coherent;
- green/amber/red/blue status hierarchy;
- no oversized prototype spacing;
- no fake controls.

- [ ] **Step 6: Open Draft PR**

PR title:

```text
Frontend V3: Operational PackMaster UI
```

PR body must state:
- presentation-only architecture;
- pages rebuilt;
- functional action mapping;
- parser/matcher/qty/print/storage guards unchanged;
- tests/browser evidence.

- [ ] **Step 7: Wait for PR CI and inspect changed files**

Only expected product file is `index.html` plus V3 tests/docs/workflow. If any core module appears, stop and investigate before merge.

- [ ] **Step 8: Merge after CI success**

Use squash merge.

- [ ] **Step 9: Verify main CI + GitHub Pages**

Both must conclude `success` for the merged commit.

- [ ] **Step 10: Production Chromium smoke**

Repeat navigation and key local actions against `https://0948910191g-tech.github.io/packmaster/`. Verify no console/page errors and live V3 markers.

- [ ] **Step 11: Final status report**

Report:
- merge commit;
- CI run;
- Pages run;
- production smoke result;
- remaining visual/product gaps if any.
