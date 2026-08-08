# PackMaster Frontend Usability Pilot Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Frontend V3 workflow faster and safer before External Pilot by adding persistent Batch context, an exception-first work mode, a sticky completion action bar, simpler navigation, and inline safe SKU mapping.

**Architecture:** Keep the current static React-in-`index.html` architecture and reuse existing state/handlers. All new UI state is presentation-only; no new persistence store or core matching/quantity logic is introduced. Quick Mapping consumes the current Pilot Safety SKU seed and writes through the same local SKU rule shape already used by SKU Library.

**Tech Stack:** React 18 UMD, Babel Standalone, Tailwind CDN, existing PackMaster local modules, Node `.mjs` regression tests, Playwright/Chromium for smoke verification.

## Global Constraints

- Do not change Shopee Parser behavior.
- Do not change TikTok Parser behavior.
- Do not change Multi-SKU parsing, Qty parsing, matcher algorithm, bundle matching, or quantity aggregation.
- Do not change Print/Save PDF engine or full Active Batch print scope.
- `packmaster-batch.js` must remain byte-for-byte unchanged.
- Do not change IndexedDB schema or `DB_VERSION`.
- Do not add Database, Backend, Login/Auth, paid services, telemetry, or new dependency.
- Reuse existing `activeView`, Batch state, `exceptionRows`, `getReviewFlags`, Pilot Print Safety, SKU rule state/handlers, and `pilotSafetyApi.getSkuFixSeed`.
- Hybrid multi-card Review grid remains the default Review visual layout.

---

### Task 1: Active Batch Context + Start Packing Flow

**Files:**
- Modify: `index.html` around V3 app shell/header, Batch page CTA, and `handleCreateBatch` flow.
- Create: `tests/packmaster-active-batch-context.test.mjs`

**Interfaces:**
- Consumes: existing `activeBatch`, `activeBatchId`, `orders`, `batchSummary`, `exceptionRows`, `navigateView`, `handleCreateBatch`.
- Produces: structural markers `data-pm-active-batch-bar` and `data-pm-action="resolve-active-exceptions"`; operational CTA copy `เริ่มงานแพ็กใหม่`.

- [ ] **Step 1: Write the failing UI contract**

Create a source-level regression test that asserts:
- active Batch context marker exists;
- bar derives total/ready/exception values from current state instead of persisted duplicate data;
- CTA copy contains `แก้รายการที่ต้องตรวจ` and `พิมพ์ Batch` branches;
- Batch primary create copy contains `เริ่มงานแพ็กใหม่`;
- no new IndexedDB/network primitives are introduced.

- [ ] **Step 2: Run the focused test and verify RED**

Run:
```bash
node tests/packmaster-active-batch-context.test.mjs
```
Expected: FAIL because `data-pm-active-batch-bar` does not exist yet.

- [ ] **Step 3: Implement the Active Batch Bar minimally**

In `index.html`:
- add CSS for a compact sticky context bar below the command header;
- render it only when `activeBatchId` exists and `activeView !== 'batches'`;
- show Batch label, total orders, ready count, exception count, readiness percent;
- exception CTA resets Review search/platform/status as needed, enables Exception Mode state introduced in Task 2, then navigates to Review;
- ready CTA navigates to Review without invoking Print directly;
- `กลับงานแพ็ก` navigates to Batch page.

Do not persist anything from this bar.

- [ ] **Step 4: Make Start Packing copy operational**

Change prominent create actions from `สร้าง Batch ใหม่` / `สร้าง Batch แรก` to `เริ่มงานแพ็กใหม่` / `เริ่มงานแพ็กแรก` where they represent the operator’s primary flow. Preserve current `handleCreateBatch` persistence and failure handling. After successful creation, ensure the current flow lands on Upload; if it already does, do not add a second navigation side effect.

- [ ] **Step 5: Run focused + existing Batch/V3 tests**

Run:
```bash
node tests/packmaster-active-batch-context.test.mjs
node tests/packmaster-batch.test.mjs
node tests/packmaster-frontend-v3.test.mjs
node tests/packmaster-guardrails.test.mjs
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/packmaster-active-batch-context.test.mjs
git commit -m "ui: add active batch context and start flow"
```

