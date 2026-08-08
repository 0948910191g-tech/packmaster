# PackMaster Workspace Backup / Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม Workspace Backup / Restore แบบ Local-first ให้ PackMaster สำรอง SKU rules, settings และ Local Batch ทั้งหมดเป็น JSON และกู้คืนแบบ Replace Workspace ที่ validate ก่อนเขียนข้อมูลจริง โดยไม่แตะ Parser / Matcher / Qty / Print core และไม่เพิ่ม Database/Cloud service ใหม่

**Architecture:** เพิ่ม `packmaster-workspace.js` เป็น pure backup/validation helper ที่ไม่รู้จัก React และไม่แตะ parser logic จากนั้นให้ `index.html` เรียก existing `PackMasterBatch` APIs (`listBatches`, `loadBatch`, `saveBatch`, `deleteBatch`) เพื่อ collect/restore ข้อมูลใน IndexedDB เดิม โดยไม่เปลี่ยน `DB_VERSION`, object stores หรือ data schema ของ Phase 2. UI อยู่ในหน้า `คลังคำศัพท์` เป็น Workspace Safety card เพื่อหลีกเลี่ยงการเพิ่ม navigation ใหม่ในรอบนี้

**Tech Stack:** React 18 UMD, Babel Standalone, Tailwind CDN, IndexedDB adapter เดิม (`packmaster-batch.js`), LocalStorage, Browser File/Blob APIs, Node 22 regression tests

## Global Constraints

- ห้ามใช้บริการเสียเงินทุกชนิด
- ห้ามเพิ่ม Supabase / Firebase / Cloud DB / Login / Auth / server backend
- ห้ามเปลี่ยน `DB_NAME`, `DB_VERSION`, `batchMeta` หรือ `batchOrders` store schema
- ห้ามแก้ Shopee Parser
- ห้ามแก้ TikTok Parser
- ห้ามแก้ SKU Matcher algorithm
- ห้ามแก้ Quantity aggregation
- ห้ามเปลี่ยน Print / Save PDF / Thermal rendering behavior
- Restore ต้อง validate ทั้งไฟล์ก่อนเริ่มเขียนข้อมูล
- Default restore mode คือ `Replace Workspace` เท่านั้นใน Phase 3A
- Backup อาจมี parsed customer data จึงต้องมีคำเตือน privacy ใน UI
- Fixture/tests ห้ามมี PII จริง

---

### Task 1: Pure Workspace Backup Format + Validation

**Files:**
- Create: `packmaster-workspace.js`
- Create: `tests/packmaster-workspace.test.mjs`

**Interfaces:**
- Produces: `window.PackMasterWorkspace.createBackup(payload, now)`
- Produces: `window.PackMasterWorkspace.validateBackup(candidate)`
- Produces: `window.PackMasterWorkspace.getBackupSummary(backup)`
- Produces constants: `SCHEMA = 'packmaster-workspace-backup'`, `VERSION = 1`

- [ ] **Step 1: Write failing pure helper tests**

Create `tests/packmaster-workspace.test.mjs` with assertions that:

```js
const payload = {
  appVersion: 'test',
  settings: { thermalMode: true },
  skuRules: [{ keyword: 'HOYA 5', shortName: 'หมูเด้ง5' }],
  batches: [{ id: 'batch-1', name: '8 Aug / Batch #001' }],
  batchOrders: [{ batchId: 'batch-1', orders: [{ id: 'order-1' }] }]
};

const backup = workspace.createBackup(payload, new Date('2026-08-08T12:00:00.000Z'));
assert.equal(backup.schema, 'packmaster-workspace-backup');
assert.equal(backup.version, 1);
assert.equal(backup.createdAt, '2026-08-08T12:00:00.000Z');
assert.deepEqual(workspace.validateBackup(backup), backup);
assert.deepEqual(workspace.getBackupSummary(backup), {
  skuRules: 1,
  batches: 1,
  orders: 1,
  createdAt: '2026-08-08T12:00:00.000Z'
});
```

Also assert `validateBackup` rejects:
- wrong schema
- unsupported version
- non-array `skuRules`
- non-array `batches`
- non-array `batchOrders`
- batch order record without `batchId`
- duplicate `batchId` in `batches`
- `batchOrders` referencing a missing batch

- [ ] **Step 2: Run test and verify RED**

