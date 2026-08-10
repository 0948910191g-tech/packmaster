# PackMaster Review Confirmation UX V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม Review Confirmation UX ที่ทำให้แอดมินเห็นไฟล์ต้นทาง/ใบจริง, มี Keyword แนะนำเสมอ, ยืนยัน SKU/Qty ที่ถูกต้องเฉพาะ Order ได้ และแก้ค่าที่ผิดแบบ Review-layer โดยไม่แตะ Parser/Matcher/Qty core.

**Architecture:** เพิ่ม helper แบบ sidecar สำหรับ review acknowledgements/qty overrides และ batch source summary, ขยาย Keyword Assistant เฉพาะ candidate/fallback generation, แล้ว wire UI ใน `index.html` ให้ใช้ state เหล่านี้ในการคำนวณ Exception และเปิด modal แบบ side-by-side. Raw parser warnings และ parsed qty เดิมต้องคงอยู่เพื่อ audit/debug; resolution เกิดที่ Review layer เท่านั้น.

**Tech Stack:** Static HTML + React CDN runtime, plain JavaScript sidecar modules, Node.js regression tests, IndexedDB via existing `packmaster-batch.js`, GitHub Actions.

## Global Constraints

- ห้ามแก้ `scoreSkuRule` / Matcher scoring.
- ห้ามแก้ Shopee/TikTok parser decision logic.
- ห้ามแก้ Qty parsing หรือ Bundle aggregation core.
- ห้ามสร้าง Shared SKU Mapping อัตโนมัติจาก acknowledgement หรือ recommendation.
- Keyword recommendation ห้าม auto-fill และห้าม auto-save.
- `parserWarning` และ `qtyWarning` ต้นฉบับต้องไม่ถูกลบเมื่อแอดมินยืนยัน.
- ใช้ `order.pdfImage`, `order.sourceFileName`, `order.sourcePage` ที่มีอยู่แล้ว.
- ไม่มี dependency ใหม่ ไม่มี Database/Login/Cloud runtime.

---

### Task 1: Review acknowledgement + Qty override sidecar

**Files:**
- Modify: `packmaster-review-overrides.js`
- Create: `tests/packmaster-review-confirmation.test.mjs`

**Interfaces:**
- Produces: `getReviewAcknowledgement(order, type)`, `confirmReview(order, type, now?)`, `clearReviewConfirmation(order, type)`, `getQtyOverride(order, sourceText)`, `upsertQtyOverride(order, sourceText, qty)`, `getEffectiveItemQty(order, item)`.
- Consumes: existing `manualSkuOverrides` behavior in the same module.

- [ ] **Step 1: Write failing tests**

```js
assert.equal(api.getReviewAcknowledgement({}, 'sku'), false);
const confirmed = api.confirmReview({ parserWarning: true }, 'sku', '2026-08-10T00:00:00.000Z');
assert.equal(confirmed.parserWarning, true);
assert.equal(api.getReviewAcknowledgement(confirmed, 'sku'), true);

const qtyOrder = api.upsertQtyOverride({ qtyWarning: true }, 'SKU A', 3);
assert.equal(qtyOrder.qtyWarning, true);
assert.equal(api.getQtyOverride(qtyOrder, 'SKU A').qty, 3);
assert.equal(api.getEffectiveItemQty(qtyOrder, { text: 'SKU A', qty: 1 }), 3);
```

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test tests/packmaster-review-confirmation.test.mjs`
Expected: FAIL because acknowledgement/qty override APIs do not exist yet.

- [ ] **Step 3: Implement minimal sidecar APIs**

Use backward-compatible order fields:

```js
reviewAcknowledgements: {
  sku: { confirmed: true, confirmedAt: 'ISO' },
  qty: { confirmed: true, confirmedAt: 'ISO' }
},
reviewQtyOverrides: [
  { sourceText: '...', qty: 2 }
]
```

`confirmReview()` must preserve all existing raw warning fields. `upsertQtyOverride()` must require integer qty >= 1 and must not mutate parsedItems.

- [ ] **Step 4: Run focused test and confirm GREEN**

Run: `node --test tests/packmaster-review-confirmation.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packmaster-review-overrides.js tests/packmaster-review-confirmation.test.mjs
git commit -m "feat: add per-order review confirmations"
```

### Task 2: Guaranteed safe Keyword recommendation fallback

**Files:**
- Modify: `packmaster-keyword-assistant.js`
- Create: `tests/packmaster-keyword-guaranteed-suggestion.test.mjs`

**Interfaces:**
- Produces: existing `generateKeywordSuggestions(input)` with guaranteed non-empty recommendation when a source identity can be extracted without fabricating text.
- Consumes: existing `assessKeywordSafety`, matcher callback, existing rules, batch item texts.

- [ ] **Step 1: Write failing tests**

Cases:

```js
// weak short candidates collide, but full source identity is unique
const rows = api.generateKeywordSuggestions({
  sourceText: 'HAKU Cooling Lavender 30 Sheets SellerSKU LAV30-NEW',
  existingRules,
  batchItemTexts,
  maxSuggestions: 3,
  safeOnly: true,
  matchRule,
  matchNormalizer
});
assert.ok(rows.length >= 1);
assert.ok(rows[0].value.includes('Lavender') || rows[0].value.includes('LAV30-NEW'));
assert.notEqual(rows[0].value.trim().toUpperCase(), 'HAKU');
```

Also verify no metadata-only fallback and no invented discriminator.

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test tests/packmaster-keyword-guaranteed-suggestion.test.mjs`
Expected: FAIL on current safe-only empty result case.

