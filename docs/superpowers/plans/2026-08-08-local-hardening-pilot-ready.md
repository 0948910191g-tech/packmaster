# PackMaster Local Hardening → Pilot-ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ PackMaster พร้อม External Pilot แบบ Local-first โดยเพิ่ม Backup/Restore, Duplicate Detection, Exception Inbox, Batch Archive, Storage Health/Cleanup, Recovery UX, Performance hardening และ Local Pilot Diagnostics โดยไม่ใช้บริการเสียเงินและไม่เพิ่ม Database/Cloud Backend

**Architecture:** รักษา Parser/Matcher/Qty/Print core เดิมไว้และเพิ่ม utility/storage modules รอบ Core เท่านั้น โดยให้ `packmaster-batch.js` เป็น boundary ของ IndexedDB และสร้างโมดูล local-only เพิ่มตาม responsibility. UI ยังอยู่ใน `index.html` และ consume helper APIs ผ่าน `window.*` เพื่อไม่ต้อง rewrite framework.

**Tech Stack:** React 18 UMD, Babel Standalone, Tailwind CDN, IndexedDB, LocalStorage, Web Crypto, File API, StorageManager API, PDF.js, html2canvas, jsPDF, Node 22 tests, GitHub Actions, GitHub Pages

## Global Constraints

- ห้ามเพิ่มหรือเปิดใช้งานบริการที่อาจมีค่าใช้จ่าย
- ห้ามเพิ่ม Database / Cloud DB / Supabase / Firebase / backend persistence
- ห้ามเพิ่ม Login / Auth / Multi-user sync / Cloud Batch History
- ห้ามแก้ Shopee Parser, TikTok Parser, Multi-SKU, Qty Parsing, SKU Matcher, Bundle Matching, Quantity Aggregation หรือ Print/Save PDF/Thermal core หากไม่มี Real Failure Case + regression fixture
- ห้าม commit PDF/fixture ที่มี PII จริง
- ห้าม rewrite framework หรือ refactor unrelated code
- ทุก feature ต้อง degrade safely เมื่อ Browser API ไม่รองรับ
- ทุก write ที่อาจทำข้อมูลหายต้องมี validation/confirmation และห้าม auto-delete เงียบ ๆ
- Print / Save PDF ต้องยังอิง full `MappedOrders`

---

### Task 1: Workspace Backup / Restore Core

**Files:**
- Create: `packmaster-workspace.js`
- Test: `tests/packmaster-workspace.test.mjs`
- Modify: `packmaster-batch.js`
- Modify: `.github/workflows/apply-smart-matcher.yml`

**Interfaces:**
- Consumes: `PackMasterBatch.listBatches()`, `loadBatch(id)`, `saveBatch(meta, orders)`, `deleteBatch(id)`
- Produces:
  - `PackMasterWorkspace.buildBackup({ appVersion, settings, skuRules, batches, batchOrders, now })`
  - `PackMasterWorkspace.validateBackup(payload)`
  - `PackMasterWorkspace.exportBackup(payload)`
  - `PackMasterWorkspace.restoreWorkspace(payload, adapters)`
  - `PackMasterBatch.replaceWorkspaceBatches(rows)`

- [ ] **Step 1: Write failing backup schema tests**

```js
assert.equal(backup.schema, 'packmaster-workspace-backup');
assert.equal(backup.version, 1);
assert.throws(() => workspace.validateBackup({ schema: 'wrong', version: 1 }), /schema/i);
assert.throws(() => workspace.validateBackup({ schema: 'packmaster-workspace-backup', version: 99 }), /version/i);
```

- [ ] **Step 2: Run RED**

Run: `node tests/packmaster-workspace.test.mjs`
Expected: FAIL because `packmaster-workspace.js` does not exist.

- [ ] **Step 3: Implement pure backup/validation helpers**

Use explicit required fields, reject unsupported schema/version, preserve unknown optional fields only by ignore, and never silently coerce required arrays.

