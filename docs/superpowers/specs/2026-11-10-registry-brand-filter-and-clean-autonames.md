# PackMaster: Marketplace Registry Brand Filter and Purge of Auto-Generated Names

## Problem Statement

In the PackMaster Marketplace Registry interface ("ผูกทะเบียนสินค้ากับชื่อภายใน PPG"), warehouse managers and packaging teams face two critical workflow obstacles:

1. **Unmanageable Flat Product Catalog:**
   - The registry table lists all ~160+ marketplace products/variants per platform in a single unorganized list.
   - When users need to verify or name a specific brand (e.g., finding all `HOYA Baby` wipes among hundreds of rows), they must either scroll endlessly or type manual search queries.
   - In the "เพิ่ม SKU ใหม่ / ผูกชื่อกับทะเบียน" manual mapping form, the product selection dropdown displays all 160+ items simultaneously, making finding the target item slow and error-prone.

2. **Pollution from Overly Long Auto-Generated Internal Names:**
   - Automated bootstrap logic (`ensureRegistryAssignments` and `defaultInternalName`) previously attempted to ensure 100% naming coverage by copying raw marketplace listing titles into the internal short name field when no verified name existed.
   - This generated 260 artificial internal names consisting of raw 100+ character titles (e.g., `HOYA HAKU Official Jersey เสื้อเบสบอล Unisex รุ่น Everyday Care 24/7 • S` or long marketing copy with promotional text like `(ราคาส่งยกลัง 24ห่อ)HOYA Baby Wipes...`).
   - These runaway titles are completely unusable on physical 100x150mm packing labels, mislead warehouse staff into believing products have verified packing names, and obscure which items genuinely require team naming. The team requires that internal short names be created exclusively by human staff (`ม่วง10`, `ชม10`, `NONO คละ 4ห่อ`, etc.).

## Solution

1. **Brand Filter Chips and Scoped Dropdown Selection:**
   - Introduce a prominent Brand Filter Chips bar above the registry naming table with categorical counts:
     - `ทั้งหมด`
     - `HOYA Baby`
     - `HAKU Baby`
     - `EXCARE`
     - `NONO`
     - `HOYA อื่นๆ` (Wash Gloves, สบู่สปา, แอลกอฮอล์, เจลอโลเวล่า)
     - `สินค้าอื่นๆ` (เสื้อ Jersey, Squishy, กระเป๋า)
   - When a brand chip is selected:
     - The registry table below filters instantly to show only rows belonging to that brand, seamlessly combining with the existing status filters (`ยังไม่ตั้งชื่อ`, `ไม่มี Seller SKU`, etc.) and text search.
     - The "เลือกสินค้า/ตัวเลือกในทะเบียนสำหรับผูก SKU" dropdown in the manual mapping form is scoped to show only products in the selected brand, allowing rapid item selection.

2. **Purge of Auto-Generated Names and Cessation of Default Naming:**
   - Completely disable `defaultInternalName` synthesizing names from marketplace titles in `packmaster-local-registry-bootstrap.js`.
   - Maintain exclusively verified human-curated names from `packmaster-registry-assignments.json` (the 75 baseline verified names) and explicitly saved user entries.
   - Implement an automated migration / cleanup seam that purges existing synthesized long names from `localStorage`, returning unmapped items to a clean empty state with placeholder `"ชื่อสินค้าในคลัง PPG"` and amber status `"รอชื่อภายใน"`.
   - Update registry summary counters to display exact verified counts rather than artificial 100% coverage indicators with `(รวมชื่ออัตโนมัติ)`.

## User Stories

1. As a packing lead, I want to click a "HOYA Baby" filter chip in the registry view, so that I can immediately view and audit all HOYA Baby wipes rows without seeing unrelated products like hand soaps or apparel.
2. As a packing lead, I want to click a "HAKU Baby" filter chip, so that I can focus specifically on HAKU baby wipes variants and their corresponding packaging short names.
3. As a packing lead, I want to click an "EXCARE" filter chip, so that I can review adult wipes, towels, and lens wipes in a single isolated view.
4. As a packing lead, I want to click a "NONO" filter chip, so that I can inspect all NONO baby wipe SKUs and their verified short names.
5. As a packing lead, I want to click a "HOYA อื่นๆ" filter chip, so that I can manage non-wipes items like Wash Gloves, hand wash, and sanitizing gels separately.
6. As a packing lead, I want to click a "สินค้าอื่นๆ" filter chip, so that I can isolate merchandise and novelty products like jerseys and accessories.
7. As a packing lead, I want each brand filter chip to show a live count badge (e.g. `HOYA Baby (20)`), so that I know exactly how many items belong to each brand group on the active platform.
8. As a catalog manager, when I have a brand filter active, I want the "เลือกสินค้า/ตัวเลือกในทะเบียนสำหรับผูก SKU" dropdown in the manual linking form to show only products from that brand, so that I can link new SKUs without scrolling through hundreds of unrelated items.
9. As a catalog manager, I want the brand filter to work seamlessly with the status filter chips (`ทั้งหมด`, `ยังไม่ตั้งชื่อ`, `ไม่มี Seller SKU`), so that I can find "HOYA Baby items that are still unnamed" in two clicks.
10. As a warehouse packer, I want the system to NEVER automatically populate raw marketing titles into the internal short name field, so that labels never print with unreadable 100-character titles.
11. As a warehouse packer, I want items that lack a human-verified short name to display an empty input and an amber "รอชื่อภายใน" status, so that I am never misled into believing an automated title is a verified warehouse name.
12. As a catalog manager, I want previously auto-generated long titles (such as `HOYA HAKU Official Jersey เสื้อเบสบอล Unisex...`) to be purged from my local storage, so that only genuine team-created names remain active.
13. As a catalog manager, I want the header coverage badge to accurately report the number of human-verified names (e.g. `มีชื่อสำหรับจับคู่ 35/169 แถว`), so that our team has an honest picture of our naming progress.
14. As a maintainer, I want brand categorization logic to be deterministic, centralized, and tested against all 325 nameable rows across TikTok and Shopee.
15. As a maintainer, I want existing verified team assignments (such as `ม่วง10`, `ชม10`, `NONO คละ 4ห่อ`, `ฮากุ 2ห่อ`) to remain completely intact throughout the cleanup.

