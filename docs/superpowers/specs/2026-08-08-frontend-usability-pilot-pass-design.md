# PackMaster Frontend Usability Pilot Pass — Design

Date: 2026-08-08
Project: PackMaster
Base commit: `bf1c222608085538940689b3ccafb5631c0b71d3`
Status: Approved direction from user conversation; ready for implementation planning

## 1. Goal

Improve PackMaster Frontend usability before External Pilot without changing stable packing core behavior.

The pass must reduce clicks, reduce the chance of working in the wrong Batch, and make the next required action obvious. It should reinforce the product mental model:

`Create/Select Batch → Upload → Auto-process → Resolve Exceptions → Ready → Print`

## 2. Product Success Criteria

The UI should answer three questions quickly on every operational screen:

1. Which Batch am I working on?
2. Is anything blocking print?
3. What should I do next?

The pass is successful when an operator can move through a Batch without needing to understand storage architecture, exception internals, or navigation structure.

## 3. Approaches Considered

### A. Full workflow redesign / new app shell

Pros:
- Maximum visual simplification.

Cons:
- High regression risk.
- Would duplicate or rewrite existing Batch/Review behavior.
- Not justified before Pilot.

Decision: Reject.

### B. Progressive enhancement of existing V3 state and handlers

Pros:
- Reuses current `activeView`, Batch state, Exception Inbox, print safety, SKU prefill, and existing storage modules.
- Minimal risk to Parser/Matcher/Qty/Print behavior.
- Easy to regression-test.

Cons:
- `index.html` remains large.

Decision: **Selected.**

### C. Add a separate packing-wizard layer

Pros:
- Strong guided flow.

Cons:
- Creates a second navigation/state model on top of the current one.
- More complexity than the Pilot needs.

Decision: Reject for now.

## 4. Scope

### 4.1 Active Batch Bar

Add a persistent context bar below the command header on operational views when an Active Batch exists.

It shows:
- Batch display name / sequence.
- Total orders.
- Ready count.
- Exception count.
- Readiness percentage.
- Primary next action.

Behavior:
- If exceptions > 0: primary CTA = `แก้รายการที่ต้องตรวจ N` and opens Review in Exception Mode.
- If exceptions = 0 and orders > 0: primary CTA = `พิมพ์ Batch` and opens Review.
- Secondary CTA = `กลับงานแพ็ก`.
- On Batch page itself, the bar may use a compact presentation or remain hidden to avoid duplication.

No new persisted data. Everything is derived from current active Batch/order state.

### 4.2 Exception Mode

Add a Review presentation mode derived from the existing `exceptionRows`.

Entry points:
- Active Batch Bar.
- Review summary card / dedicated CTA.
- Sticky bottom action bar.

Behavior:
- Set Review to show only orders with unresolved exceptions.
- Preserve priority order: Qty > SKU > Unmapped, matching current exception-first safety philosophy.
- Keep existing Search / Platform / Status tools available.
- Provide `ออกจากโหมดตรวจปัญหา` to return to normal Review.
- When the last exception is resolved, show a Ready success state and expose Print CTA.

No second persisted exception source of truth.

### 4.3 Sticky Review Action Bar

Add a sticky bottom action bar only on the Review workspace when there are orders.

If exceptions remain:
- Show `พร้อม X / ทั้งหมด Y` and `ต้องตรวจ N`.
- Primary CTA = `แก้ N รายการ`.
- Print action remains visibly locked/disabled according to existing Pilot Print Safety.

If no exceptions remain:
- Show `พร้อมพิมพ์ Y/Y`.
- Actions = `Save PDF` and `พิมพ์ Y ใบ` using existing handlers and full Active Batch scope.

The bar must not change Print/Save PDF scope based on filters or current viewport.

### 4.4 Navigation Simplification

Primary Sidebar navigation becomes:
- `งานแพ็ก`
- `คลังคำศัพท์`
- `รีวิว & พิมพ์`

Secondary destinations:
- Upload remains a real view but is entered through the active Batch workflow and top command action.
- Safety remains a real view but moves under a compact `เครื่องมือ / ความปลอดภัย` secondary entry instead of equal primary prominence.

Requirements:
- Do not delete Upload or Safety functionality.
- Existing deep/internal navigation using `navigateView('upload')` and `navigateView('safety')` must keep working.
- Mobile navigation follows the same primary/secondary hierarchy.

### 4.5 Start Packing Flow

Change the prominent Batch CTA from the technical wording `สร้าง Batch ใหม่` to the operational wording `เริ่มงานแพ็กใหม่` where appropriate.

Behavior:
- Reuse current Batch creation handler.
- After successful Batch creation, enter Upload automatically if the current handler can safely support that without changing Batch persistence behavior.
- If current create handler already navigates, preserve it.
- If creation fails, remain on current view and show existing error feedback.

No hidden Batch creation during raw Upload. The user must still explicitly initiate a new packing job.

### 4.6 Quick Mapping in Review

Current behavior sends a SKU/Unmapped exception to SKU Library with a safe prefilled Keyword.

Replace the default path with an inline Review quick-mapping panel/modal that reuses the same safe seed generated by `pilotSafetyApi.getSkuFixSeed`.

Panel fields:
- Source Keyword (prefilled, editable only under the same safety rules as current SKU form).
- Internal Short Name.
- Preview/output explanation.
- Count of currently affected Review orders if this can be computed from existing matching data without introducing new matcher behavior.

Actions:
- `บันทึกและใช้` uses the existing SKU rule creation path/state shape.
- `เปิดคลังคำศัพท์` remains available for advanced editing.
- Cancel returns to Review without mutation.

