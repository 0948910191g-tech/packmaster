# PackMaster Safety Audit Tickets — 2026-09-14

Approved breakdown from the Windows full-code audit. Execute one ticket per fresh agent context/worktree where practical.

## Dependency graph
- 01 Review Fail Closed — no blocker
- 02 Matcher Identity Gate — no blocker
- 03 Logical Order Print Scope — blocked by 01
- 04 Duplicate Current Upload — no blocker
- 05 SKU Dictionary Integrity — blocked by 02
- 06 Workspace Restore Validation — no blocker
- 07 Save-before-Batch-Transition — no blocker
- 08 Stable Batch Reprint Snapshot — blocked by 01, 02, 07
- 09 Item-level Qty Override — no blocker
- 10 Local Safety Metadata Health — no blocker

## Starting frontier
01, 02, 04, 06, 07, 09, 10 can start independently.

## Execution rules
1. Read actual code before editing; do not guess architecture.
2. For Matcher/Qty/Parser safety work, failing regression first, then minimal fix.
3. Do not refactor Parser while doing UI/state/matcher tickets unless a real fixture proves parser root cause.
4. Run relevant tests plus full suite before completion; document any pre-existing/stale test separately.
5. One ticket = one focused PR/change set where practical; do not bundle unrelated bugs.
6. No new framework/dependency/database/login/cloud unless explicitly approved.
7. Never commit customer PII/PDF fixtures; sanitize any real failure fixture.

## Decision required — not yet a ticket
Print completion semantics remain unresolved: whether Completed means print dialog opened, PDF/print initiated, or staff explicitly confirmed physical completion.
Do not change `Completed/printedAt` semantics until this product decision is made.