- [ ] **Step 3: Implement fallback generation without changing matcher scoring**

Add helper that:
1. normalizes source product text,
2. removes metadata-noise tokens already recognized by Keyword Assistant,
3. prefers seller/model/variant/product identity tokens,
4. tests candidate through existing `assessKeywordSafety`,
5. returns label metadata such as `specificity: 'current-context-max'` when only current-context uniqueness can be proven.

Do not modify `scoreSkuRule` or matcher implementation.

- [ ] **Step 4: Run focused tests and existing Keyword Assistant tests**

Run:
```bash
node --test tests/packmaster-keyword-guaranteed-suggestion.test.mjs
node --test tests/packmaster-keyword-assistant*.test.mjs
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packmaster-keyword-assistant.js tests/packmaster-keyword-guaranteed-suggestion.test.mjs
git commit -m "feat: guarantee safe keyword suggestions"
```

### Task 3: Batch source-file summary helper

**Files:**
- Modify: `packmaster-batch.js`
- Create: `tests/packmaster-batch-source-files.test.mjs`

**Interfaces:**
- Produces: `summarizeBatchSourceFiles(orders, visibleLimit = 2)` returning `{ names, total, hiddenCount, label }`.
- Consumes: existing `order.sourceFileName` only.

- [ ] **Step 1: Write failing tests**

