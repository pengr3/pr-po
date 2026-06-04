---
phase: 99-billing-request-flow
plan: 02
subsystem: ui
tags: [billing, project-detail, firestore, modal, notifications]

# Dependency graph
requires:
  - phase: 99-01
    provides: billing_requests rules block (create=isActiveUser) + BILLING_REQUEST_SUBMITTED type
provides:
  - "Initiate Billing footer link in the Collectibles group (project-detail, unconditional)"
  - "billing-request modal: tranche picker → type pills (auto-hinted) → doc-link fields → notes → submit"
  - "submitBillingRequest(): frozen D-04 billing_requests addDoc + advisory amount math + Finance fan-out"
  - "own-requests onSnapshot + compact status list (pending/approved/rejected + reason)"
affects: [99-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent listener helper scoped to currentProject.project_code (mirrors ensureTasksListener)"
    - "Inline-styled single-select pill control (no production pill analog existed)"
key-files:
  created: []
  modified:
    - app/views/project-detail.js
key-decisions:
  - "Own-requests listener scoped to currentProject.project_code (NOT the URL projectCode param) via idempotent ensureBillingRequestsListener() — correct for the Phase-78 doc-id fallback where the URL param can differ from project_code; this is the plan's explicitly-offered alternative"
  - "Pills rendered as 3 literal _selectBillingType('progress'|'completion'|'other') divs (a style-only helper) so intent stays grep-able and matches the acceptance contract"
  - "amount_requested is advisory/frozen; Finance re-derives the authoritative amount at approval (T-99-05)"
patterns-established:
  - "Billing modal reuses project CSS (.modal/.btn/.form-control); spike .sim-*/.btype-pill NOT copied"
requirements-completed: [BILL-01, BILL-02, BILL-05]

# Metrics
duration: ~7 min
completed: 2026-06-04
---

# Phase 99 Plan 02: Project-Side Billing Surface Summary

**Project Detail "↑ Initiate Billing →" footer link opening a tranche→type-pill→doc-link modal that writes a frozen D-04 billing_requests doc and notifies Finance, plus a live own-requests status list — all in project-detail.js.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-04T15:37:00Z
- **Completed:** 2026-06-04T15:44:46Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Footer link (unconditional, in the Collectibles group) + idempotent `ensureBillingRequestsListener()` scoped to `project_code` + `renderOwnBillingRequests()` status list with lowercase-exact pills and escaped strings.
- `openBillingRequestModal()` with edge guard (no tranches / contract_cost≤0 → toast + return), tranche picker, 3 ordered auto-hinted billing-type pills (overrideable), per-type `type="url"` doc inputs, and a Submit gate (`_validateBillingForm`).
- `submitBillingRequest()` writes the frozen D-04 schema (lowercase `'pending'`, serverTimestamp), advisory amount = `(tranchePct/100)*contract_cost` from `currentProject`, double-submit guarded, fires fire-and-forget `BILLING_REQUEST_SUBMITTED` to Finance.
- All 5 billing window fns registered in `attachWindowFunctions()` and deleted in `destroy()`; listener + state torn down in `destroy()`.

## Task Commits

1. **Task 1: footer link + own-requests listener/list** — `52483ad` (feat)
2. **Task 2: billing-request modal (tranche/pills/doc fields/validation)** — `2fc481b` (feat)
3. **Task 3: submitBillingRequest + frozen doc + Finance notif + window wiring** — `9efc6f5` (feat)

## Files Created/Modified
- `app/views/project-detail.js` — imports extended (addDoc/serverTimestamp + createNotificationForRoles); billing module vars; `ensureBillingRequestsListener()`; footer link + `renderOwnBillingRequests()`; `BILLING_DOCS`, `openBillingRequestModal()` + `_hintBillingType`/`_onBillingTrancheChange`/`_selectBillingType`/`_renderBillingDocFields`/`_validateBillingForm`; `submitBillingRequest()`; window attach + destroy cleanup.

## Decisions Made
- **Listener scope:** used `currentProject.project_code` via an idempotent helper rather than the literal inline `where('project_code','==', projectCode)` (URL param). The plan flagged this exact case (Phase-78 doc-id fallback): the URL param can be a Firestore doc id ≠ project_code, and the submit writes `project_code`. Scoping to the written field is the correct, plan-sanctioned choice.
- **Pills:** rendered as three literal `_selectBillingType('…')` divs with a style-only helper (instead of a DRY `pill(type)` helper that interpolated `${type}`), so the source matches the acceptance contract and intent is grep-able.

## Deviations from Plan

### Adjustments (within plan guidance — not Rule-4 escalations)

**1. Own-requests listener via idempotent helper scoped to project_code**
- **Found during:** Task 1
- **Issue:** The literal inline snippet scoped the query to the URL `projectCode` param, which can differ from the written `project_code` for clientless projects (Phase 78 D-06 doc-id fallback).
- **Fix:** `ensureBillingRequestsListener()` (mirrors `ensureTasksListener()`), scoped to `currentProject.project_code`, called in both load branches; idempotent guard prevents double-attach.
- **Verification:** node --check passes; acceptance grep for the `billing_requests` query + `where('project_code','=='` + `billingRequestsListenerUnsub` all satisfied.

**2. Pills rendered as literal calls instead of an interpolating helper**
- **Found during:** Task 2 acceptance gate
- **Issue:** A DRY `pill(type)` helper interpolated `${type}` into onclick, so the literal `_selectBillingType('progress'|…)` strings the acceptance criteria grep for did not appear in source.
- **Fix:** kept a style-only `pillStyle(type)` helper and inlined the three pills with literal onclick handlers, preserving order Progress/Completion/Other.
- **Verification:** all three literals present and ordered; node --check passes.

---

**Total deviations:** 2 (both plan-sanctioned adjustments, no scope creep).
**Impact on plan:** Behavior matches the plan exactly; the listener change is strictly more correct.

## Issues Encountered
None. (Initial verification regexes were mis-calibrated — `[^]]*` JS gotcha and too-tight windows — re-verified with correct assertions; no code issue.)

## User Setup Required
None.

## Next Phase Readiness
- Project side complete. Plan 99-03 (finance.js) consumes the same `billing_requests` docs (pending banner + approve/reject) and fires `BILLING_REQUEST_DECIDED` back to the submitter. No shared-file overlap with this plan.
- **UAT (browser):** as operations_user on a project with tranches + contract_cost — open the link, pick a Completion tranche (confirm auto-hint = Completion + two doc fields COC/Completion Report), fill links, submit → toast + status list shows "pending"; confirm Submit stays disabled until all links filled (BILL-02); confirm SUBMITTED reaches Finance OR is silently skipped without breaking submit (T-99-04).

---
*Phase: 99-billing-request-flow*
*Completed: 2026-06-04*

## Self-Check: PASSED
- `node --check app/views/project-detail.js` passes.
- All Task 1/2/3 acceptance criteria verified (footer link unconditional; modal + 3 ordered pills + auto-hint + url doc fields + edge guard + validation; frozen D-04 addDoc with lowercase 'pending' + serverTimestamp; amount from currentProject; fire-and-forget SUBMITTED; window attach+delete; listener teardown).
- Commits `52483ad` + `2fc481b` + `9efc6f5` present on v3.3.