- [ ] **Step 4: Add atomic-ish local replace helper**

`replaceWorkspaceBatches(rows)` must validate all rows before deleting current batch stores; write metadata/orders in one IndexedDB readwrite transaction across `batchMeta` + `batchOrders` so transaction abort preserves previous DB state.

- [ ] **Step 5: Run GREEN + existing regressions**

Run:
```bash
node tests/packmaster-workspace.test.mjs
node tests/packmaster-batch.test.mjs
node tests/packmaster-smart-matcher.test.mjs
```
Expected: PASS.

- [ ] **Step 6: Wire workspace tests into CI**

Add `node tests/packmaster-workspace.test.mjs` after Local Batch tests.

---

### Task 2: Backup / Restore UI

**Files:**
- Modify: `index.html`
- Create: `tools/patch-phase3a-workspace.cjs`
- Test: `tests/packmaster-phase3-ui.test.mjs`

**Interfaces:**
- Consumes: `window.PackMasterWorkspace`, current `skuRules`, `thermalMode`, Batch API
- Produces UI handlers: `handleWorkspaceBackup`, `handleWorkspaceRestoreFile`

- [ ] **Step 1: Write RED UI marker tests**

Assert `index.html` contains script include, Backup card, Restore input, privacy warning, and both handlers while frozen-core hashes remain unchanged.

- [ ] **Step 2: Run RED**

Run: `node tests/packmaster-phase3-ui.test.mjs`
Expected: FAIL on missing Phase 3A markers.

- [ ] **Step 3: Patch UI minimally**

Add `packmaster-workspace.js` before Babel app script. Add Backup/Restore controls inside SKU/Settings area rather than a new top-level menu. Backup must download JSON locally. Restore must parse → validate → show `window.confirm` summary → replace only after confirmation → reload batches/SKU/settings.

- [ ] **Step 4: Verify privacy and failure UX**

Restore failure message must state that current workspace was not intentionally cleared. Backup UI must warn that backup may contain parsed customer/order data and should not be shared publicly.

- [ ] **Step 5: Run regressions + JSX compile + frozen core hash**

Expected all PASS and unchanged core hash.

---

### Task 3: Duplicate Upload Detection

**Files:**
- Create: `packmaster-duplicate.js`
- Test: `tests/packmaster-duplicate.test.mjs`
- Modify: `packmaster-batch.js`
- Modify: `index.html`

**Interfaces:**
- Produces:
  - `hashFile(file) -> Promise<string>` using `crypto.subtle.digest('SHA-256', bytes)`
  - `findExactFileDuplicate(fileHash, sourceFiles)`
  - `findOrderDuplicateSignals(newOrders, existingOrders)`
- Batch metadata adds optional `sourceFiles[]` entries `{ name, size, hash, addedAt }`; missing field remains backward compatible.

- [ ] **Step 1: RED tests for exact file duplicate + order signal**

```js
assert.equal(dup.findExactFileDuplicate('abc', [{ hash: 'abc' }]).hash, 'abc');
assert.deepEqual(dup.findOrderDuplicateSignals([{ platform:'TIKTOK', tracking:'X' }], [{ platform:'TIKTOK', tracking:'X' }]).length, 1);
```

- [ ] **Step 2: Implement helper without Parser changes**

File hash exact match = strong duplicate. Order-level signal = warning only; it must not delete/merge Qty or mutate parsed orders.

- [ ] **Step 3: Integrate before upload**

Hash selected files before processing. Exact duplicate defaults to blocked and asks explicit confirmation to import anyway. Store accepted fingerprint in active Batch metadata.

- [ ] **Step 4: Integrate post-parse warning**

If parsed order signals collide with current Batch, show warning with collision count before appending. Explicit override required; no auto-delete.

- [ ] **Step 5: Tests / browser smoke**