After save:
- Recompute Review from existing mapping state exactly as the current SKU Library flow does.
- If the current exception is resolved, remain in Exception Mode and surface the next unresolved item.
- Never auto-save a generated Internal Short Name. User must enter/confirm it.

For Qty exceptions, do not offer Quick Mapping; retain current safe Review behavior.

## 5. Visual Hierarchy

Keep Frontend V3 design language:
- Navy / white / soft gray.
- Operational, warehouse-friendly.
- Clear green/amber/red status semantics.
- Existing rounded cards and compact typography.

Priority hierarchy:
1. Current Batch context.
2. Blocking exception count.
3. Internal SKU / packing output.
4. Next action.
5. Marketplace/order metadata.

Avoid adding decorative dashboard elements that do not speed packing or reduce mistakes.

## 6. Data Flow

All new behavior is presentation-derived from existing state:

- Active Batch Bar ← active Batch meta + current order summaries.
- Exception Mode ← existing `exceptionRows` / `getReviewFlags`.
- Sticky action bar ← existing readiness and Pilot Print Safety result.
- Quick Mapping seed ← existing `pilotSafetyApi.getSkuFixSeed`.
- Quick Mapping save ← existing local SKU rule state/handler/data shape.

No new IndexedDB store, DB version, network service, auth, telemetry, or cloud state.

## 7. Error Handling

- No active Batch: Active Batch Bar hidden; Upload continues to require Batch selection/creation.
- Empty Batch: show Batch context but no Print CTA.
- Quick Mapping has no safe seed: keep current fallback that opens the order/list context and reports that automatic prefill is unsafe.
- Quick Mapping invalid/empty short name: do not save.
- Rule save failure: keep panel open and show an error; do not advance exception cursor.
- Filters produce zero orders: current safe empty state remains.
- Print safety remains authoritative even if UI summary state becomes stale.

## 8. Hard Restrictions

Do not modify behavior in:
- Shopee Parser.
- TikTok Parser.
- Multi-SKU parsing.
- Qty parsing.
- SKU matcher algorithm.
- Bundle matching.
- Quantity aggregation.
- Print engine.
- Save PDF engine.
- `packmaster-batch.js`.
- IndexedDB schema / `DB_VERSION`.

Do not add:
- Database / Supabase / Firebase.
- Backend.
- Login/Auth.
- Paid service.
- Telemetry/analytics backend.
- New dependency unless essential (none expected).

Review filters / Exception Mode are presentation scope only. Print and Save PDF must continue to operate on the full Active Batch order set according to existing safety contracts.

## 9. Testing

### Existing regression suite

All current tests must remain green, including:
- Smart Matcher.
- Local Batch.
- Workspace Backup/Restore.
- Duplicate Detection.
- Exception Inbox.
- Archive lifecycle.
- Storage Health.
- Diagnostics privacy.
- Pilot hardening/safety.
- Frontend V3.
- Hybrid Review layout.
- Production Smoke contract.

### New usability contracts

1. Active Batch Bar appears on operational views for an active Batch.
2. Bar shows batch context and derived Ready/Exception counts.
3. Exception CTA enters Exception Mode.
4. Exception Mode renders only unresolved exception orders.
5. Exception Mode can be exited safely.
6. Last resolved exception changes UI to Ready/Print state.
7. Sticky Review action bar reflects print-lock state.
8. Sticky Print/Save actions use full Active Batch scope.
9. Primary sidebar shows only three primary workspaces.
10. Upload and Safety remain reachable and functional.
11. `เริ่มงานแพ็กใหม่` creates a normal Batch using current persistence.
12. Successful start flow enters Upload without hidden Batch creation.
13. Quick Mapping uses the safe exception seed.
14. Quick Mapping cannot save an empty short name.
15. Quick Mapping adds the same SKU rule shape used by SKU Library.
16. Qty exceptions do not expose SKU Quick Mapping.
17. Search/Platform/Status filters continue to work.
18. Hybrid Review grid remains default and responsive.
19. `packmaster-batch.js` remains byte-for-byte unchanged.
20. Print/Save PDF scope invariant remains unchanged.

### Browser smoke

Exercise in Chromium:
- Create/start Batch.
- Confirm Active Batch Bar on Upload.
- Seed Ready + SKU/Unmapped/Qty exception orders without real PII.
- Enter Exception Mode from Batch Bar.
- Use inline Quick Mapping on safe SKU exception.
- Confirm exception count decreases.
- Confirm Qty exception remains and Print stays locked.
- Return to normal Review.
- Resolve test setup / verify Ready state.
- Test sticky Save PDF / Print button wiring without changing print scope.
- Open SKU Library.
- Open Safety secondary navigation.
- Reload and confirm existing Batch persistence.
- No page errors / relevant console errors.

## 10. Rollout

1. Feature branch from fresh `main`.
2. Add RED UI/safety contracts.
3. Implement one usability slice at a time.
4. Run full regression after each meaningful slice.
5. JSX compile check.
6. Chromium branch smoke.
7. Review final diff; reject Core/storage drift.
8. PR and merge-result CI.
9. Squash merge to `main`.
10. Main regression.
11. GitHub Pages deploy.
12. Production smoke.
13. Live Chromium verification.

## 11. Definition of Done

This pass is complete when an operator can identify the active Batch, jump directly to unresolved work, resolve safe SKU exceptions without unnecessary navigation, understand when printing is blocked, and complete a ready Batch with fewer clicks—while all stable parsing, matching, quantity, persistence, and print contracts remain unchanged.