```js
const summary = api.summarizeBatchSourceFiles([
  { sourceFileName: 'TikTok_A.pdf' },
  { sourceFileName: 'tiktok_a.pdf' },
  { sourceFileName: 'Shopee_B.pdf' },
  { sourceFileName: 'Shopee_C.pdf' }
], 2);
assert.deepEqual(summary.names, ['TikTok_A.pdf', 'Shopee_B.pdf']);
assert.equal(summary.total, 3);
assert.equal(summary.hiddenCount, 1);
assert.match(summary.label, /\+1 ไฟล์/);
```

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test tests/packmaster-batch-source-files.test.mjs`
Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement helper only**

Deduplicate case-insensitively, preserve first-seen casing, return `ยังไม่มีไฟล์` for empty input. Do not change IndexedDB schema.

- [ ] **Step 4: Run test and confirm GREEN**

Run: `node --test tests/packmaster-batch-source-files.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packmaster-batch.js tests/packmaster-batch-source-files.test.mjs
git commit -m "feat: summarize source files per batch"
```

### Task 4: Wire Exception resolution + side-by-side Review UI

**Files:**
- Modify: `packmaster-exceptions.js`
- Modify: `index.html`
- Create: `tests/packmaster-review-confirmation-ui.test.mjs`
- Create: `tests/packmaster-review-acknowledgement-status.test.mjs`
- Modify if needed: `.github/workflows/production-smoke.yml`

**Interfaces:**
- Consumes: `PackMasterReviewOverrides` APIs from Task 1, `generateKeywordSuggestions()` from Task 2, `summarizeBatchSourceFiles()` from Task 3.
- Produces: resolved Exception state, acknowledgement controls, Qty correction control, source-PDF preview modal, batch filename display.

- [ ] **Step 1: Write failing Exception-state tests**

Verify:

```js
const order = {
  parserWarning: true,
  qtyWarning: true,
  displayItems: ['⚠️ ตรวจสอบ SKU', '⚠️ ตรวจสอบ Qty'],
  reviewAcknowledgements: {
    sku: { confirmed: true, confirmedAt: 'x' },
    qty: { confirmed: true, confirmedAt: 'x' }
  }
};
const flags = exceptions.getExceptionFlags(order);
assert.equal(flags.reviewSku, false);
assert.equal(flags.reviewQty, false);
assert.equal(flags.ready, true);
```

Raw warning fields must remain true.

- [ ] **Step 2: Run status test and confirm RED**

Run: `node --test tests/packmaster-review-acknowledgement-status.test.mjs`
Expected: FAIL because exception logic currently ignores acknowledgements.

- [ ] **Step 3: Update exception-layer calculation only**

`packmaster-exceptions.js` must subtract acknowledged review types while preserving raw `parserWarning` and `qtyWarning`. Qty override with valid qty counts as resolved Qty review. Manual SKU override counts as resolved Unmapped/SKU only when output is printable.

- [ ] **Step 4: Write failing UI contract tests**

Assert `index.html` contains stable markers/controls:

```text
data-pm-batch-source-files
data-pm-review-original-pdf
data-pm-review-confirm-sku
data-pm-review-confirm-qty
data-pm-review-qty-override
data-pm-keyword-suggestion
```

Also verify modal uses `order.pdfImage`, displays `sourceFileName/sourcePage`, keyword chips do not auto-fill, and batch cards show summarized source files.

- [ ] **Step 5: Run UI contract and confirm RED**

Run: `node --test tests/packmaster-review-confirmation-ui.test.mjs`
Expected: FAIL before UI wiring.

- [ ] **Step 6: Implement UI wiring in `index.html`**

Required behavior:
- Batch card loads/summarizes filenames for each Batch and displays them under Batch name.
- Quick Mapping modal becomes responsive two-column layout on desktop; left side displays `<img src={order.pdfImage}>` with scroll/zoom-friendly container and no `LabelCard` overlay.
- Keyword suggestions always render at least one suggestion when source identity is available; clicking chip sets `keyword`, but no auto-fill on modal open and no auto-save.
- REVIEW_SKU displays `ยืนยันว่า SKU ถูกต้อง` action; REVIEW_QTY displays `ยืนยันว่า Qty ถูกต้อง` action.
- Confirmation writes Review-layer state only and immediately recalculates exception summary.
- Qty correction accepts integer >= 1 and stores per-order/per-item override through sidecar helper; mapped display/aggregation uses effective qty while parsed item qty remains untouched.
- If SKU is wrong, existing per-order SKU override / explicit shared Mapping paths remain available.
- Print/Save PDF behavior from PR #32 remains unchanged.

- [ ] **Step 7: Run focused UI/status tests**

Run:
```bash
node --test tests/packmaster-review-confirmation-ui.test.mjs
node --test tests/packmaster-review-acknowledgement-status.test.mjs
node --test tests/packmaster-review-confirmation.test.mjs
node --test tests/packmaster-keyword-guaranteed-suggestion.test.mjs
node --test tests/packmaster-batch-source-files.test.mjs
```
Expected: PASS.

- [ ] **Step 8: Run full regression suite**

Run the same project test command used by `.github/workflows/apply-smart-matcher.yml`, including Smart Matcher, parser/qty guardrails, batch, workspace, review, print scope and layout tests.
Expected: 0 failures.

- [ ] **Step 9: Verify diff guardrails**

Confirm no changes to matcher scoring/parser/qty core sections. `git diff --check` must pass.

- [ ] **Step 10: Commit**

```bash
git add packmaster-exceptions.js index.html tests/packmaster-review-confirmation-ui.test.mjs tests/packmaster-review-acknowledgement-status.test.mjs .github/workflows/production-smoke.yml
git commit -m "feat: add exception confirmation review workspace"
```

### Task 5: PR, CI, Production verification

**Files:**
- No product code unless verification finds a real regression.

- [ ] **Step 1: Push branch and open PR to `main`**

PR body must explicitly state no Parser/Matcher scoring/Qty core changes.

- [ ] **Step 2: Verify GitHub Actions regression suite**

All required jobs must conclude `success`.

- [ ] **Step 3: Review changed filenames/diff**

Reject accidental changes outside planned files or core guardrails.

- [ ] **Step 4: Merge only after green CI**

Use expected head SHA to prevent merging stale code.

- [ ] **Step 5: Verify `main` regression + GitHub Pages Production Smoke**

Confirm Pages build points to merge commit and Production Smoke verifies new Review markers.

## Definition of Done

- Batch cards show source filenames from contained Orders.
- Every mapping-required Review state has at least one non-generic Keyword recommendation when real source identity can be extracted.
- Keyword recommendations are advisory only: no auto-fill, no auto-save.
- Admin can confirm SKU and Qty as correct per Order; raw warnings remain preserved.
- Admin can correct Qty through Review-layer override without mutating parsed qty.
- Review modal shows the original PDF page beside controls on desktop and stacked on narrow screens.
- Existing per-order SKU override / explicit Shared Mapping flows still work.
- Ready-only and emergency full-batch Print/PDF behavior remains intact.
- Full regression, guardrails, Pages build and Production Smoke all pass before completion.
