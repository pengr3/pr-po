---
phase: 104-service-detail-parity
plan: 03
subsystem: ui
tags: [service-detail, lifecycle-accordion, gates, status_changed_at, dlp, audit_log]

requires:
  - phase: 104-01
    provides: services/{id}/audit_log Firestore create rule + role-only services update rule
  - phase: 104-02
    provides: _addServiceActivityEntry + addServiceAuditEntry primitives, orderBy/limit imports
  - phase: 100
    provides: project-detail.js lifecycle accordion (the mirrored source design)
provides:
  - "Lifecycle accordion (8-stage track + 4 doc gates) replacing the manual project_status dropdown"
  - "_canAdvanceServiceStatus (D-04 Completion services_admin-only), computeDlpFields (owned here; Plan 04 reuses)"
  - "4 gate transitions writing project_status + status_changed_at + audit + activity + last_activity_at"
  - "Completion-gate DLP capture (gated on retention tranche)"
affects: [104-04]

tech-stack:
  added: []
  patterns: ["copy-then-adapt project lifecycle accordion (Phase-26 mirror)", "4-writes-per-gate transition (status/clock + audit + activity + D-14 bump)", "_lcAttachPending snapshot suppression for in-place rebuild"]

key-files:
  created: []
  modified: [app/views/service-detail.js]

key-decisions:
  - "D-04 deviation: _canAdvanceServiceStatus returns false for targetStatus==='Completed' before the services_user branch — Completion is services_admin-only (stricter than the projects model where assigned ops_user can complete). Documented residual T-104-09: the services update rule is role-only, so this UI gate is advisory; server-side completion-role enforcement is deferred."
  - "computeDlpFields is OWNED by this plan (Plan 04 must NOT duplicate it — grep returns 1)."
  - "Lifecycle copy mirrored verbatim — descriptive text still says 'Project'/'project' (services use the unified project_status field app-wide; CONTEXT D-03 says no service-specific relabeling). Rewording to 'Service' is a trivial, isolated follow-up the operator can request after UAT."
  - "Plan-instructed extension over the project baseline: each gate fires a fire-and-forget success-only last_activity_at bump (the project gates do not); coherent with D-13/D-14."
  - "D-06 invariant re-verified, not modified: after dropdown removal the only service status writers are the 4 gates (stamp status_changed_at) + proposals.js _applyProposalStateTransition (still stamps it). proposals.js untouched."

patterns-established:
  - "Manual status dropdown replaced by a read-only #hdrServiceStatusBadge pill; the accordion is the sole status-advancement surface"

requirements-completed: []

duration: 30 min
completed: 2026-06-13
---

# Phase 104 Plan 03: Service Lifecycle Accordion Summary

**Ported the Phase 100 8-stage lifecycle accordion + 4 document gates into service-detail.js, replacing the manual project_status dropdown with a read-only header pill — each gate stamps status_changed_at, writes an audit_log + system activity entry, and fires the D-14 bump; the Completion gate is services_admin-only and captures DLP fields when a retention tranche exists.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2
- **Files modified:** 1 (service-detail.js)

## Accomplishments
- Full accordion shell: LC_STAGES, `_getServiceStatusColor`, `_canAdvanceServiceStatus` (D-04), `computeDlpFields`, LC_DOC_KEYS, `buildAttachZone`, `buildPATrack`, `buildDocRollup`, `buildServiceLifecycleBody` (10 branches incl. On-going DLP fieldset + Draft fall-through), `buildServiceLifecycleBodyInPlace`, `buildServiceLifecycleTrack`, `renderServiceLifecycleCard`, `updateServiceLifecycleBadge` (updates `#hdrServiceStatusBadge`), `toggleServiceLifecycleAccordion`.
- Manual `<select data-field="project_status">` removed from Card 3 → read-only `#hdrServiceStatusBadge` pill (grep `data-field="project_status"` → 0).
- 4 gate transitions with the 4-writes-per-gate contract; `lcMarkServiceComplete` is services_admin-only + DLP capture.
- 4 doc-attach handlers + `_attachDocumentToService` (sets `_lcAttachPending`) + init snapshot suppression branch (in-place accordion rebuild, no flicker).
- Accordion injected at top of the `.container`; repopulate-if-open at render end.
- 9 lc* window fns register↔teardown symmetric; `_lcOpen`/`_lcAttachPending` reset in `destroy()`.

## Task Commits

1. **Task 1: accordion shell + dropdown removal** - `cbd7ec0` (feat)
2. **Task 2: 4 gates + attach handlers + snapshot suppression** - `7460614` (feat)

## Files Created/Modified
- `app/views/service-detail.js` - lifecycle builders, state, render injection, dropdown removal, gates, attach handlers, init snapshot branch, attachWindowFunctions + destroy.

## Decisions Made
- See key-decisions (D-04 services_admin-only Completion, computeDlpFields ownership, verbatim copy, per-gate D-14 bump, D-06 re-verify).

## Deviations from Plan

None - plan executed as written. (Per-gate D-14 bump and verbatim copy are plan-instructed / plan-sanctioned, documented above.)

## Issues Encountered
None.

## Verification
- `node --check app/views/service-detail.js` exit 0 after each task. PASS
- 4 gates each with `status_changed_at: serverTimestamp` + `addServiceAuditEntry` + `_addServiceActivityEntry` + un-awaited `last_activity_at` bump. PASS
- DLP capture gated on retention tranche; `_canAdvanceServiceStatus(..., 'Completed')` used. PASS
- dropdown removed (0); proposals.js still stamps `status_changed_at` (D-06). PASS
- 9 lc* window fns register↔teardown symmetric; computeDlpFields appears once. PASS

## User Setup Required
None directly — gate writes (audit/activity/status) require the Plan 01 DEV rules deploy at runtime (browser UAT).

## Next Phase Readiness
- `computeDlpFields` is present (Plan 04 reuses, does not duplicate). The Completion gate writes the DLP fields Plan 04's finance bar reads. Plan 04 (Wave 4) is the final plan.

## Self-Check: PASSED

---
*Phase: 104-service-detail-parity*
*Completed: 2026-06-13*
