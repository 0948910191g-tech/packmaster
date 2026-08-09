# PackMaster Keyword Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม Keyword Assistant แบบ local deterministic ที่เสนอ Keyword สั้น 2–3 ตัวเลือกจาก safe source text ของสินค้าใหม่ โดยผู้ใช้ต้องกดเลือกเองและชื่อภายในยังต้องกรอกเอง

**Architecture:** เพิ่ม helper แยก `packmaster-keyword-assistant.js` ที่ไม่มี side effect และไม่แตะ Parser/Matcher/Qty จากนั้นให้ `index.html` เรียก helper เฉพาะตอนเปิด Quick Mapping จาก Review โดยส่ง safe seed เดิม, SKU rules ปัจจุบัน และ raw item texts ใน Active Batch เพื่อทำ conservative collision checks. Suggestions เป็น ephemeral UI state เท่านั้นและไม่เปลี่ยน data shape `{ id, keyword, shortName }`.

**Tech Stack:** Vanilla JS UMD helper, React 18 UMD, Babel standalone, Node `node:test`, GitHub Actions, Playwright/Chromium verification.

## Global Constraints

- ระบบไม่ตั้งชื่อภายในให้เอง
- ระบบไม่เลือกหรือบันทึก Keyword อัตโนมัติ
- ผู้ใช้ต้องกด suggestion เอง
- SKU rule data shape เดิม `{ id, keyword, shortName }` ต้องไม่เปลี่ยน
- Preserve ตัวเลข, model/version, `%`, bundle/pack/variant identity ใน source; ห้ามคูณหรือแก้ค่า
- No Parser / Matcher / Qty / Bundle / Aggregation behavior changes
- No Print / Save PDF engine or scope changes
- No `packmaster-batch.js` changes
- No IndexedDB schema / DB_VERSION changes
- No Database / Backend / Auth / AI API / Cloud / Paid service / telemetry
- Helper failure ต้องไม่ block Quick Mapping; safe seed เดิมยังใช้งานได้

---

### Task 1: Deterministic Keyword Suggestion Helper

**Files:**
- Create: `packmaster-keyword-assistant.js`
- Create: `tests/packmaster-keyword-assistant.test.mjs`

**Interfaces:**
- Consumes: `{ sourceText, existingRules, batchItemTexts, maxSuggestions }`
- Produces: `generateKeywordSuggestions(input) -> Array<{ value, confidence, reason, collisions }>`
- Produces helper exports for testability: `normalizeKeywordText`, `isGenericCandidate`

- [ ] **Step 1: Write failing unit tests**

Cover at minimum:

```js
const source = '(1 แถม 1) ทิชชู่เปียกเครื่องสำอาง EXCARE MAKEUP REMOVER ช่วยขจัดเมคอัพและทำความสะอาดผิว 30 แผ่นใหญ่';
const suggestions = api.generateKeywordSuggestions({ sourceText: source, existingRules: [], batchItemTexts: [source], maxSuggestions: 3 });
assert.equal(suggestions.length > 0, true);
assert.equal(suggestions.some(row => row.value === 'EXCARE'), false);
assert.equal(suggestions.some(row => /30/.test(row.value)), true);
assert.equal(suggestions.some(row => /EXCARE MAKEUP REMOVER/.test(row.value)), true);
```

Also test:
- preserves `V2`, `95%`, bundle token like `5แถม5`
- does not mutate source text
- rejects generic-only candidates (`HOYA`, `HAKU`, `Baby`, `EXCARE`)
- downgrades/rejects candidate that appears across distinct sibling product texts
- returns `[]` for empty/unsafe source
- `maxSuggestions` caps output at 3

- [ ] **Step 2: Run unit test and verify RED**

Run:

```bash
node --test tests/packmaster-keyword-assistant.test.mjs
```

Expected: FAIL because helper module does not exist.

- [ ] **Step 3: Implement minimal pure helper**

