# PackMaster Collapsible Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม Sidebar แบบย่อ/ขยายได้บน Desktop และ Drawer บน Mobile เพื่อคืนพื้นที่แนวนอนให้ Review & Print โดยไม่แตะ Core packing behavior

**Architecture:** ใช้ state presentation-only ใน `index.html`: `sidebarCollapsed` สำหรับ desktop preference และ `mobileSidebarOpen` สำหรับ drawer ชั่วคราว โดย reuse `activeView`/`navigateView` เดิมทั้งหมด. Persist เฉพาะ desktop preference ผ่าน `localStorage` key `packmasterSidebarCollapsedV1`; mobile drawer ไม่ persist. CSS class/data attributes คุม width, visibility และ responsive behavior โดยไม่เปลี่ยน LabelCard/Print layout.

**Tech Stack:** React 18 UMD + Babel standalone, Tailwind utility classes, inline CSS ใน `index.html`, localStorage, Node-based regression tests, Playwright/Chromium ผ่าน GitHub Actions สำหรับ browser smoke

## Global Constraints
- Desktop expanded width ประมาณ `205px`; collapsed width `68px`
- ไม่มี auto-hover expand และไม่มี auto-collapse ตอนเข้า Review
- Collapsed nav แสดง icon และ tooltip/title แต่ accessible name ต้องยังอยู่
- Persist เฉพาะ `sidebarCollapsed` ด้วย `localStorage` key `packmasterSidebarCollapsedV1`
- Mobile ใช้ off-canvas drawer + backdrop; `mobileSidebarOpen` ห้าม persist
- Primary nav ยังคง `งานแพ็ก / คลังคำศัพท์ / รีวิว & พิมพ์`
- Upload/Safety secondary tools ยังใช้งานได้
- ห้ามแก้ Parser / Matcher / Qty / Bundle / Quantity Aggregation / Print / Save PDF engine
- ห้ามแก้ `packmaster-batch.js`, DB_VERSION, IndexedDB schema, Database/Backend/Auth/Cloud/Paid service
- Print/Save PDF scope ต้องยังเป็น Active Batch ทั้งหมด

---

### Task 1: Desktop collapse state, persistence, and layout

**Files:**
- Modify: `index.html`
- Create: `tests/packmaster-collapsible-sidebar.test.mjs`

**Interfaces:**
- Consumes: existing `activeView`, `navigateView`, `.pm-sidebar`, `.pm-main`, `data-pm-primary-nav`, `data-pm-secondary-nav`
- Produces: `sidebarCollapsed:boolean`, `toggleSidebar()`, `data-pm-sidebar`, `data-pm-sidebar-collapsed`, `data-pm-sidebar-toggle`

- [ ] **Step 1: Write the failing desktop contract test**

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /packmasterSidebarCollapsedV1/);
assert.match(html, /data-pm-sidebar/);
assert.match(html, /data-pm-sidebar-toggle/);
assert.match(html, /68px/);
assert.match(html, /205px/);
assert.match(html, /aria-expanded/);
console.log('PackMaster collapsible sidebar static contract passed');
```

- [ ] **Step 2: Run test to verify RED**

Run: `node tests/packmaster-collapsible-sidebar.test.mjs`
Expected: FAIL because collapse markers/state are absent

- [ ] **Step 3: Add minimal desktop state and safe persistence**

Implementation shape in `App()`:

```jsx
const SIDEBAR_STORAGE_KEY = 'packmasterSidebarCollapsedV1';
const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
  try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'; }
  catch { return false; }
});

const toggleSidebar = () => {
  setSidebarCollapsed(current => {
    const next = !current;
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0'); } catch {}
    return next;
  });
};
```

Desktop sidebar markup must include stable markers and accessible toggle:

```jsx
<aside
  id="packmaster-sidebar"
  data-pm-sidebar
  data-pm-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}
  className={`pm-sidebar ${sidebarCollapsed ? 'pm-sidebar-collapsed' : ''}`}