---

### Task 2: Exception Mode + Sticky Review Completion Bar

**Files:**
- Modify: `index.html` around Review state/derived filters, Exception Inbox, Review toolbar, and Review footer.
- Create: `tests/packmaster-review-exception-mode.test.mjs`

**Interfaces:**
- Consumes: existing `exceptionRows`, `FilteredOrders`, `getReviewFlags`, `reviewStatus`, `reviewSearch`, `reviewPlatform`, `handlePrint`, Save PDF handler, Pilot Print Safety result.
- Produces: presentation state `exceptionMode` (boolean), derived `ReviewDisplayOrders`, markers `data-pm-exception-mode` and `data-pm-review-action-bar`.

- [ ] **Step 1: Write the failing Exception Mode contract**

Assert source contains:
- presentation-only `exceptionMode` state;
- Exception Mode derives order IDs from `exceptionRows` and filters the current Review result set without mutating `orders`/`MappedOrders`;
- an exit action exists;
- sticky bar has locked and ready branches;
- sticky Print/Save handlers remain the existing handlers/full-Batch contract.

- [ ] **Step 2: Run focused test and verify RED**

```bash
node tests/packmaster-review-exception-mode.test.mjs
```
Expected: FAIL because `exceptionMode`/sticky action markers are absent.

- [ ] **Step 3: Implement Exception Mode**

Add a React state initialized to `false`.

Create a derived list conceptually equivalent to:
```js
const exceptionOrderIds = new Set(exceptionRows.map(row => row.order?.id).filter(Boolean));
const ReviewDisplayOrders = exceptionMode
  ? FilteredOrders.filter(order => exceptionOrderIds.has(order.id))
  : FilteredOrders;
```

Use `ReviewDisplayOrders` for Review presentation only (hybrid grid/table/count text), never Print/Save PDF.

When Exception Mode is active:
- show a clear amber mode banner;
- `ออกจากโหมดตรวจปัญหา` sets it false;
- keep search/platform/status controls usable;
- if no unresolved exceptions remain, automatically present the ready success state instead of an empty-error state.

- [ ] **Step 4: Implement sticky Review action bar**

At the bottom of the Review workspace, fixed/sticky above viewport bottom and hidden from print:
- unresolved branch: show Ready/Total + Exception count, CTA `แก้ N รายการ`, and visibly locked Print state;
- ready branch: show `พร้อมพิมพ์ Y/Y`, existing Save PDF action, existing Print action;
- add bottom padding to Review page so cards are not obscured.

- [ ] **Step 5: Ensure all Review render paths use the correct list**

Hybrid grid/table browse UI must use `ReviewDisplayOrders` while page-size pagination remains table-only. Search/Platform/Status filters continue to derive from existing `FilteredOrders` logic.

- [ ] **Step 6: Run focused and safety tests**

```bash
node tests/packmaster-review-exception-mode.test.mjs
node tests/packmaster-exceptions.test.mjs
node tests/packmaster-pilot-safety.test.mjs
node tests/packmaster-pilot-safety-ui.test.mjs
node tests/packmaster-full-review-preview.test.mjs
node tests/packmaster-hybrid-review-grid.test.mjs
node tests/packmaster-guardrails.test.mjs
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/packmaster-review-exception-mode.test.mjs
git commit -m "ui: add exception-first review mode"
```

---

### Task 3: Inline Quick Mapping for SKU / Unmapped Exceptions

**Files:**
- Modify: `index.html` around SKU rule state/handlers, `handleFixSkuException`, Review Exception Inbox/cards, and modal/panel rendering.
- Create: `tests/packmaster-review-quick-mapping.test.mjs`

**Interfaces:**
- Consumes: `pilotSafetyApi.getSkuFixSeed(row, getMatchResult)`, existing `newRule` shape, existing SKU rule add/save handler, `setSkuSearch`, `setSkuFilter`, `navigateView('sku')` fallback.
- Produces: local UI state `quickMapState` containing `{ open, row, keyword, shortName }`; action `handleOpenQuickMapping(row)` and save action that delegates to the existing rule-save pathway.