Run:
```bash
node tests/packmaster-workspace.test.mjs
```
Expected: FAIL because `packmaster-workspace.js` does not exist.

- [ ] **Step 3: Implement minimal pure helper**

`packmaster-workspace.js` must:
- use UMD-style export consistent with `packmaster-batch.js`
- deep-clone input using JSON-safe data only
- reject invalid backup with `Error` messages that UI can show
- never mutate caller payload
- not import IndexedDB, React, parser, matcher or network APIs

- [ ] **Step 4: Run helper test GREEN**

Run:
```bash
node tests/packmaster-workspace.test.mjs
```
Expected: PASS.

- [ ] **Step 5: Run existing Core regressions**

Run:
```bash
node tests/packmaster-smart-matcher.test.mjs
node tests/packmaster-batch.test.mjs
```
Expected: PASS.

---

### Task 2: Workspace Snapshot / Replace Operations Using Existing Batch API

**Files:**
- Modify: `packmaster-workspace.js`
- Modify: `tests/packmaster-workspace.test.mjs`

**Interfaces:**
- Consumes `batchApi.listBatches(): Promise<BatchMeta[]>`
- Consumes `batchApi.loadBatch(id): Promise<{meta, orders}>`
- Consumes `batchApi.saveBatch(meta, orders): Promise<BatchMeta>`
- Consumes `batchApi.deleteBatch(id): Promise<void>`
- Produces: `collectBackupPayload({ batchApi, skuRules, settings, appVersion })`
- Produces: `replaceWorkspaceBatches(backup, batchApi)`

- [ ] **Step 1: Add failing adapter-contract tests with a fake in-memory batch API**

Test that `collectBackupPayload` returns one `batchOrders` record per batch and preserves order arrays.

Test that `replaceWorkspaceBatches`:
1. validates backup before any write
2. deletes all existing batch IDs
3. saves every backup batch with its matching orders
4. never changes DB schema because it only calls public Phase 2 APIs

- [ ] **Step 2: Run RED**

Run:
```bash
node tests/packmaster-workspace.test.mjs
```
Expected: FAIL on missing async functions.

- [ ] **Step 3: Implement async functions**

Use only the public batch API functions above. Do not add or call any `openDb`, store, schema or version API from `packmaster-workspace.js`.

- [ ] **Step 4: Run GREEN + existing regressions**

Run:
```bash
node tests/packmaster-workspace.test.mjs
node tests/packmaster-batch.test.mjs
node tests/packmaster-smart-matcher.test.mjs
```
Expected: PASS.

---

### Task 3: Integrate Backup / Restore UI Without Core Changes

**Files:**
- Modify: `index.html`
- Test: `tests/packmaster-workspace.test.mjs`

**Interfaces:**
- Consumes `window.PackMasterWorkspace`
- Adds React state:
  - `restorePreview`
  - `restoreFileName`
  - `workspaceBusy`
- Adds handlers:
  - `handleWorkspaceBackup()`
  - `handleWorkspaceRestoreFile(event)`
  - `handleConfirmWorkspaceRestore()`
  - `resetRestorePreview()`

- [ ] **Step 1: Extend static UI integration test and verify RED**

Require `index.html` to contain:
```text
<script src="./packmaster-workspace.js"></script>
handleWorkspaceBackup
handleWorkspaceRestoreFile
handleConfirmWorkspaceRestore
สำรอง Workspace
กู้คืน Workspace
Replace Workspace
```

Also assert the existing Print / Save PDF safety markers remain unchanged.

- [ ] **Step 2: Run RED**

Run:
```bash
node tests/packmaster-workspace.test.mjs
```
Expected: FAIL because UI integration is absent.

- [ ] **Step 3: Add script include before Babel app script**

Add:
```html
<script src="./packmaster-workspace.js"></script>
```
next to `packmaster-batch.js`.

- [ ] **Step 4: Add Backup handler**

`handleWorkspaceBackup()` must:
1. collect local settings (`thermalMode`) and current `skuRules`
2. call `collectBackupPayload`
3. call `createBackup`
4. stringify with 2-space indentation
5. create Blob + temporary object URL
6. trigger filename `PackMaster_Backup_YYYY-MM-DD_HH-mm.json`
7. revoke object URL
8. show success toast with SKU/Batch/Order counts

No network request is allowed.