## Implementation Decisions

- **Brand Classification Seam:** Define a pure categorization function `getRegistryBrandCategory(row)` that maps row titles and seller SKUs deterministically into one of six standard keys:
  - `HOYA_BABY`: Products with `hoya`/`โฮญ่า` combined with baby/wipes keywords (`baby`, `เบบี้`, `bb`, `value pack`, `ม่วง`, `ชมพู`, `80แผ่น`, `400 แผ่น`, `สูตรมีกลิ่น`, `สูตรไม่มีกลิ่น`).
  - `HAKU_BABY`: Products with `haku` or `ฮากุ`.
  - `EXCARE`: Products with `excare` or `เอ็กซ์แคร์`.
  - `NONO`: Products with `nono` or `โนโน่`.
  - `HOYA_OTHER`: Products with `hoya` or `โฮญ่า` that do not fall under baby wipes (e.g., Wash Gloves, hand soap, aloe vera, alcohol).
  - `OTHER`: Any other product (jerseys, squishies, bags, etc.).
- **Registry Filter State in `index.html`:**
  - Introduce `registryBrandFilter` state initialized to `'ALL'`.
  - Reset `registryBrandFilter` to `'ALL'` when switching platforms (`marketplaceRegistryPlatformFilter`).
  - Render brand chips directly above the existing status chips in the Marketplace Registry section.
  - Scope `filteredRegistryNameRows` by `registryBrandFilter`.
  - Scope the options of `combobox "เลือกสินค้าในทะเบียนสำหรับผูก SKU"` to rows matching the active `registryBrandFilter`.
- **Bootstrap Deprecation of Synthetic Default Names:**
  - In `packmaster-local-registry-bootstrap.js`, update `ensureRegistryAssignments`:
    - Remove the invocation of `defaultInternalName` for unassigned rows.
    - If a row does not have a verified entry in `assignments`, leave it unassigned (do not insert an artificial `shortName`).
- **Legacy Auto-Name Purge Seam:**
  - Implement a cleanup routine in `index.html` / `packmaster-local-registry-bootstrap.js` that checks existing `registryAssignments`:
    - Any entry whose `shortName` matches a known synthetic pattern (i.e. length > 40 chars, or exactly equals `productName`, or contains raw marketplace marketing suffixes) and was not explicitly included in the team's verified baseline `packmaster-registry-assignments.json` is purged from active assignments.
  - Save the sanitized assignments back to `localStorage`.

## Testing Decisions

- **Good Test Characteristics:**
  - Verify external observable behavior: given catalog rows, brand filtering accurately isolates expected subsets; given unassigned rows, bootstrap produces 0 synthetic names; given an unassigned item, UI renders empty input with "รอชื่อภายใน" status.
  - No coupling to internal loop counter variables or private closures.
- **Modules Tested:**
  - `packmaster-local-registry-bootstrap.js` / brand classification helper: unit tests verifying categorization across all sample products from both TikTok and Shopee.
  - `tests/packmaster-local-registry-bootstrap.test.mjs`: verify bootstrap does not fabricate synthetic entries for unassigned items.
  - `tests/packmaster-registry-naming-ui.test.mjs`: verify brand filter chips exist, active brand scopes the naming table and manual link dropdown, and coverage text reflects verified names only.
  - Browser E2E smoke tests: verify brand chips render correctly, filtering works, and auto-generated jersey/wipes titles no longer appear.
- **Prior Art:**
  - Follow the harness patterns in `tests/packmaster-registry-naming-ui.test.mjs` and `tests/packmaster-local-registry-bootstrap.test.mjs`.

## Out of Scope

- Modifying the underlying marketplace registry JSON schema.
- Changing order PDF parsing or matching logic for already-verified names.
- Adding arbitrary custom user-defined brand tagging rules; brand categories are aligned with PPG's known catalog lines.

## Further Notes

- Full test suite (237 tests) must continue to pass 100%.
- Verified names in `data/packmaster-registry-assignments.json` (75 entries) must be 100% preserved.
