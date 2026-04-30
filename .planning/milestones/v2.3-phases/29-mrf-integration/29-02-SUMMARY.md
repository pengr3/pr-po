---
phase: 29-mrf-integration
plan: 02
subsystem: ui
tags: [firestore, firebase, mrf-form, procurement, services, department, pr-generation, tr-generation]

# Dependency graph
requires:
  - phase: 29-01
    provides: role-aware service dropdown HTML (serviceNameGroup, select#serviceName) in mrf-form.js render()
  - phase: 28-services-view
    provides: services Firestore collection with active boolean and service_code/service_name fields
provides:
  - handleFormSubmit() in mrf-form.js stores department, service_code, service_name on MRF documents
  - saveNewMRF() in procurement.js stores department, service_code, service_name on inline-created MRFs
  - All new PR addDoc calls (generatePR, generatePRandTR) carry service_code, service_name, department
  - All new TR addDoc calls (submitTransportRequest, generatePRandTR) carry service_code, service_name, department
  - Services dropdown (saveNewMRF_serviceName) rendered in procurement.js inline New MRF form
affects: [29-03-PLAN, finance view, procurement display, PO tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Department field pattern: department = hasService ? 'services' : 'projects' -- binary discriminator for document type"
    - "Empty string over omission: service_code/project_code stored as '' (not omitted) when not applicable -- backward compatible"
    - "Null guard pattern: mrfData.service_code || '' -- handles pre-existing MRF docs without service fields"
    - "Services one-time fetch: loadServicesForNewMRF() uses getDocs (not onSnapshot) -- services list is static enough for inline form"

key-files:
  created: []
  modified:
    - app/views/mrf-form.js
    - app/views/procurement.js

key-decisions:
  - "department field is binary string discriminator ('projects' vs 'services') not a foreign key -- denormalized for fast filtering without joins"
  - "All four TR/PR addDoc paths updated (not just the two mentioned in plan) -- submitTransportRequest() was a fifth TR path discovered during execution"
  - "cachedServicesForNewMRF uses getDocs (one-time fetch) not onSnapshot -- services change rarely and the inline form doesn't need real-time updates"
  - "Services dropdown shown only when cachedServicesForNewMRF.length > 0 -- prevents empty dropdown appearing for roles without services access"
  - "required attribute removed from projectName select in renderMRFDetails() -- same pattern as mrf-form.js (Plan 01 decision) to allow service-only submission"

patterns-established:
  - "Denormalized service fields pattern: service_code, service_name, department all stored on child documents (PRs, TRs) copied from parent MRF"
  - "Four-path TR/PR coverage: generatePR new-PR path, generatePRandTR new-PR path, generatePRandTR TR path, submitTransportRequest TR path"

requirements-completed: [MRF-07, MRF-08, MRF-09]

# Metrics
duration: 20min
completed: 2026-02-18
---

# Phase 29 Plan 02: MRF Form Submission with Department and Service Fields Summary

**MRF, PR, and TR documents now store department/service_code/service_name fields: four addDoc paths updated in procurement.js, handleFormSubmit() and saveNewMRF() both collect and store service fields with project-or-service validation**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-02-18
- **Completed:** 2026-02-18
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Updated `handleFormSubmit()` in mrf-form.js to collect service dropdown value, determine `department` ('projects' or 'services'), validate that at least one of project/service is selected, and store all three service fields in the Firestore mrfDoc
- Updated `saveNewMRF()` in procurement.js to mirror the same service collection and validation pattern, with service dropdown rendered inline in the New MRF form from `cachedServicesForNewMRF`
- Added `service_code`, `service_name`, `department` to all four PR/TR addDoc paths in procurement.js so downstream documents carry the service context from their parent MRF

## Task Commits

Each task was committed atomically:

1. **Task 1: Update handleFormSubmit() in mrf-form.js to store department + service fields** - `1d57265` (feat)
2. **Task 2: Add services support to saveNewMRF() in procurement.js and copy service fields in PR/TR creation** - `10def8d` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `app/views/mrf-form.js` - Updated handleFormSubmit() to collect serviceCode/serviceName, determine department, add project-or-service validation, store department/service_code/service_name in mrfDoc
- `app/views/procurement.js` - Added cachedServicesForNewMRF variable, loadServicesForNewMRF() function, services dropdown in renderMRFDetails() for isNew, updated saveNewMRF() collection/validation/mrfDoc, added service fields to 4 addDoc calls

## Decisions Made
- `department` is stored as a plain string discriminator ('projects' or 'services') rather than a reference — avoids joins and is consistent with how `project_name` is already denormalized
- `cachedServicesForNewMRF` uses one-time `getDocs()` rather than an `onSnapshot` listener — services change rarely and the inline form only needs a point-in-time list; avoids adding another active listener to procurement.js
- Services dropdown in `renderMRFDetails()` only renders when `cachedServicesForNewMRF.length > 0` — ensures the field doesn't appear as an empty dropdown if services haven't loaded or the role doesn't see any services
- `required` attribute removed from `#projectName` select in the inline form (matching the Plan 01 mrf-form.js decision) — browser native validation cannot fire on a select that might not be the required field

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added service fields to submitTransportRequest() TR addDoc**
- **Found during:** Task 2 (procurement.js PR/TR creation blocks)
- **Issue:** The plan specified 3 addDoc paths to update (2 PR paths + 1 TR in generatePRandTR). A fourth TR creation path exists in `submitTransportRequest()` around line 2922 for pure-transport MRFs. Without this update, services MRFs with only transport items would generate TRs missing service_code/service_name/department, causing incorrect display in finance view (Plan 03).
- **Fix:** Added `service_code: mrfData.service_code || ''`, `service_name: mrfData.service_name || ''`, `department: mrfData.department || 'projects'` to the `submitTransportRequest()` addDoc call
- **Files modified:** app/views/procurement.js
- **Verification:** Confirmed 4 occurrences of `mrfData.service_code` in procurement.js (grep verified lines 2928, 3195, 3483, 3548)
- **Committed in:** `10def8d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical fields)
**Impact on plan:** Auto-fix necessary to ensure complete coverage of all TR creation paths. No scope creep beyond the plan's intent.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 complete: all MRF, PR, and TR documents created going forward carry department/service_code/service_name fields
- Plan 03 (MRF display/detail updates) can now reference `mrf.department` and `mrf.service_code` to show correct labels in procurement and finance views
- Pre-existing MRF documents without these fields will return `undefined` — Plan 03 display code should use `mrf.service_code || ''` null guards (already established pattern)

---
*Phase: 29-mrf-integration*
*Completed: 2026-02-18*
