# PackMaster Layout Cleanup V4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared page layout rules so every PackMaster page is clean, consistent, responsive, and free of overlapping sticky/fixed UI.

**Architecture:** Keep the single-file React frontend and all existing handlers/state. Consolidate layout behavior into shared CSS tokens/classes, convert Active Batch context and Review action dock to normal document flow, then tune page-specific structure without changing data flow or packing logic.

**Tech Stack:** React 18 UMD, Babel standalone, Tailwind CDN, existing CSS in `index.html`, Node contract tests, GitHub Actions, Chromium/Playwright smoke.

## Global Constraints
- Do not modify parser/matcher/qty/bundle/aggregation behavior.
- Do not modify `packmaster-batch.js` or IndexedDB schema/DB_VERSION.
- Do not modify Print/Save PDF scope; both remain full Active Batch `MappedOrders`.
- No new dependency in production runtime.
- No database/backend/auth/cloud/paid service.
- Preserve collapsible desktop sidebar and mobile drawer behavior.

---

### Task 1: Add layout regression contract

**Files:**
- Create: `tests/packmaster-layout-v4.test.mjs`
- Modify: `.github/workflows/apply-smart-matcher.yml`

**Interfaces:**
- Consumes: stable markers/classes in `index.html`
- Produces: permanent regression gate for static context/dock, tokens, responsive rules, and print safety invariants

- [ ] Step 1: Add failing assertions that require shared spacing tokens, static Active Batch context, static Review action dock, no legacy Review bottom compensation, and existing full-Batch print markers.
- [ ] Step 2: Run CI and confirm the new contract fails on pre-V4 layout.
- [ ] Step 3: Keep the test wired into the main regression workflow.

### Task 2: Consolidate the layout foundation

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: existing `pm-shell`, `pm-command-header`, `pm-sidebar`, `pm-main`, `pm-page`, `pm-card`
- Produces: shared CSS variables and predictable document-flow layout

- [ ] Step 1: Add V4 CSS tokens for header height, page padding, section/card gaps, controls, and max widths.
- [ ] Step 2: Make `pm-page` use the tokens and remove transform-based page animation; opacity-only animation is allowed.
- [ ] Step 3: Normalize page header alignment/wrapping and shared action-group behavior.
- [ ] Step 4: Run the V4 contract and JSX compile.

### Task 3: Remove overlay behavior from shared Batch/Review UI

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: existing Active Batch state/actions, existing Review print/save handlers
- Produces: non-overlapping context/action sections

- [ ] Step 1: Change `.pm-active-batch-bar` from sticky to normal flow and reduce shadow/backdrop treatment.
- [ ] Step 2: Change `.pm-review-action-wrap` from fixed overlay to normal flow with predictable margin.
- [ ] Step 3: Remove `.pm-review-bottom-space` fixed-dock compensation and keep Review page in normal flow.
- [ ] Step 4: Preserve Print/Save PDF handler bindings and full `MappedOrders` scope.
- [ ] Step 5: Run full regression and frozen batch guard.

### Task 4: Clean page-specific structure

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: existing views (`batches`, `upload`, `sku`, `review`, `safety`)
- Produces: consistent page hierarchy and responsive spacing

- [ ] Step 1: Batches — normalize header/KPI/filter/list section spacing.
- [ ] Step 2: Upload — normalize header/stepper/upload/log/summary spacing; keep dropzone primary.
- [ ] Step 3: SKU — enforce desktop 360px + flexible 2-column composition, single-column responsive collapse, grouped search/sort/filter toolbar.
- [ ] Step 4: Review — keep hybrid grid; sequence header, metrics, notices, filter, exceptions, content, static action dock.
- [ ] Step 5: Safety — align sections/cards to shared spacing and action-group rules.
- [ ] Step 6: Run regression + JSX compile.

### Task 5: Browser verification and release

**Files:**
- Temporary verification workflow only on feature/verification branch; remove before final diff.

**Interfaces:**
- Consumes: built branch/Production page
- Produces: measurable evidence for no-overlap/responsive behavior

- [ ] Step 1: Desktop Chromium at 1536x900: visit all five views and assert page header/context/action bounding boxes do not overlap.
- [ ] Step 2: Review with long synthetic list: scroll through content and assert no fixed action dock covers labels.
- [ ] Step 3: Collapse desktop sidebar and assert workspace width increases without overflow.
- [ ] Step 4: Mobile Chromium 390x844: open/close drawer and visit all views; assert `scrollWidth <= innerWidth + 2`.
- [ ] Step 5: Verify frozen `packmaster-batch.js` Git blob and full-Batch Print/Save markers.
- [ ] Step 6: Remove temporary workflow, inspect final diff, open/update PR, run clean-head PR CI, squash merge, verify main CI + Pages + Production smoke + live Chromium.