- [ ] **Step 1: Inspect and lock the existing SKU save pathway**

Before editing behavior, identify the existing function that validates and appends `newRule` into the SKU mapping collection/localStorage. The Quick Mapping save must call/reuse that function or a minimally extracted shared helper; it must not duplicate matcher or storage behavior.

- [ ] **Step 2: Write the failing Quick Mapping contract**

Assert:
- Review safe SKU action uses `pilotSafetyApi.getSkuFixSeed`;
- SKU/Unmapped opens inline quick-mapping UI;
- Qty-only exception does not expose this path;
- empty `shortName` cannot save;
- an `เปิดคลังคำศัพท์` advanced fallback remains;
- rule shape remains `keyword` + `shortName` compatible with current SKU Library.

- [ ] **Step 3: Run focused test and verify RED**

```bash
node tests/packmaster-review-quick-mapping.test.mjs
```
Expected: FAIL because current `handleFixSkuException` navigates directly to SKU Library.

- [ ] **Step 4: Implement safe open behavior**

Replace the default direct navigation in `handleFixSkuException` with:
- request safe seed using the existing Pilot Safety API;
- if no seed, preserve the current fallback/error behavior;
- if safe seed exists, open inline panel with keyword prefilled and short name blank;
- never generate or auto-save the short name.

- [ ] **Step 5: Implement shared rule-save behavior**

If the current SKU Library add handler is tightly coupled to page form state, extract only the rule validation/append/persistence operation into a small shared function inside `index.html`, then call it from both SKU Library and Quick Mapping. Preserve the current data shape and toast/error semantics.

After successful Quick Mapping save:
- close panel;
- remain in Review;
- keep Exception Mode active when it was active;
- allow existing derived matcher/display state to re-evaluate;
- do not manually mutate exception rows.

- [ ] **Step 6: Add affected-order count only from existing current data**

Compute an informational count using existing order/match data and the safe seed if it can be done without simulating a new matcher. If the count cannot be derived safely, omit it rather than guess.

- [ ] **Step 7: Run focused + SKU + safety tests**

```bash
node tests/packmaster-review-quick-mapping.test.mjs
node tests/smart-matcher.test.mjs
node tests/packmaster-pilot-safety.test.mjs
node tests/packmaster-frontend-v3.test.mjs
node tests/packmaster-guardrails.test.mjs
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add index.html tests/packmaster-review-quick-mapping.test.mjs
git commit -m "ui: resolve safe sku exceptions inline"
```

---

### Task 4: Simplify Primary Navigation Without Removing Features

**Files:**
- Modify: `index.html` V3 header commands, desktop sidebar, mobile nav, Safety entry.
- Create: `tests/packmaster-navigation-usability.test.mjs`

**Interfaces:**
- Consumes: existing `navigateView` and all existing views.
- Produces: exactly three primary workspace entries and secondary utility access to Upload/Safety.

- [ ] **Step 1: Write the failing navigation contract**

Assert:
- primary sidebar labels are `งานแพ็ก`, `คลังคำศัพท์`, `รีวิว & พิมพ์`;
- Upload and Safety are not deleted from source/views;
- `navigateView('upload')` and `navigateView('safety')` remain reachable through workflow/secondary controls;
- Review exception badge remains on the primary Review item.

- [ ] **Step 2: Run focused test and verify RED**

```bash
node tests/packmaster-navigation-usability.test.mjs
```
Expected: FAIL because current sidebar has five primary entries.

- [ ] **Step 3: Simplify desktop sidebar**

Render only the three primary workspaces in the main nav. Add a small secondary utility area below them for:
- `อัปโหลดไฟล์` only when an active Batch exists or as a contextual tool;
- `เครื่องมือ / ความปลอดภัย` for Safety.

Keep the existing command header actions functional.

- [ ] **Step 4: Simplify mobile nav consistently**