Create UMD-style `packmaster-keyword-assistant.js` matching existing helper modules. Implementation rules:
- normalize whitespace/punctuation for analysis only
- derive English/alphanumeric identity runs and meaningful numeric/model tokens
- remove only narrowly-scoped descriptive/promotional noise
- do not remove bundle identity such as `5แถม5`
- candidate generation is deterministic and deduplicated
- collision check uses existing rules + batch item texts conservatively
- generic single-token candidates are never `recommended`
- no persistence/network/DOM access

- [ ] **Step 4: Run unit tests GREEN**

Run:

```bash
node --test tests/packmaster-keyword-assistant.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit helper + tests**

```bash
git add packmaster-keyword-assistant.js tests/packmaster-keyword-assistant.test.mjs
git commit -m "Add local keyword suggestion helper"
```

---

### Task 2: Wire Keyword Assistant Into Quick Mapping

**Files:**
- Modify: `index.html`
- Create: `tests/packmaster-keyword-assistant-ui.test.mjs`

**Interfaces:**
- Consumes `window.PackMasterKeywordAssistant.generateKeywordSuggestions(...)`
- Reuses existing `pilotSafetyApi.getSkuFixSeed(...)`
- Reuses `quickMapState.keyword` and existing `handleSaveQuickMapping`
- Does not change `saveSkuRule` or matcher interfaces

- [ ] **Step 1: Write failing UI contract test**

Assert static/runtime contract markers:
- `<script src="./packmaster-keyword-assistant.js"></script>` exists
- App reads `window.PackMasterKeywordAssistant`
- Quick Mapping renders `Keyword แนะนำ`
- suggestions are clickable and only set `quickMapState.keyword`
- `shortName` initializes as empty string
- original safe seed remains current keyword before a suggestion is clicked
- manual editing remains possible
- fallback copy exists when helper unavailable or returns no suggestions

- [ ] **Step 2: Run UI contract test RED**

```bash
node --test tests/packmaster-keyword-assistant-ui.test.mjs
```

Expected: FAIL because UI is not wired yet.

- [ ] **Step 3: Add helper script and ephemeral suggestion state**

In `index.html`:
- load helper after `packmaster-pilot-safety.js`
- create `const keywordAssistantApi = window.PackMasterKeywordAssistant;`
- extend Quick Mapping ephemeral state only if needed, e.g. `suggestions: []`
- build batch item context from existing `orders[].parsedItems[].text`
- call helper only after safe seed is produced by `getSkuFixSeed`
- on helper error, keep seed and suggestions `[]`

- [ ] **Step 4: Render selectable suggestions**

Under Keyword input render up to 3 compact chips/cards:
- candidate value
- `แนะนำ` badge only for `confidence === 'recommended'`
- click sets `quickMapState.keyword` only
- selected suggestion gets visual selected state
- no suggestion is auto-clicked or auto-saved
- if none: `ยังไม่มี Keyword สั้นที่ระบบแนะนำได้อย่างปลอดภัย — ใช้ชื่อเดิมหรือแก้ Keyword เอง`

- [ ] **Step 5: Verify existing handoff and save path remain unchanged**

`เปิดคลังคำศัพท์` must forward the latest `quickMapState.keyword` and `shortName`; `handleSaveQuickMapping` must still require both keyword + shortName and save through the existing SKU rule path.

- [ ] **Step 6: Run UI contract + existing Quick Mapping/Pilot Safety tests**

```bash
node --test tests/packmaster-keyword-assistant-ui.test.mjs
node --test tests/packmaster-pilot-safety.test.mjs
node --test tests/packmaster-review-exception-mode.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit UI integration**

```bash
git add index.html tests/packmaster-keyword-assistant-ui.test.mjs
git commit -m "Add keyword suggestions to Quick Mapping"
```

---

### Task 3: Permanent Safety / Regression Guard

**Files:**
- Modify: `.github/workflows/apply-smart-matcher.yml`
- Optionally modify: `tests/packmaster-guardrails.test.mjs` only if required for a stable helper guard

**Interfaces:**
- CI runs new helper + UI tests alongside existing suite

