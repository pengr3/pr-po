---
phase: 99-billing-request-flow
plan: 03
subsystem: ui
tags: [billing, finance, collectibles, firestore, notifications]

# Dependency graph
requires:
  - phase: 99-01
    provides: billing_requests rules update permission + BILLING_REQUEST_DECIDED type
  - phase: 99-02
    provides: billing_requests docs (frozen D-04 schema) written by the project side
provides:
  - "Collapsible blue 'Pending Billing Requests' banner above the Collectibles table (real-time, auto-appear/disappear)"
  - "openCreateCollectibleModal preselectKey extended to an optional 3rd :TRANCHE_INDEX segment (backward compatible)"
  - "approveBillingRequest (prefill + mark approved, D-11 edge handled) + rejectBillingRequest (required reason)"
  - "shared _notifyBillingDecision → submitter (BILLING_REQUEST_DECIDED) fire-and-forget"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "preselectKey 3-segment parse (dept:code:trancheIndex) — backward-compatible optional segment"
key-files:
  created: []
  modified:
    - app/views/finance.js
key-decisions:
  - "Approve pre-fills only (D-12) — never trusts the advisory request amount; submitCollectible re-derives the authoritative amount at submit (T-99-09)"
  - "D-11 already-billed tranche: inline red hint near the dropdown rather than a silent empty selection; Approve still opens the modal, Finance decides"
  - "Reject reason via window.prompt (lean surface; reason mandatory or reject aborts, D-13)"
patterns-established:
  - "Pending-requests listener attached once in initCollectiblesTab + pushed to listeners[] (no double-attach on sub-tab switch)"
requirements-completed: [BILL-03, BILL-04, BILL-05]

# Metrics
duration: ~6 min
completed: 2026-06-04
---

# Phase 99 Plan 03: Finance Review Surface Summary

**Finance Collectibles tab gains a real-time collapsible "Pending Billing Requests" banner, an Approve bridge that pre-fills Create-Collectible with the requested tranche (3-segment preselectKey, already-billed edge hinted), and a required-reason Reject — both notify the submitter.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-04T15:45:00Z
- **Completed:** 2026-06-04T15:51:09Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- `billing_requests where status=='pending'` onSnapshot attached once in `initCollectiblesTab`, pushed to `listeners[]`; `renderPendingBillingBanner()` fills `#pendingBillingBanner` above the Collectibles card, auto-appears/disappears, collapses, escapes all strings, doc anchors `target=_blank rel=noopener noreferrer`.
- `openCreateCollectibleModal` preselectKey now parses an optional 3rd `:TRANCHE_INDEX` segment (2-segment keys still work via the `t != null` guard) and pre-selects the tranche after the dropdown rebuild; D-11 disabled (already-billed) option surfaces an inline hint.
- `approveBillingRequest` opens the prefilled modal then marks the request `approved` (D-12 — separate from collectible creation); `rejectBillingRequest` requires a non-empty reason and marks `rejected` + stores `rejection_reason`.
- Shared `_notifyBillingDecision()` fires `BILLING_REQUEST_DECIDED` to the submitter (`createNotificationForUsers`, `excludeActor` default false) fire-and-forget from both paths.
- `createNotificationForUsers` imported; approve/reject/toggle registered + deleted in destroy; banner state reset in destroy.

## Task Commits

1. **Task 1: pending listener + collapsible banner** — `2fe9bea` (feat)
2. **Task 2: approve bridge (3-segment preselectKey + D-11 edge + mark approved)** — `1a9800d` (feat)
3. **Task 3: reject + submitter notification + window wiring** — `9d54e17` (feat)

## Files Created/Modified
- `app/views/finance.js` — import (createNotificationForUsers); billing module vars; pending listener in initCollectiblesTab; banner container in collectibles-section; `renderPendingBillingBanner()`; `approveBillingRequest`; `rejectBillingRequest`; `_notifyBillingDecision`; preselectKey 3-segment parser + tranche pre-select/D-11 edge; window attach + destroy cleanup.

## Decisions Made
- D-11 edge handled with an inline hint (not silent). Approve marks-approved separately from collectible creation (D-12). Reject uses `window.prompt` for the mandatory reason (lean surface, Claude's Discretion per plan).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. (Intermediate-commit ordering managed so approve/reject window registration lands in Task 3 — after both functions are defined — keeping every commit load-valid.)

## User Setup Required
None.

## Next Phase Readiness
- Phase 99 implementation complete across all 3 plans. Finance review queue + project submission + foundation rules/types all in place.
- **UAT (browser, as Finance):** with ≥1 pending request — banner appears above Collectibles; doc links open in a new tab; Approve opens Create-Collectible with project + tranche pre-filled (a Completion tranche that already has a collectible shows the D-11 hint); after approve the row leaves the banner and the project-side list flips to "approved"; Reject prompts for a reason (empty → blocked), then the row leaves and the project-side list shows "rejected" + reason; confirm the submitter receives the DECIDED notification.
- **DEPLOY NOTE:** Plan 99-01's `billing_requests` rules block must be deployed (`firebase deploy --only firestore:rules --project dev` for UAT, then prod) before any of this works against live Firestore.

---
*Phase: 99-billing-request-flow*
*Completed: 2026-06-04*

## Self-Check: PASSED
- `node --check app/views/finance.js` passes.
- All Task 1/2/3 acceptance criteria verified (pending listener scoped lowercase 'pending' + listeners[] + banner container before card + auto-disappear + escaped + doc target/rel; 3-segment parser + tranche preselect + D-11 hint + approve writes 'approved'; reject required reason + writes 'rejected'+reason; _notifyBillingDecision via createNotificationForUsers DECIDED from both paths; window attach+delete).
- Commits `2fe9bea` + `1a9800d` + `9d54e17` present on v3.3.
