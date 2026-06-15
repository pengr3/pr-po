---
phase: 104-service-detail-parity
plan: 05
subsystem: ui
tags: [procurement, services, activity-journal, priority-feed, signal]

requires:
  - phase: 104-01
    provides: services/{id}/activity_entries Firestore create rule (authorizes the PO-Delivered service write)
  - phase: 103.1
    provides: services.js URGENCY_THRESHOLDS + normalizeUpdatedAt + conservative recurring On-going baseline
provides:
  - "procurement.js PO-Delivered service-side auto-entry branch (joins MRF.service_code -> services.service_code)"
  - "services.js two-tier one-time On-going signal reading last_activity_at ?? updated_at (recurring unchanged)"
affects: [104-02, 104-03]

tech-stack:
  added: []
  patterns: ["parallel project/service auto-entry branch in updatePOStatus", "two-tier activity clock on one-time On-going services"]

key-files:
  created: []
  modified: [app/views/procurement.js, app/views/services.js]

key-decisions:
  - "D-12: the service PO-Delivered branch joins on service_code (not project_name) — the critical traversal difference; runs in its own swallow-on-error try/catch and reuses the already-fetched mrfData; project branch untouched"
  - "D-13: one-time On-going gets the full two-tier clock (urgent >14d / watch >7d on last_activity_at ?? updated_at); recurring stays conservative via the unchanged service_type !== 'recurring' guard"

patterns-established:
  - "An MRF belongs to either a project OR a service — both auto-entry branches run defensively but are mutually exclusive in practice"

requirements-completed: []

duration: 7 min
completed: 2026-06-13
---

# Phase 104 Plan 05: PO-Delivered Service Auto-Entry + One-Time On-Going Signal Summary

**Marking a non-subcon PO Delivered now posts a system Feed entry to the owning service's activity_entries (joined via service_code), and one-time On-going services get the full two-tier 🟠/🔴 quiet signal on last_activity_at — recurring stays conservative.**

## Performance

- **Duration:** ~7 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- procurement.js: service-side PO-Delivered branch nested inside the existing `if(!mrfSnap.empty)` block (reuses mrfData), joining `MRF.service_code → services.service_code`, writing the same system-entry shape to `services/{id}/activity_entries`, in its own `svcJournalErr` try/catch. Project branch byte-unchanged.
- services.js: one-time On-going branch upgraded from a single capped watch to the two-tier ladder (urgent >`ONGOING_QUIET_URGENT` 14d / watch >`ONGOING_QUIET_WATCH` 7d) reading `last_activity_at ?? updated_at`. Recurring still suppressed (guard unchanged); DLP `in-dlp` + default-OK fall-throughs intact.

## Task Commits

1. **Task 1: procurement.js service PO-Delivered auto-entry (D-12)** - `47a5f4c` (feat)
2. **Task 2: services.js two-tier one-time On-going signal (D-13)** - `cc52831` (feat)

## Files Created/Modified
- `app/views/procurement.js` - service-side PO-Delivered journal branch in updatePOStatus.
- `app/views/services.js` - two-tier one-time On-going signal in getServiceSignal.

## Decisions Made
- None beyond plan. The two-tier ladder mirrors projects.js getProjectSignal verbatim; recurring conservatism is the unchanged 103.1 D-05 behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Verification
- `node --check app/views/procurement.js` exit 0; `node --check app/views/services.js` exit 0. PASS
- service branch: serviceCode join + services query + addDoc to services activity_entries + svcJournalErr catch (1 each); project branch project_name join still present. PASS
- services.js: `last_activity_at ?? updated_at` read; urgent + watch returns gated on the two thresholds; recurring guard intact; default-OK return present. PASS

## User Setup Required
None directly — but the PO-Delivered service write requires the Plan 01 DEV rules deploy to succeed at runtime (browser UAT).

## Next Phase Readiness
- Independent of the service-detail.js plans (disjoint files). D-12/D-13 behavioral surfaces are browser-UAT items.

## Self-Check: PASSED

---
*Phase: 104-service-detail-parity*
*Completed: 2026-06-13*
