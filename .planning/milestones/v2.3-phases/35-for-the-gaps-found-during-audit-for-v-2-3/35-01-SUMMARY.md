---
phase: 35-for-the-gaps-found-during-audit-for-v-2-3
plan: 01
subsystem: audit-trail
tags: [firestore, edit-history, services, subcollection, security-rules]

# Dependency graph
requires:
  - phase: 28-services-view
    provides: service-detail.js and services.js with recordEditHistory call sites
  - phase: 26-security-roles-foundation
    provides: firestore.rules services collection block

provides:
  - recordEditHistory and showEditHistoryModal with optional collectionName parameter (backward-compatible)
  - Edit History button in service-detail.js Card 1 header
  - All service edit history entries routed to services/{docId}/edit_history (not projects/)
  - Firestore security rule for services/{serviceId}/edit_history subcollection

affects:
  - service-detail.js — edit history modal now scoped to correct collection
  - services.js — create/update/toggle writes to correct audit path
  - edit-history.js — generic module usable by any collection

# Tech tracking
tech-stack:
  added: []
  patterns: [collectionName default parameter pattern for shared Firestore subcollection modules]

key-files:
  created: []
  modified:
    - app/edit-history.js
    - app/views/service-detail.js
    - app/views/services.js
    - firestore.rules

key-decisions:
  - "collectionName defaults to 'projects' in both exported functions — zero changes needed at project-detail.js call sites (backward-compatible)"
  - "Edit History button added to Card 1 header in service-detail.js, mirrors project-detail.js pattern exactly"
  - "services/edit_history read access granted to services_user (not just admin) — services_user needs audit visibility into their assigned services"
  - "Orphaned history at projects/{serviceDocId}/edit_history not migrated — entries are low-value development/testing records"

patterns-established:
  - "Shared module parameterization: add optional collectionName param with default to support multiple collections from one module"

requirements-completed: [SERV-04, SERV-09]

# Metrics
duration: 15min
completed: 2026-02-20
---

# Phase 35 Plan 01: Service Edit History Path Defect Summary

**edit-history.js parameterized with optional collectionName, routing all service audits to services/{docId}/edit_history with Edit History button added to service-detail.js**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-20T07:43:00Z
- **Completed:** 2026-02-20T07:58:23Z
- **Tasks:** 3 of 3
- **Files modified:** 4

## Accomplishments

- edit-history.js now accepts `collectionName = 'projects'` as optional 4th parameter on both exported functions — all existing project-detail.js call sites unchanged
- All 4 recordEditHistory call sites in service-detail.js corrected to pass `'services'` — edits no longer silently corrupt projects subcollection
- All 3 recordEditHistory call sites in services.js corrected to pass `'services'`
- Edit History button added to Card 1 header in service-detail.js; window.showEditHistory registered and cleaned up in destroy()
- services/{serviceId}/edit_history Firestore security rule added and deployed to production (Deploy complete!)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add collectionName parameter to edit-history.js** - `4c776d6` (feat)
2. **Task 2: Fix service-detail.js — import, call sites, window function, Edit History button** - `a017fae` (feat)
3. **Task 3: Fix services.js call sites + add Firestore rule + deploy rules** - `348231c` (feat)

**Plan metadata:** (docs commit — see final commit below)

## Files Created/Modified

- `app/edit-history.js` - Added `collectionName = 'projects'` param to both exported functions; hardcoded 'projects' replaced with dynamic param
- `app/views/service-detail.js` - Import updated; 4 recordEditHistory calls now pass `'services'`; window.showEditHistory added/cleaned; Edit History button in Card 1 header
- `app/views/services.js` - 3 recordEditHistory calls (addService, saveServiceEdit, toggleServiceActive) now pass `'services'`
- `firestore.rules` - Added `match /edit_history/{entryId}` subcollection rule inside `match /services/{serviceId}`; deployed to production

## Decisions Made

- **collectionName defaults to 'projects'**: Zero changes needed at existing project-detail.js call sites — backward-compatible default parameter handles this cleanly.
- **services_user gets read access to edit_history**: services_user needs audit trail visibility on their assigned services, not just admin roles.
- **No data migration for orphaned history**: Edit history entries written before this fix at `projects/{serviceDocId}/edit_history` are orphaned and not displayed in the service UI. These were testing/development records. No migration performed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Firebase CLI was authenticated; rules deployed successfully on first attempt.

## Orphaned Data Note

Edit history entries written before this fix remain at `projects/{serviceDocId}/edit_history` and are not displayed in the service UI. No migration performed — these entries are low-value audit records from testing/development.

## User Setup Required

None - no external service configuration required. Firestore rules were deployed automatically during Task 3.

## Next Phase Readiness

- SERV-04 and SERV-09 requirements satisfied
- Service edit history now writes to and reads from the correct Firestore path
- Edit History button visible in service detail view, modal opens with correct entries
- project-detail.js Edit History unaffected — still reads from projects/{docId}/edit_history
- Ready for remaining Phase 35 plans

## Self-Check: PASSED

Files exist:
- FOUND: app/edit-history.js
- FOUND: app/views/service-detail.js
- FOUND: app/views/services.js
- FOUND: firestore.rules

Commits:
- FOUND: 4c776d6 (Task 1)
- FOUND: a017fae (Task 2)
- FOUND: 348231c (Task 3)

---
*Phase: 35-for-the-gaps-found-during-audit-for-v-2-3*
*Completed: 2026-02-20*