Test: same file blocked by default, override works, different file processes, existing Parser regressions unchanged.

---

### Task 4: Exception Inbox

**Files:**
- Create: `packmaster-exceptions.js`
- Test: `tests/packmaster-exceptions.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Produces:
  - `getExceptionFlags(mappedOrder)`
  - `getPrimaryStatus(flags)` precedence `reviewQty > reviewSku/parserWarning > unmapped > ready`
  - `buildExceptionRows(mappedOrders)` preserving multi-warning badges

- [ ] **Step 1: RED tests for precedence + multi-warning filtering**

An order with Qty + SKU warning must count once in primary summary as Qty but match both Qty and SKU filters.

- [ ] **Step 2: Implement pure derived helpers**

No second source of truth. No writes to `orders` or `MappedOrders`.

- [ ] **Step 3: Add `ต้องตรวจ` panel in Review**

Display exception count, type filters, search, next/previous navigation, and jump-to-context behavior using existing Review table/list.

- [ ] **Step 4: Keep print/export unaffected**

Static test must continue confirming PDF export loop and print area use full `MappedOrders`.

---

### Task 5: Batch Archive / Lifecycle

**Files:**
- Modify: `packmaster-batch.js`
- Test: `tests/packmaster-batch.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Metadata optional: `archivedAt: null | ISO string`
- Produces `archiveBatch(id, archivedAt)`, `restoreArchivedBatch(id)`, `deleteArchivedBatches(ids)`

- [ ] **Step 1: RED lifecycle tests**

Archive must preserve operational `status` and set only `archivedAt`. Restore clears `archivedAt`. No helper may auto-delete.

- [ ] **Step 2: Implement adapter methods in IndexedDB transaction**

- [ ] **Step 3: UI filters Active / Archived / All**

Add Archive/Restore buttons and explicit confirmation when archiving a Batch with unresolved Review/Unmapped counts.

- [ ] **Step 4: Bulk delete only selected archived batches**

Require checkbox selection + explicit confirm; never provide auto-clean execution.

---

### Task 6: Storage Health / Safe Cleanup

**Files:**
- Create: `packmaster-storage-health.js`
- Test: `tests/packmaster-storage-health.test.mjs`
- Modify: `packmaster-batch.js`
- Modify: `index.html`

**Interfaces:**
- Produces `estimateStorage(navigatorLike)` returning `{ supported, usage, quota, percent }`
- Produces `stripReprintPayload(order)` removing only `pdfImage` heavy payload and preserving parsed/match/display fields
- Batch adapter method `cleanupArchivedReprintImages(ids)`

- [ ] **Step 1: RED tests for supported/unsupported StorageManager**

Unsupported API returns `supported:false` without throw.

- [ ] **Step 2: RED tests for payload stripping**

Verify `pdfImage` removed while `parsedItems`, platform, references, warnings remain.

- [ ] **Step 3: Implement cleanup only for user-selected archived batches**

Return cleanup summary including batches touched and orders stripped. Never delete Batch metadata automatically.

- [ ] **Step 4: Add Storage Health UI**

Show usage/quota when available and explicit warning that removing reprint images may make original label-image reprint unavailable.

---

### Task 7: Recovery UX + Diagnostics

