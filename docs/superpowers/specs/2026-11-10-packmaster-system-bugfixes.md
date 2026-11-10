# PackMaster: Review, naming, print-scope, and performance fixes

## Problem Statement

PackMaster has several reproducible failures across Review, marketplace naming, and printing. When an order contains multiple unnamed products, applying an order-only name to the first product does not advance Review to the next unnamed product. A ready-only print selection can omit a ready order if another marketplace has an order with the same Order ID but is not ready. Conflicting marketplace naming records are reported in the table but can still count as named and disappear from the unnamed filter. The naming table also revalidates the full assignment collection repeatedly while rendering visible rows, which can make editing slow with a large registry.

These problems make it harder to complete Review, can omit eligible orders from print/export, obscure naming conflicts, and slow down catalog maintenance.

## Solution

Make Review choose the next item that still needs a name, using the same effective resolution shown in the order output. Keep logical-order readiness shared across continuation pages within one marketplace while separating orders from different marketplaces. Derive one consistent naming status for assignment state, counters, and filters so conflicts stay visible for review. Reuse validated/indexed naming data across visible rows and renders to keep the naming table responsive as the registry grows.

## User Stories

1. As a packer, I want Review to skip an item already named for this order, so that I can continue through the remaining unnamed items.
2. As a packer, I want Review to consider per-order manual names, so that its next-item choice matches the order output I see.
3. As a packer, I want Review to use the same selection behavior in Local and Cloud workspaces, so that the workflow is predictable in either mode.
4. As a packer, I want an order with several unnamed items to expose each unresolved item in turn, so that I can finish the order without a workaround.
5. As a packer, I want duplicate item text in one order to remain independently reviewable when the system has row-level identity, so that resolving one occurrence does not silently resolve another.
6. As a packer, I want marketplace platform to be part of logical Order identity, so that a Shopee order cannot affect TikTok print readiness when their Order IDs happen to match.
7. As a packer, I want continuation pages for the same logical order and marketplace to share readiness, so that a blocked page cannot leak into Ready-only output.
8. As a packer, I want every page of a ready logical order included in Ready-only output, so that eligible orders print completely.
9. As a packer, I want orders without an Order ID to retain row-level readiness, so that unrelated incomplete records are not grouped together.
10. As a packer, I want Full Batch printing to retain every batch record, so that the explicit full-batch action remains complete.
11. As a catalog manager, I want a conflicting or stale internal name to be marked for review, so that PackMaster does not silently choose a potentially incorrect product name.
12. As a catalog manager, I want conflicting names to appear in the unresolved filter, so that I can find and correct them.
13. As a catalog manager, I want summary counts to treat conflicts as unresolved, so that coverage reflects usable mappings.
14. As a catalog manager, I want the table label, filter, and coverage summary to derive from one row status, so that the interface cannot show contradictory states.
15. As a catalog manager, I want saving a confirmed name for an exact product and variant to resolve the relevant conflict consistently, so that future matching and the naming table agree.
16. As a catalog manager, I want different marketplace platforms to remain isolated, so that identical Seller SKU values cannot share names across shops.
17. As a catalog manager, I want model and variant identities to remain distinct, so that naming one size or option does not change another.
18. As a catalog manager, I want duplicate or ambiguous Seller SKUs to remain in review until a unique catalog row is confirmed, so that an unsafe fallback cannot select a different product.
19. As a catalog manager, I want the naming table to stay responsive while I type, so that editing a registry with many assignments remains practical.
20. As a catalog manager, I want row status calculations to be reused while the registry and assignments are unchanged, so that rendering visible rows does not repeatedly validate the entire assignment collection.
21. As a maintainer, I want existing Local and Cloud assignment persistence and conflict handling to remain compatible, so that the fix does not silently discard saved work.
22. As a maintainer, I want existing parser, quantity, batch, archive, restore, and reprint behavior to remain covered, so that fixing these issues does not regress adjacent workflows.

## Implementation Decisions

- Keep the existing application and module boundaries. Prefer existing Review selection, print-scope, registry identity/matcher, and naming-table seams over introducing a new framework or service.
- Review must evaluate the effective item result, including a per-order manual name, before selecting an item for naming. Pass the actual platform and item identity through existing resolution helpers.
- Logical order grouping for Ready-only print and export must include marketplace platform with Order ID. Keep same-platform continuation pages grouped; keep rows without an Order ID independent; keep Full Batch row-preserving.
- Naming status must be computed consistently for row labels, unnamed/conflict filters, and coverage statistics. An ambiguous, conflicting, or stale mapping is unresolved until explicitly reviewed.
- Reuse prepared assignment and row-state data for rendering and filtering. Recompute it when the marketplace registry or assignments change, not for every visible row on every render.
- Explicitly confirmed naming updates may update records that represent the same exact platform, product, and model/variant identity. Preserve other assignment records and keep ambiguous identities fail-closed.
- Do not change print completion semantics, introduce fuzzy title matching, infer a Seller SKU, merge identities across platforms, or change the workspace storage schema unless required by a separately reviewed migration.

## Testing Decisions

- Prefer behavior tests that assert what the packer or catalog manager sees and what is selected for Review or print, rather than asserting private implementation details.
- Use one end-to-end behavioral harness where practical to exercise Review selection, effective item resolution, naming status/filter/count, and print selection; retain focused tests for module-level identity and logical-order rules.
- Review tests should cover multiple unresolved items, an already-applied manual override, repeated item text, both Local and Cloud behavior, and a platform-specific registry match.
- Print-scope tests should cover same Order ID across platforms, same-platform continuation pages with ready and blocked states, missing Order IDs, and Full Batch row preservation.
- Naming tests should cover matching names, conflicting Seller SKU/catalog names, stale identities after a SKU change, explicit conflict resolution, duplicate SKU ambiguity, missing SKU, distinct variants, platform isolation, filters, and summary counts.
- Performance tests should measure representative naming-table work at small and large assignment counts and assert that full assignment validation/indexing is not repeated for each visible row. Avoid a brittle machine-specific wall-clock threshold as the sole acceptance criterion.
- Run the existing `node --test tests/*.test.mjs` suite and syntax checks for changed runtime modules. Similar prior art exists in matcher identity, Review override, print scope, naming UI, active batch, and workspace restore tests.

## Out of Scope

- Fixing every potential defect in PackMaster or certifying every browser, Cloud, PDF, and printer combination.
- Changing parser extraction rules without a sanitized PDF fixture that reproduces a parser-specific defect.
- Changing what `COMPLETED` or `printedAt` means; the project audit explicitly leaves that product decision unresolved.
- Adding a database, login system, analytics, new dependency, or cross-platform shared SKU identity.
- Deploying, publishing, or changing production configuration as part of implementation.

## Further Notes

- Findings were reproduced locally against the current PackMaster worktree with synthetic data. No customer PDF or real order was available to confirm the reported missing product case.
- The four findings are documented in the system audit report dated 2026-11-10. The existing suite passed 221 tests; a focused audit harness produced four expected failures before these issues are fixed.
- Proposed behavioral seams were confirmed by the user: Review, print, conflicting-name filters, and performance.
- The project issue-tracker setup file and triage label vocabulary are currently missing. Publish this spec to the configured tracker with the `ready-for-agent` label after running `/setup-matt-pocock-skills` and discovering the actual tracker and supported label vocabulary.
