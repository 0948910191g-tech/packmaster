# PackMaster Keyword Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม Keyword Assistant แบบ local deterministic ที่เสนอ Keyword สั้น 2–3 ตัวเลือกจาก safe source text ของสินค้าใหม่ โดยผู้ใช้ต้องกดเลือกเองและชื่อภายในยังต้องกรอกเอง

**Architecture:** เพิ่ม helper แยก `packmaster-keyword-assistant.js` ที่ไม่มี side effect และไม่แตะ Parser/Matcher/Qty. Helper สร้างเฉพาะ candidate ที่เป็น contiguous substring ของ normalized source เพื่อให้เข้ากับ exact matcher path ปัจจุบัน (`searchArea.includes(keyword)`), แล้วตรวจ collision กับ SKU rules และ raw item texts ใน Active Batch. `index.html` ใช้ helper เฉพาะ Quick Mapping; suggestions เป็น ephemeral UI state และ data shape `{ id, keyword, shortName }` ไม่เปลี่ยน

**Tech Stack:** Vanilla JS UMD helper, React 18 UMD, Babel standalone, Node `node:test`, GitHub Actions, Playwright/Chromium.

## Global Constraints

- ไม่ตั้งชื่อภายในให้อัตโนมัติ
- ไม่เลือก/บันทึก Keyword อัตโนมัติ
- Recommended candidate ต้องเป็น contiguous normalized substring ของ source
- ห้ามเอาคำจากคนละตำแหน่งมาต่อเป็น candidate แล้วติดป้าย `แนะนำ`
- Preserve ตัวเลข, model/version, `%`, bundle/pack/variant identity; ห้ามคูณหรือแก้ค่า
- SKU rule data shape เดิม `{ id, keyword, shortName }`
- No Parser / Matcher / Qty / Bundle / Aggregation behavior changes
- No Print / Save PDF engine/scope changes
- No `packmaster-batch.js`, IndexedDB schema, DB_VERSION changes
- No Database / Backend / Auth / AI API / Cloud / Paid service / telemetry
- Helper failure ต้องไม่ block Quick Mapping; safe seed เดิมยังใช้ได้

---

### Task 1: Deterministic Keyword Suggestion Helper

**Files:**
- Create: `packmaster-keyword-assistant.js`
- Create: `tests/packmaster-keyword-assistant.test.mjs`

**Interfaces:**
- Consumes: `{ sourceText, existingRules, batchItemTexts, maxSuggestions }`
- Produces: `generateKeywordSuggestions(input) -> Array<{ value, confidence, reason, collisions }>`
- Test exports: `normalizeKeywordText`, `isGenericCandidate`

- [ ] **Step 1: Write failing tests**

Minimum assertions:

```js
const source = '(1 แถม 1) ทิชชู่เปียกเครื่องสำอาง EXCARE MAKEUP REMOVER ช่วยขจัดเมคอัพและทำความสะอาดผิว 30 แผ่นใหญ่';
const suggestions = api.generateKeywordSuggestions({ sourceText: source, existingRules: [], batchItemTexts: [source], maxSuggestions: 3 });
assert.equal(suggestions.length > 0, true);
assert.equal(suggestions.some(row => row.value === 'EXCARE MAKEUP REMOVER' && row.confidence === 'recommended'), true);
assert.equal(suggestions.some(row => row.value === 'EXCARE'), false);
assert.equal(suggestions.every(row => api.normalizeKeywordText(source).includes(api.normalizeKeywordText(row.value))), true);
assert.equal(suggestions.some(row => row.value === 'EXCARE MAKEUP REMOVER 30' && row.confidence === 'recommended'), false);
```

Also test:
- `V2`, `95%`, `5แถม5` are preserved when present in generated windows
- source text is not mutated
- generic-only candidates (`HOYA`, `HAKU`, `Baby`, `EXCARE`) are rejected
- distinct sibling item collision downgrades/rejects a shorter candidate
- existing rule overlap downgrades/rejects
- empty/unsafe source returns `[]`
- deterministic ordering and `maxSuggestions <= 3`

- [ ] **Step 2: Run test RED**

