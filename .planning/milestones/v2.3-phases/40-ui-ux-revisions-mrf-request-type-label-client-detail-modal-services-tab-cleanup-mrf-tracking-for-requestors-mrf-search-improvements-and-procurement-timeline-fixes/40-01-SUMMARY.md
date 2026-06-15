---
phase: 40-ui-ux-revisions
plan: 01
subsystem: ui
tags: [vanilla-js, firestore, procurement, services, mrf]

# Dependency graph
requires:
  - phase: 29-mrf-integration
    provides: service_name field on MRF documents; department field for filtering
  - phase: 28-services-view
    provides: services.js with service_type sub-tab filtering
provides:
  - MRF radio button label "Material/Sub Contractor" replacing "Material Request"
  - MRF Records search extended to match requestor_name and service_name fields
  - Services table without redundant Service Type column (7 columns)
affects: [services-view, mrf-records-search, mrf-form]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "&&-short-circuit null safety for legacy Firestore documents missing optional fields"

key-files:
  created: []
  modified:
    - app/views/mrf-form.js
    - app/views/procurement.js
    - app/views/services.js

key-decisions:
  - "&&-short-circuit pattern used for service_name search condition — legacy MRF docs (pre-Phase 29) do not have service_name field; .toLowerCase() on undefined throws TypeError without the guard"
  - "serviceTypeDisplay variable and td fully removed from renderServicesTable — service_type data field retained for sub-tab filtering and create/edit form operations"
  - "Service Type sort handler (sortServices('service_type')) left in place — generic sort function, harmless dead code, no cleanup needed"

patterns-established:
  - "Null-safe field search: (doc.field && doc.field.toLowerCase().includes(term)) pattern for optional Firestore fields"

requirements-completed: [UX-01, UX-02, UX-03]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 40 Plan 01: MRF Label, Search Extension, and Services Column Cleanup Summary

**Three surgical UI fixes: MRF radio renamed to "Material/Sub Contractor", MRF Records search extended to match requestor and service names, and Service Type column removed from both Services sub-tab tables**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-25T12:56:10Z
- **Completed:** 2026-02-25T12:57:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Radio button label in mrf-form.js changed from "Material Request" to "Material/Sub Contractor" — aligns label with actual scope (materials and sub-contractors)
- `filterPRPORecords()` matchesSearch extended with `requestor_name` and `service_name` — users can now search MRF Records by who requested or what service was requested
- Service Type column removed from Services sub-tab tables — both the `<th>` and `<td>${serviceTypeDisplay}</td>` removed, colspans updated from 8 to 7; sub-tabs already separate one-time vs recurring services so the column was redundant

## Task Commits

Each task was committed atomically:

1. **Task 1: MRF label rename and search filter extension** - `39836ea` (feat)
2. **Task 2: Remove Service Type column from Services tables** - `bd96c4d` (feat)

**Plan metadata:** _(docs commit hash — recorded after state update)_

## Files Created/Modified

- `app/views/mrf-form.js` - Changed radio label from "Material Request" to "Material/Sub Contractor" (line 69)
- `app/views/procurement.js` - Extended matchesSearch in filterPRPORecords to include requestor_name and service_name conditions
- `app/views/services.js` - Removed Service Type th/td/variable; updated colspan from 8 to 7 in loading and empty-state rows

## Decisions Made

- Used `&&`-short-circuit null guard (`mrf.service_name && mrf.service_name.toLowerCase().includes(...)`) for the new `service_name` search condition — legacy MRF documents created before Phase 29 do not have a `service_name` field, and calling `.toLowerCase()` on `undefined` would throw a TypeError at runtime.
- `serviceTypeDisplay` variable fully removed alongside the display `<td>` — the underlying `service_type` data field is still present on every service document and is still used by sub-tab filtering logic and by the create/edit form handlers.
- The `sortServices('service_type')` call in the removed `<th>` is now dead; the generic `sortServices()` function itself was left untouched since it handles any column string and removing it would require further audit.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 40-01 complete; three quick UX wins shipped
- Services tables are cleaner at 7 columns; search in MRF Records is more discoverable
- Ready for Plan 40-02 (client detail modal or next planned fix)

---
*Phase: 40-ui-ux-revisions*
*Completed: 2026-02-25*

## Self-Check: PASSED

- FOUND: app/views/mrf-form.js
- FOUND: app/views/procurement.js
- FOUND: app/views/services.js
- FOUND: 40-01-SUMMARY.md
- FOUND commit: bd96c4d (Task 2)
- FOUND commit: 39836ea (Task 1)
- Key content verified: "Material/Sub Contractor" at line 69, requestor_name/service_name search at lines 2343-2344, colspan="7" at lines 273 and 911