>
  <button
    type="button"
    data-pm-sidebar-toggle
    aria-controls="packmaster-sidebar"
    aria-expanded={!sidebarCollapsed}
    aria-label={sidebarCollapsed ? 'ขยายเมนูด้านข้าง' : 'ย่อเมนูด้านข้าง'}
    onClick={toggleSidebar}
  >...</button>
</aside>
```

CSS contract:

```css
.pm-sidebar { width:205px; flex:0 0 205px; transition:width .18s ease, flex-basis .18s ease; }
.pm-sidebar.pm-sidebar-collapsed { width:68px; flex-basis:68px; }
.pm-sidebar-collapsed .pm-nav-label,
.pm-sidebar-collapsed .pm-sidebar-section-label,
.pm-sidebar-collapsed .pm-local-workspace-copy { display:none; }
.pm-sidebar-collapsed .pm-nav-btn { justify-content:center; padding-left:0; padding-right:0; }
```

- [ ] **Step 4: Keep nav names accessible while hiding visual labels**

Each nav button must retain `aria-label={label}` and `title={sidebarCollapsed ? label : undefined}`; visible label uses `.pm-nav-label`.

- [ ] **Step 5: Run desktop contract + existing UI tests**

Run:
```bash
node tests/packmaster-collapsible-sidebar.test.mjs
node tests/packmaster-navigation-usability.test.mjs
node tests/packmaster-frontend-v3-ui.test.mjs
node tests/packmaster-hybrid-review-grid.test.mjs
```
Expected: PASS

### Task 2: Mobile off-canvas drawer

**Files:**
- Modify: `index.html`
- Modify: `tests/packmaster-collapsible-sidebar.test.mjs`

**Interfaces:**
- Consumes: sidebar markup from Task 1 and existing `navigateView(view)`
- Produces: `mobileSidebarOpen:boolean`, `data-pm-mobile-menu`, `data-pm-sidebar-backdrop`, `closeMobileSidebar()`

- [ ] **Step 1: Extend failing test for mobile contract**

Add assertions:

```js
assert.match(html, /data-pm-mobile-menu/);
assert.match(html, /data-pm-sidebar-backdrop/);
assert.match(html, /mobileSidebarOpen/);
assert.match(html, /@media\s*\(max-width:\s*900px\)/);
```

- [ ] **Step 2: Add ephemeral mobile drawer state**

```jsx
const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
const closeMobileSidebar = () => setMobileSidebarOpen(false);
```

`navigateView` must keep its existing business behavior and additionally close the drawer after navigation:

```jsx
const navigateView = (view) => {
  // existing logic unchanged
  setActiveView(view);
  setMobileSidebarOpen(false);
};
```

- [ ] **Step 3: Add mobile header menu button and backdrop**

```jsx
<button
  type="button"
  data-pm-mobile-menu
  aria-controls="packmaster-sidebar"
  aria-expanded={mobileSidebarOpen}
  aria-label="เปิดเมนู"
  onClick={() => setMobileSidebarOpen(true)}
>...</button>