- [ ] **Step 1: Add CI steps for both new tests**

Commands:

```bash
node --test tests/packmaster-keyword-assistant.test.mjs
node --test tests/packmaster-keyword-assistant-ui.test.mjs
```

- [ ] **Step 2: Run full regression**

```bash
for f in tests/*.test.mjs; do node --test "$f"; done
```

Expected: all PASS.

- [ ] **Step 3: Verify JSX compile and frozen invariants**

Compile `index.html` JSX with the project’s existing Babel CI method. Verify:
- `packmaster-batch.js` Git blob remains `941bddd557803aa27e58bd23372b9f51d6ca1605`
- Print/Save PDF still iterate/render full `MappedOrders`
- no IndexedDB/DB_VERSION changes
- new helper contains no network primitives

- [ ] **Step 4: Commit permanent CI guard**

```bash
git add .github/workflows/apply-smart-matcher.yml
git commit -m "Test keyword assistant in regression CI"
```

---

### Task 4: Chromium Workflow Verification

**Files:**
- Temporary workflow/script only; remove before final PR diff

**Interfaces:**
- Uses live app behavior on feature branch build/static serve

- [ ] **Step 1: Seed sanitized synthetic Orders**

Include source examples:
- EXCARE MAKEUP REMOVER descriptive long title
- HOYA/HAKU siblings sharing generic brand terms
- model/version case `Hoya V2 ...`
- bundle identity case `5แถม5`

No real customer PII.

- [ ] **Step 2: Exercise Quick Mapping**

Browser assertions:
- Quick Mapping opens with long safe seed still in Keyword field
- 1–3 suggestion choices appear when safe
- generic `EXCARE`/`HOYA` alone is not suggested as recommended
- clicking a candidate updates Keyword only
- shortName remains blank until user types it
- Save disabled/rejected until shortName is entered
- after manual shortName + save, Review updates through existing matcher/rule path
- helper unavailable/no-suggestion fallback still permits manual workflow

- [ ] **Step 3: Verify collision behavior**

Create sibling items where dropping variant/model token would collide. Assert shorter ambiguous candidate is not labeled `แนะนำ` or is omitted.

- [ ] **Step 4: Verify no regression around print safety**

Unresolved Qty/other exception must still block Print/Save PDF; resolving only SKU mapping must not bypass unrelated exceptions.

- [ ] **Step 5: Remove temporary workflow/script**

Final PR must contain no temporary verification workflow.

---

### Task 5: PR, Merge, Deploy, Production Verification

**Files:**
- Permanent diff expected: helper, `index.html`, two tests, CI, spec, plan

- [ ] **Step 1: Review final diff**

Reject merge if any of these changed unexpectedly:
- parser sections
- matcher scoring/identity logic
- Qty parsing/aggregation
- `packmaster-batch.js`
- Print/Save PDF loops
- IndexedDB schema/DB_VERSION

- [ ] **Step 2: Open/refresh PR and wait for clean-head CI**

Expected: all regression checks PASS.

- [ ] **Step 3: Squash merge only tested head**

No force merge; refresh `main` immediately before merge.

- [ ] **Step 4: Verify main release gates**

Require:
- Main Regression PASS
- Production Smoke PASS
- GitHub Pages PASS

- [ ] **Step 5: Run Production Chromium**

On live GitHub Pages verify:
- long unmapped source opens Quick Mapping
- suggestions render and are user-selectable
- no auto-name/auto-save
- saved rule updates Review normally
- no page/console errors
- frozen Batch adapter + full-Batch Print/Save scope remain intact

## Definition of Done

- Quick Mapping retains the original long safe seed as editable fallback
- Up to 3 deterministic local Keyword suggestions are shown when safe
- User must click a suggestion; nothing is selected/saved automatically
- Internal Short Name remains manual
- Generic/colliding candidates are downgraded or omitted
- Model/version/numeric/bundle identity is preserved conservatively
- No matcher/parser/qty/print/batch/database behavior changes
- Full regression + Chromium + Production verification PASS