**Files:**
- Create: `packmaster-diagnostics.js`
- Test: `tests/packmaster-diagnostics.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Produces `buildDiagnosticReport({ appVersion, batches, storage, counters, errors })`
- Report must exclude raw `pdfImage` and must redact direct order/tracking identifiers from exported diagnostic rows.

- [ ] **Step 1: RED privacy tests**

Diagnostic export must not contain `pdfImage`, full tracking values, raw customer names/addresses, or PDF binary.

- [ ] **Step 2: Implement local counters**

Track only local aggregate counters: processed orders, ready/review/unmapped totals, duplicate blocks/overrides, storage warnings, export/print counts, processing duration where already measurable.

- [ ] **Step 3: Add Download Diagnostics JSON/CSV**

No network call. Include app/build version and Browser capability flags.

- [ ] **Step 4: Improve recoverable error copy**

For IndexedDB/backup/storage/export errors, message must state `เกิดอะไรขึ้น`, `ข้อมูลปัจจุบันยังอยู่ไหม`, `ควรทำอะไรต่อ`.

---

### Task 8: High-volume Rendering / Persistence Hardening

**Files:**
- Test: `tests/packmaster-performance-guard.test.mjs`
- Modify: `index.html`
- Modify: `packmaster-batch.js` only if evidence requires adapter tuning

**Interfaces:**
- No core Parser/Matcher behavior changes.

- [ ] **Step 1: Add synthetic PII-free large mapped-order fixture**

Generate in test code, not committed customer PDF. Target at least 2,000 lightweight mapped rows for derived filter/exception operations.

- [ ] **Step 2: Measure pure helper operations**

Guard against accidental O(n²) duplicate/exception/filter implementations for common paths; avoid brittle millisecond thresholds, prefer operation-count/algorithmic assertions where possible.

- [ ] **Step 3: Optimize only measured hotspots**

Allowed: memoization, Sets/Maps for duplicate lookup, debounced persistence, avoiding unnecessary derived array recreation. Forbidden: Parser refactor.

- [ ] **Step 4: Browser smoke 150-page-equivalent UI state**

Verify navigation/filter/archive/backup controls remain responsive and no uncaught runtime errors occur.

---

### Task 9: First-run / Pilot-ready Package

**Files:**
- Create: `docs/PILOT_CHECKLIST.md`
- Create: `docs/RECOVERY_GUIDE.md`
- Create: `docs/PRIVACY_LOCAL_DATA.md`
- Modify: `index.html`

**Interfaces:**
- UI shows local-first notice + app version/build identifier.

- [ ] **Step 1: Add first-run local notice**

Explain: data stays in this Browser, Backup is recommended, clearing Browser/site data can remove local workspace.

- [ ] **Step 2: Write Pilot Checklist**

Cover sanitized setup, Backup before pilot, test upload, exception review, print smoke, recovery exercise, KPI collection.

- [ ] **Step 3: Write Recovery Guide**

Cover restore JSON, storage-full cleanup, browser reset consequence, what to export before moving device.

- [ ] **Step 4: Write Local Data Privacy guide**

Explain which local artifacts may contain customer/order data and prohibit uploading real backups/PDFs to public issues/repo.

---

### Task 10: Release Verification + Production Gate

**Files:**
- Verify all Phase 3 files/tests

- [ ] **Step 1: Run full CI suite**

Must include Smart Matcher, Batch, Workspace, Duplicate, Exceptions, Storage Health, Diagnostics, Phase 3 UI/guard tests.

- [ ] **Step 2: Frozen core integrity check**

Compare parser/matcher/Qty core region/hash against Phase 2 `main` baseline; reject unrelated core changes.

- [ ] **Step 3: Browser end-to-end smoke**

Exercise: create Batch → upload synthetic/local fixture path where feasible → duplicate block → exception view → backup → archive → storage view → restore → diagnostics.

- [ ] **Step 4: PR review and merge only when green**

Use feature branch → PR → CI → merge main → main CI → GitHub Pages.

- [ ] **Step 5: Production smoke**

Verify live production assets and local-only browser workflow. Do not introduce any network dependency beyond existing CDN/static hosting.

## Stop Gate After Phase 4 Readiness

เมื่อ Tasks 1–10 ผ่าน ให้หยุดที่ External Pilot readiness. ห้ามเริ่ม SaaS Foundation, Login, Supabase, Cloud Batch, Subscription หรือ Marketplace API integration จนกว่าจะมี Pilot evidence และผู้ใช้ออกคำสั่งใหม่ที่ยกเลิกข้อห้าม Database/paid services อย่างชัดเจน