- [ ] **Step 5: Add Restore file parser / preview**

`handleWorkspaceRestoreFile(event)` must:
1. read selected `.json` with `file.text()`
2. JSON.parse
3. call `validateBackup`
4. calculate preview with `getBackupSummary`
5. set `restorePreview` only after validation passes
6. show validation error without changing current data when invalid

- [ ] **Step 6: Add Confirm Replace Workspace handler**

`handleConfirmWorkspaceRestore()` must:
1. require an already validated `restorePreview.backup`
2. show explicit `window.confirm` that current local workspace will be replaced
3. collect current workspace into an in-memory safety snapshot before writes
4. call `replaceWorkspaceBatches`
5. replace `skuRules`
6. restore `thermalMode` only if backup settings contain boolean `thermalMode`
7. refresh batches from `batchApi.listBatches()`
8. clear active batch and `orders`
9. show success toast
10. on write failure, attempt to restore the in-memory batch safety snapshot, keep current in-memory UI data when possible, and show a recovery error

- [ ] **Step 7: Add Workspace Safety card in Settings / SKU Library**

Card content:
- title `ความปลอดภัย Workspace`
- primary action `สำรอง Workspace`
- secondary file input action `กู้คืน Workspace`
- privacy warning: backup อาจมีข้อมูลจากใบออเดอร์และควรเก็บเป็นข้อมูลภายในร้าน
- restore preview shows backup date, SKU rules, Batches, Orders
- confirm button text `Replace Workspace`
- cancel button clears preview

- [ ] **Step 8: Run JSX syntax compile**

Extract Babel script and compile using `@babel/preset-react`. Expected: no syntax error.

- [ ] **Step 9: Run all regressions**

Run:
```bash
node tests/packmaster-workspace.test.mjs
node tests/packmaster-batch.test.mjs
node tests/packmaster-smart-matcher.test.mjs
```
Expected: PASS.

---

### Task 4: Browser Safety Smoke

**Files:**
- Verify only

- [ ] **Step 1: Open feature branch in isolated Chromium**

Serve current branch locally in CI and verify:
1. App loads without page/console error
2. create Batch #001
3. insert a sanitized order-like record via `PackMasterBatch.saveBatch`
4. set a sanitized SKU rule through UI/local state path if practical; otherwise test backup helper payload directly in page context
5. click `สำรอง Workspace` and intercept browser download
6. parse downloaded JSON and validate schema/version/counts

- [ ] **Step 2: Restore behavior smoke**

In same isolated profile:
1. create a second local batch so current workspace differs from backup
2. upload backup JSON
3. verify preview counts
4. accept Replace confirmation
5. verify only backup batches remain
6. reload browser
7. verify restored batch persists

- [ ] **Step 3: Invalid backup smoke**

Upload `{ "schema": "wrong" }` and verify:
- current batches unchanged
- error message visible
- no crash

---

### Task 5: CI / PR / Release

**Files:**
- Modify: `.github/workflows/apply-smart-matcher.yml`

- [ ] **Step 1: Add workspace regression step**

Add:
```yaml
- name: Workspace backup restore regression tests
  run: node tests/packmaster-workspace.test.mjs
```

Do not remove existing Smart Matcher / Local Batch / guardrail checks.

- [ ] **Step 2: Compare branch with main**

Reject any diff touching parser/matcher/qty behavior beyond presentation script include/handlers.

- [ ] **Step 3: Open PR**

PR summary must state:
- local-only JSON backup
- Replace-only restore
- no DB schema change
- no paid service
- no Core change
- tests and browser smoke evidence

- [ ] **Step 4: Merge only after green CI**

- [ ] **Step 5: Wait GitHub Pages deployment**

- [ ] **Step 6: Production smoke**

Verify production assets and a real-browser local backup/restore flow in an isolated Chromium profile. Clean all isolated test data after smoke.

## Definition of Done

- Workspace backup downloads valid schema/versioned JSON
- Backup includes SKU rules, thermal setting, Batch metadata and Batch orders
- Invalid backup never mutates current workspace
- Restore preview appears before any destructive action
- Replace Workspace requires explicit confirmation
- Successful restore survives reload
- Restore failure has recovery attempt and user-facing error
- IndexedDB schema/version unchanged
- Existing parser/matcher/qty/print regressions stay green
- CI, GitHub Pages deployment and production smoke pass