Mobile primary nav uses the same three entries. Upload/Safety remain accessible via compact secondary actions without being lost.

- [ ] **Step 5: Run focused + V3 tests**

```bash
node tests/packmaster-navigation-usability.test.mjs
node tests/packmaster-frontend-v3.test.mjs
node tests/packmaster-active-batch-context.test.mjs
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/packmaster-navigation-usability.test.mjs
git commit -m "ui: simplify packing workspace navigation"
```

---

### Task 5: Integrated Verification, Browser Smoke, and Release

**Files:**
- Modify only if required by new permanent contract: `.github/workflows/apply-smart-matcher.yml`, `.github/workflows/production-smoke.yml`.
- Test: all `tests/*.test.mjs`.
- Temporary branch-only browser workflow may be used, but must be removed before PR final diff unless intentionally made permanent.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified PR with no Core/storage drift and production evidence.

- [ ] **Step 1: Add permanent regression steps to CI if tests are not auto-discovered**

Ensure the new four usability tests run in the normal PackMaster Regression Tests workflow. Do not alter unrelated CI behavior.

- [ ] **Step 2: Run the complete repository regression suite**

```bash
set -euo pipefail
for test_file in tests/*.test.mjs; do
  echo "Running ${test_file}"
  node "${test_file}"
done
```
Expected: all PASS.

- [ ] **Step 3: Compile the Babel JSX**

Extract the `<script type="text/babel">` block from `index.html` and compile with temporary `@babel/core`, `@babel/cli`, and `@babel/preset-react` installed using `--no-save --no-package-lock`. Expected: successful compile with no syntax errors.

- [ ] **Step 4: Verify frozen safety scope**

Check:
```bash
git diff main...HEAD -- packmaster-batch.js packmaster-workspace.js packmaster-duplicate.js packmaster-exceptions.js packmaster-pilot-safety.js packmaster-archive.js packmaster-storage-health.js packmaster-diagnostics.js
```
Expected: no unintended core/storage file changes.

Also verify source still contains the established full-Batch Print and Save PDF `MappedOrders` paths.

- [ ] **Step 5: Chromium branch smoke with sanitized synthetic orders**

At desktop viewport roughly 1536x1050:
- start a Batch;
- verify Active Batch Bar on Upload;
- seed a mix of Ready, safe SKU/Unmapped, and Qty exception orders;
- enter Exception Mode from the bar;
- verify only exception cards display;
- open Quick Mapping, save a safe mapping using an explicit short name;
- verify exception count/state updates through normal derived logic;
- ensure Qty exception remains and Print stays locked;
- exit Exception Mode;
- verify Hybrid grid and normal filters;
- open SKU Library and Safety through simplified navigation;
- reload and confirm Batch persistence;
- assert no pageerror/relevant console error.

Do not commit real customer PII.

- [ ] **Step 6: Review final diff**

Expected product files are primarily `index.html`, new regression tests, design/plan docs, and minimal CI wiring if needed. Any Parser/Matcher/Qty/Batch adapter change is a stop condition.

- [ ] **Step 7: Open Draft PR and wait for merge-result CI**

PR body must list:
- UX changes;
- safety restrictions;
- tests and browser smoke;
- explicit statement that Parser/Matcher/Qty/Print/Batch adapter/DB were not changed.

- [ ] **Step 8: Mark Ready and squash merge only from the tested head SHA**

Use expected-head protection. Do not merge if `main` advanced without refreshing/revalidating.

- [ ] **Step 9: Verify release gates on `main`**

Require:
- PackMaster Regression Tests = success;
- GitHub Pages = success;
- Production Smoke = success.

- [ ] **Step 10: Run live Production Chromium verification**

On the GitHub Pages production URL, repeat the critical Batch context → Exception Mode → Quick Mapping → locked/ready Review navigation using synthetic browser-local data. Clean test data afterward.

- [ ] **Step 11: Final evidence report**

Report:
- PR number;
- merge SHA;
- changed files;
- regression result;
- browser smoke result;
- Pages/Production Smoke result;
- confirmation of frozen Core/storage/print scope.