{mobileSidebarOpen && (
  <button
    type="button"
    data-pm-sidebar-backdrop
    aria-label="ปิดเมนู"
    onClick={closeMobileSidebar}
  />
)}
```

- [ ] **Step 4: Add responsive CSS**

```css
.pm-mobile-menu { display:none; }
@media (max-width:900px) {
  .pm-mobile-menu { display:inline-flex; }
  .pm-sidebar { position:fixed; top:82px; left:0; width:205px !important; height:calc(100vh - 82px); transform:translateX(-105%); z-index:70; transition:transform .18s ease; }
  .pm-sidebar.pm-sidebar-mobile-open { transform:translateX(0); }
  .pm-sidebar-backdrop { position:fixed; inset:82px 0 0; background:rgba(4,18,36,.42); z-index:60; }
  .pm-main { width:100%; }
}
```

- [ ] **Step 5: Add Escape close without dependencies**

Use one effect:

```jsx
useEffect(() => {
  if (!mobileSidebarOpen) return undefined;
  const onKeyDown = (event) => { if (event.key === 'Escape') setMobileSidebarOpen(false); };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [mobileSidebarOpen]);
```

- [ ] **Step 6: Run static contracts again**

Run: `node tests/packmaster-collapsible-sidebar.test.mjs`
Expected: PASS

### Task 3: Permanent CI guard and core invariants

**Files:**
- Modify: `.github/workflows/apply-smart-matcher.yml`
- Test: `tests/packmaster-collapsible-sidebar.test.mjs`
- Existing Test: `tests/packmaster-guardrails.test.mjs`

**Interfaces:**
- Produces: permanent CI step `Collapsible sidebar UI guard`

- [ ] **Step 1: Add CI step**

```yaml
      - name: Collapsible sidebar UI guard
        run: node tests/packmaster-collapsible-sidebar.test.mjs
```

Place next to other Frontend usability guards.

- [ ] **Step 2: Run full regression suite / JSX compile / guards**

Run all Node tests listed in `.github/workflows/apply-smart-matcher.yml`, then compile JSX with Babel in the temporary runner and run:

```bash
node tests/packmaster-guardrails.test.mjs
git diff --check
```

Expected: all PASS and frozen `packmaster-batch.js` hash unchanged.

### Task 4: Chromium behavior verification

**Files:**
- Temporary workflow only on feature/verification branch; delete before final PR diff

**Interfaces:**
- Verifies desktop + mobile real browser behavior

- [ ] **Step 1: Desktop Chromium checks at 1536x820**

Verify:
- initial width about 205px
- click toggle → about 68px
- `pm-main` width increases
- active nav still clickable
- tooltip/title exists in collapsed mode
- reload preserves collapsed preference
- expand returns about 205px
- Review fixed action bar remains `position:fixed`

- [ ] **Step 2: Mobile Chromium checks at 390x844**

Verify:
- sidebar starts off-canvas even if desktop preference is collapsed
- mobile menu button opens 205px drawer
- backdrop closes drawer
- open again and select nav → drawer closes
- Escape closes drawer
- no horizontal document overflow caused by sidebar

- [ ] **Step 3: Safety checks**

Verify live/static source still contains full-Batch Print/Save paths and `packmaster-batch.js` Git blob hash remains `941bddd557803aa27e58bd23372b9f51d6ca1605`.

### Task 5: PR, merge, deploy, production verification

**Files:**
- Final diff expected: `index.html`, `tests/packmaster-collapsible-sidebar.test.mjs`, `.github/workflows/apply-smart-matcher.yml`, this plan doc

- [ ] **Step 1: Review final diff**

Reject any diff touching parser/matcher/qty/print modules, `packmaster-batch.js`, schema/storage runtime modules, or temporary workflows.

- [ ] **Step 2: Open PR and require merge-result CI**

PR summary must list desktop collapse, persistence, mobile drawer, accessibility, and safety restrictions.

- [ ] **Step 3: Squash merge only after CI passes**

- [ ] **Step 4: Verify main release gates**

Require:
- `PackMaster Regression Tests` success
- `PackMaster Production Smoke` success
- GitHub Pages build/deploy success

- [ ] **Step 5: Run Production Chromium desktop + mobile verification**

Use isolated synthetic browser-local data only; no real customer PII.

- [ ] **Step 6: Confirm latest main SHA has not advanced during verification**

## Definition of Done
- Desktop sidebar toggles 205px ↔ 68px and persists locally
- Collapsed mode restores meaningful Review workspace width
- Mobile uses off-canvas drawer and does not inherit desktop collapsed layout visually
- Backdrop/nav/Escape close mobile drawer
- Primary and secondary navigation remain functional
- Review fixed action bar and Hybrid Grid remain intact
- Print/Save PDF full-Batch invariant remains unchanged
- Frozen Batch adapter remains byte-for-byte unchanged
- Full regression, JSX compile, branch Chromium, PR CI, main CI, Pages and production Chromium all pass