```bash
node --test tests/packmaster-keyword-assistant.test.mjs
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement pure UMD helper**

Implementation requirements:
- normalize whitespace/zero-width/punctuation for analysis only
- tokenize source preserving source order
- generate contiguous windows only
- prioritize 2–5 token Latin/alphanumeric runs and windows containing model/version/bundle identity
- cautiously allow mixed/Thai windows only if collision checks are clean
- reject generic single-token candidates
- score/dedupe deterministically
- recommended only when source-contiguous + no current collision
- no DOM, persistence, network, parser, matcher invocation, or mutation

- [ ] **Step 4: Run unit tests GREEN**

```bash
node --test tests/packmaster-keyword-assistant.test.mjs
```

- [ ] **Step 5: Commit helper + tests**

```bash
git add packmaster-keyword-assistant.js tests/packmaster-keyword-assistant.test.mjs
git commit -m "Add local keyword suggestion helper"
```

---

### Task 2: Wire Suggestions Into Quick Mapping

**Files:**
- Modify: `index.html`
- Create: `tests/packmaster-keyword-assistant-ui.test.mjs`

**Interfaces:**
- Consumes `window.PackMasterKeywordAssistant.generateKeywordSuggestions(...)`
- Reuses `pilotSafetyApi.getSkuFixSeed(...)`
- Reuses existing `quickMapState.keyword`, `handleSaveQuickMapping`, `saveSkuRule`

- [ ] **Step 1: Write UI contract RED test**

Assert:
- `<script src="./packmaster-keyword-assistant.js"></script>` exists
- app reads `window.PackMasterKeywordAssistant`
- modal renders `Keyword แนะนำ`
- suggestion click only changes `quickMapState.keyword`
- `shortName` starts `''`
- safe seed remains initial keyword until user clicks/edits
- no auto-save / no auto-shortName
- fallback copy exists for no helper/no safe suggestion

- [ ] **Step 2: Run RED**

```bash
node --test tests/packmaster-keyword-assistant-ui.test.mjs
```

- [ ] **Step 3: Add helper script + ephemeral suggestions**

In `index.html`:
- load helper after Pilot Safety
- `const keywordAssistantApi = window.PackMasterKeywordAssistant;`
- when `handleFixSkuException` gets a non-empty safe seed, call helper with `skuRules` and flattened `orders[].parsedItems[].text`
- catch helper failures and preserve original seed + empty suggestions
- no persistence of suggestion metadata

- [ ] **Step 4: Render selectable suggestions**

Under Keyword input:
- max 3 compact buttons/cards
- `แนะนำ` badge only for `confidence === 'recommended'`
- selected state based on current `quickMapState.keyword`
- click updates keyword only
- no safe suggestion → manual fallback copy

- [ ] **Step 5: Preserve existing save/handoff path**

`handleSaveQuickMapping` still requires keyword + manual shortName and saves ordinary rule. `เปิดคลังคำศัพท์` carries latest selected/manual keyword.

- [ ] **Step 6: Run UI + Pilot Safety + Review tests**

```bash
node --test tests/packmaster-keyword-assistant-ui.test.mjs
node --test tests/packmaster-pilot-safety.test.mjs
node --test tests/packmaster-review-exception-mode.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add index.html tests/packmaster-keyword-assistant-ui.test.mjs
git commit -m "Add keyword suggestions to Quick Mapping"
```

---

### Task 3: Permanent Regression Guard

**Files:**
- Modify: `.github/workflows/apply-smart-matcher.yml`

- [ ] Add CI commands:

```bash
node --test tests/packmaster-keyword-assistant.test.mjs
node --test tests/packmaster-keyword-assistant-ui.test.mjs
```

- [ ] Run every `tests/*.test.mjs`
- [ ] Compile JSX with existing Babel CI method
- [ ] Verify frozen `packmaster-batch.js` blob `941bddd557803aa27e58bd23372b9f51d6ca1605`
- [ ] Verify Print/Save PDF still use full `MappedOrders`
- [ ] Verify helper contains no network primitives and DB_VERSION/schema unchanged
- [ ] Commit CI guard

---

### Task 4: Chromium Verification

Use temporary branch workflow only; remove before final diff.

- [ ] Seed sanitized synthetic sources:
  - long EXCARE MAKEUP REMOVER title
  - HOYA/HAKU sibling titles sharing generic terms
  - `Hoya V2 ...`
  - `95%` variant
  - `5แถม5` bundle identity

- [ ] Verify Quick Mapping opens with long safe seed untouched
- [ ] Verify 1–3 suggestions appear when safe
- [ ] Verify recommended suggestions are contiguous in source and generic brand-only keywords are not recommended
- [ ] Click suggestion → Keyword changes; shortName stays blank; no rule saved
- [ ] Enter shortName manually + save → Review updates through existing rule/matcher path
- [ ] Collision sibling → ambiguous short candidate omitted or `review`, never `recommended`
- [ ] Helper unavailable/no suggestions → manual workflow still works
- [ ] Unrelated Qty exception still blocks Print/Save PDF
- [ ] Remove temporary workflow

---

### Task 5: PR / Merge / Production

- [ ] Final diff review: reject if parser/matcher/qty/batch/print/schema changed unexpectedly
- [ ] Clean-head PR CI PASS
- [ ] Refresh latest `main`; squash merge only tested head
- [ ] Main Regression PASS
- [ ] Production Smoke PASS
- [ ] GitHub Pages PASS
- [ ] Production Chromium validates live suggestions, manual shortName, no auto-save, no runtime errors
- [ ] Live frozen Batch adapter and full-Batch Print/Save scope unchanged

## Definition of Done

- Long safe source shows up to 3 shorter local suggestions when safe
- Recommended suggestion stays on exact contiguous matcher path
- User must click; nothing auto-selected/saved
- Internal Short Name remains manual
- Original long seed remains fallback
- Generic/collision-prone candidates are omitted/downgraded
- Model/version/%/bundle identity is preserved conservatively
- Data shape and Core behavior unchanged
- Full regression + Chromium + Production verification PASS
