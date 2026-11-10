# PackMaster: Unblock SKU Naming, Registry Matching, and UI Dead Code Cleanup

## Problem Statement

When processing shipping labels, PackMaster frequently marks orders as unnamed (`ยังไม่ตั้งชื่อ (เพิ่มกฎ SKU)`) because the seller SKU printed on the PDF does not match the historical registry snapshot (for example, when an order's SKU text was slightly modified in TikTok Shop). When the user attempts to resolve this:

1. **Review Permanent Save Blocked:** The Review modal provides an option to permanently bind the seller SKU to the internal database (`บันทึกชื่อในทะเบียน`), but this action throws a hard error (`ไม่พบแถวทะเบียนที่ระบุตัวได้แบบแน่นอน`) because the resolver rejects any SKU not present in the pre-existing static marketplace catalog.
2. **Missing Product in Naming Table:** When navigating to the marketplace catalog naming screen to name the item, searching for the PDF's SKU yields zero results because the table lists only pre-imported catalog rows, not unmapped SKUs extracted from incoming orders. Furthermore, the true product listing in the registry appears as already mapped (`มีชื่อสำหรับจับคู่`), leaving no visible row or form for the user to map the newly introduced SKU.
3. **Dead Code and UI Traps:** Legacy "Keyword Rule" screens are hidden behind disabled UI conditions (`{false && ...}`) and stubbed out with early returns, yet order warning banners still instruct users to "เพิ่มกฎ SKU" in the disabled screens.
4. **Self-Inflicted Bootstrap Conflicts:** On startup, automated registry bootstrap logic introduces false conflicts:
   - 15 existing TikTok assignments are falsely marked as ambiguous (`registry_identity_changed`) because variant names in the assignments store default to null while the registry entries have non-null variant strings.
   - 10 Shopee assignments are marked as conflicting (`registry_name_conflict_or_stale`) because bootstrap generates automatic seller SKU assignments that clash with pre-existing catalog row assignments.
   - 8 TikTok product-only rows without variants are skipped by the bootstrap assignment generator.

Together, these flaws create a UX dead end where users cannot map new SKUs, cannot save names to the database, and face 25 artificially broken rows in their catalog.

## Solution

1. **Unblock Database Persistence & Linking in Review:**
   - In the Review exception modal, when an incoming seller SKU is not found in the static registry, permit the user to link the SKU directly to an identified catalog product or save the explicit seller SKU assignment directly into the persistent assignments store.
   - When an order item's explicit seller SKU is unmapped but its product title uniquely identifies a single catalog product (with zero competing variants), allow identity resolution to fall back safely to that unique product listing.
2. **Add Direct SKU Mapping in Registry Catalog Screen:**
   - Provide an explicit "เพิ่ม SKU ใหม่ / ผูกชื่อกับทะเบียน" entry form on the Marketplace Registry screen, allowing users to manually register newly discovered SKUs and map them to existing products without needing an external JSON export.
   - Update error copy: change misleading instructions like "เพิ่มกฎ SKU" to "ไม่พบ Seller SKU ในทะเบียน" with clear guidance.
3. **Clean Up Legacy Dead Code:**
   - Remove dead keyword-dictionary blocks hidden behind `false` conditions and stubbed handlers, establishing the marketplace registry as the single source of truth for product naming.
4. **Fix Self-Inflicted Bootstrap and Variant Matching Logic:**
   - Update registry matcher identity validation so that a seller SKU assignment with a null variant name is not falsely invalidated against a catalog row with a variant name, resolving the 15 false TikTok ambiguities.
   - Update the bootstrap process to check both seller SKU and catalog row keys before injecting default names, preventing the 10 Shopee naming conflicts.
   - Ensure bootstrap processes `product_only` rows from the registry so all nameable products receive default internal names.

## User Stories

1. As a packer, I want orders with newly updated or slightly altered TikTok seller SKUs to automatically resolve to their product when the product title uniquely identifies that item, so that I do not have to manually review obvious matches.
2. As a packer, I want to click "บันทึกชื่อในทะเบียน" in the Review exception modal and have the new seller SKU successfully saved to the persistent database, so that subsequent orders with the same SKU match automatically.
3. As a packer, I want clear and accurate status messages on order cards instead of "เพิ่มกฎ SKU", so that I understand whether an item lacks an internal name or has an unmapped seller SKU.
4. As a catalog manager, I want an "Add / Link SKU" action on the Marketplace Registry page, so that I can register a new seller SKU discovered from orders directly in the application.
5. As a catalog manager, I want to search for an order's seller SKU in the Marketplace Registry and easily find or associate it with the correct catalog product.
6. As a catalog manager, I want pre-existing TikTok seller SKU assignments to remain valid without being falsely marked as ambiguous on application startup.
7. As a catalog manager, I want Shopee catalog row assignments to be preserved without being overwritten by default bootstrap values that cause naming conflicts.
8. As a catalog manager, I want products without variant rows (`product_only`) to be initialized properly during bootstrap so they can be named and matched.
9. As a catalog manager, I want the "ยังไม่ตั้งชื่อ" filter in the registry table to show only genuinely unmapped items, rather than false conflicts caused by startup scripts.
10. As a maintainer, I want unused legacy keyword rule forms and stubbed handlers removed, so that the codebase has a single, maintainable naming pipeline.
11. As a maintainer, I want workspace backup and restore to properly serialize, count, and restore marketplace registry assignments, ensuring user data is preserved across devices.
12. As a maintainer, I want full regression test coverage verifying that new SKUs can be mapped, saved, and resolved without breaking existing assignments.

## Implementation Decisions

- **Identity Resolution Fallback Seam:** When an explicit seller SKU does not exist in the platform registry index, examine the normalized product title. If the product title matches exactly one catalog item and that item has a single unambiguous SKU/variant, resolve to that candidate. If multiple candidates or variants exist, fail closed as unmatched or ambiguous.
- **Review Modal SKU Mapping Seam:** In the Review exception modal, allow saving confirmed assignments for explicit seller SKUs by linking them to the canonical evidence of the resolved product, rather than rejecting the save when the SKU string was absent from the initial catalog import.
- **Variant Name Nullability in Seller SKU Matcher:** When an assignment has `identityType === 'seller_sku'`, treat `variantName: null` as compatible with a candidate carrying a non-null variant name, provided the `productId` matches. Continue requiring strict variant equality when `identityType === 'catalog_row'`.
- **Bootstrap Deduplication Seam:** In the local registry bootstrap module, verify both the seller SKU key and the catalog row key before creating a default assignment. If an assignment already exists under either key, retain the existing short name to prevent creating colliding duplicate assignments.
- **Registry Table Actions Seam:** On the Marketplace Registry screen, provide an inline modal or form to map an ad-hoc seller SKU to any listed product ID and model ID, persisting the result using existing assignment storage APIs.
- **Dead Code Retirement:** Purge dormant code blocks associated with the legacy `skuRules` dictionary in the main UI script, redirecting all naming and testing widgets exclusively to the registry matcher.

## Testing Decisions

- **Behavioral End-to-End Tests:**
  - Verify that real parsed items from problem PDF pages (e.g. Page 14 and Page 20 of `tt10-11-3.pdf`) resolve correctly and display expected internal names.
  - Verify that saving a previously unknown seller SKU from the Review modal persists the assignment to local/cloud storage and marks subsequent matching passes as `matched`.
  - Verify that the Marketplace Registry "ยังไม่ตั้งชื่อ" filter count drops from 23 to 0 on TikTok and from 10 to 0 on Shopee after clean bootstrap without manual intervention.
- **Module Unit Tests:**
  - Test identity resolution with unmapped seller SKUs and unique vs. non-unique product titles.
  - Test registry matcher variant name compatibility for seller SKU entries.
  - Test bootstrap assignment generation across `product_sku`, `variant`, and `product_only` row types.
- **Prior Art:**
  - Follow the harness patterns in `tests/packmaster-naming-consistency.test.mjs` and `06-Operations/Runs/2026-11-10-packmaster-system-audit-repro.cjs`.

## Out of Scope

- Introducing fuzzy or probabilistic string matching for product titles; all fallback matching must be strictly exact and unambiguous.
- Modifying PDF parsing coordinate extraction or low-level font decoding algorithms.
- Changing Cloudflare Worker backend schema or authentication flows.
- Replacing the core React/Babel in-browser architecture of PackMaster.

## Further Notes

- Existing regression suite (225 passing tests) must continue to pass 100%.
- A deterministic repro harness verifying the 5 core issues was established in `scratch/repro-ux-and-db-bug.cjs` and confirmed red before implementation.
