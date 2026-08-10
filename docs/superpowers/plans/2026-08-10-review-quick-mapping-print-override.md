# Review Quick Mapping & Print Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Review exceptions resolvable without silently teaching the shared SKU matcher, add source traceability, and allow safe print/export override paths while preserving parser/matcher/qty behavior.

**Architecture:** Keep shared SKU rules unchanged unless the user explicitly chooses “save as mapping”. Add per-order manual SKU overrides as local order data, applied before shared matching for only the target parsed item. Build print/export scopes from mapped review state so READY_ONLY and FULL_BATCH use the same selection logic.

**Tech Stack:** React 18 in `index.html`, browser LocalStorage/IndexedDB, Node test runner `.mjs`, existing PackMaster helper modules.

## Global Constraints

- Do not modify Shopee/TikTok parser decision logic unless a failing regression test proves it is required.
- Do not modify `matchSkuRule` scoring/priority.
- Do not modify Qty parsing, bundle math, or aggregation rules.
- Quick Mapping must never create a shared rule unless the user explicitly chooses the persistent mapping action.
- Ready-only printing/export must exclude all exception orders.
- Full-batch override must require explicit confirmation each time.
- No new dependency.

---

### Task 1: Manual Order Override Helper

**Files:**
- Create: `packmaster-review-overrides.js`
- Create: `tests/packmaster-review-overrides.test.mjs`

**Interfaces:**
- Produces: `normalizeOverrideKey(value)`, `upsertManualSkuOverride(order, sourceText, shortName)`, `getManualSkuOverride(order, sourceText)`, `getUniqueInternalNames(rules)`.

- [ ] **Step 1: Write failing tests** for exact per-order override lookup, upsert replacement, isolation between orders, and unique internal-name choices.
- [ ] **Step 2: Run** `node --test tests/packmaster-review-overrides.test.mjs` and verify RED.
- [ ] **Step 3: Implement minimal pure helper module** using normalized exact source text only; do not touch shared rules.
- [ ] **Step 4: Re-run test** and verify GREEN.
- [ ] **Step 5: Commit** `feat: add per-order SKU override helpers`.

### Task 2: Quick Mapping Uses Manual Override by Default

**Files:**
- Modify: `index.html`
- Modify/Create: `tests/packmaster-review-quick-mapping.test.mjs`
- Modify/Create: `tests/packmaster-keyword-assistant-ui.test.mjs`

**Interfaces:**
- Consumes: `window.PackMasterReviewOverrides`.
- Behavior: opening Quick Mapping leaves keyword blank; internal names are selectable independently; primary action saves only to target order; persistent mapping remains a separate action.

- [ ] **Step 1: Add failing UI/source tests** asserting no suggestion auto-selection, `ใช้กับ Order นี้` works with shortName only, and persistent action remains separate.
- [ ] **Step 2: Run targeted tests** and verify RED.
- [ ] **Step 3: Load helper script in `index.html` and wire API into App.**
- [ ] **Step 4: Change `MappedOrders`** so each parsed item checks a per-order override before `getMatchResult`; Qty aggregation must still use original item text as the source keyword for manual overrides.
- [ ] **Step 5: Change Quick Mapping state/UI** to include internal-name search/choices, leave keyword blank initially, and add primary `ใช้กับ Order นี้` plus secondary `บันทึกเป็น Mapping และใช้`.
- [ ] **Step 6: Re-run targeted tests** and verify GREEN.
- [ ] **Step 7: Commit** `feat: separate order fixes from shared SKU mappings`.

### Task 3: Source PDF/Page Traceability

**Files:**
- Modify: `index.html`
- Create/Modify: `tests/packmaster-source-reference.test.mjs`

**Interfaces:**
- Adds optional order fields: `sourceFileName`, `sourcePage`.

- [ ] **Step 1: Add failing tests** asserting each imported page records the source filename and 1-based page number, including continuation pages.
- [ ] **Step 2: Run targeted test** and verify RED.
- [ ] **Step 3: Thread current PDF filename/page into newly created order objects only; do not use source metadata in matcher input.**
- [ ] **Step 4: Surface Source PDF/Page in Quick Mapping and Review details/search.**
- [ ] **Step 5: Re-run targeted test** and verify GREEN.
- [ ] **Step 6: Commit** `feat: add order source traceability`.

### Task 4: Print Scope Helper

**Files:**
- Create: `packmaster-print-scope.js`
- Create: `tests/packmaster-print-scope.test.mjs`

**Interfaces:**
- Produces: `selectPrintOrders(mappedOrders, mode, isReady)` where mode is `READY_ONLY` or `FULL_BATCH`.

- [ ] **Step 1: Write failing tests** for ready-only filtering, full-batch passthrough, and empty scope.
- [ ] **Step 2: Run test** and verify RED.
- [ ] **Step 3: Implement pure selection helper.**
- [ ] **Step 4: Re-run test** and verify GREEN.
- [ ] **Step 5: Commit** `feat: add explicit print scope selection`.

### Task 5: Ready-only Print/Export and Emergency Full Override

**Files:**
- Modify: `index.html`
- Modify/Create: `tests/packmaster-pilot-safety-ui.test.mjs`
- Create/Modify: `tests/packmaster-print-override-ui.test.mjs`

**Interfaces:**
- Consumes: `window.PackMasterPrintScope.selectPrintOrders`.
- UI actions: `Print Ready Only`, `Save Ready PDF`, `Emergency Full Batch` confirmation.

- [ ] **Step 1: Add failing tests** asserting normal full print stays blocked, ready-only actions appear with exceptions, emergency full path requires confirmation, and zero-exception flow remains unchanged.
- [ ] **Step 2: Run targeted tests** and verify RED.
- [ ] **Step 3: Add print mode state** and compute active print scope from `MappedOrders` + `getReviewFlags` without mutating order data.
- [ ] **Step 4: Update `handlePrint` and `handleExportPDF`** to receive/use explicit scope; READY_ONLY must not call `markActiveBatchPrinted`; FULL_BATCH override may print/export after confirmation but must not change REVIEW status while exceptions remain.
- [ ] **Step 5: Render hidden print/export arenas from the selected scope**, not always from all `MappedOrders`.
- [ ] **Step 6: Update Review banner/action dock** with safe defaults and explicit override copy.
- [ ] **Step 7: Re-run targeted tests** and verify GREEN.
- [ ] **Step 8: Commit** `feat: add ready-only and explicit print override flows`.

### Task 6: Regression Verification

**Files:**
- No production changes unless a regression test proves necessary.

- [ ] **Step 1: Run all tests** with `node --test tests/*.test.mjs`.
- [ ] **Step 2: Confirm matcher/parser/qty/bundle tests remain green**, especially `packmaster-smart-matcher.test.mjs` and existing parser/guardrail suites.
- [ ] **Step 3: Inspect diff** and confirm no matcher scoring/parser/qty code was changed accidentally.
- [ ] **Step 4: Create PR** from `fix/review-quick-mapping-print-override` to `main` with behavior and regression summary.
