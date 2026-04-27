---
phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned
plan: 02
subsystem: ui
tags: [firestore, javascript, forms, mrf, procurement, clientless-projects, project-id-denormalization]

# Dependency graph
requires:
  - phase: 78-01
    provides: addProject() allows null client; projects Firestore docs have null project_code field for clientless projects

provides:
  - Clientless projects visible in mrf-form.js combobox with "(No code yet)" label
  - Clientless projects visible in procurement.js Create-MRF dropdown with "(No code yet)" label
  - project_id (Firestore doc ID) denormalized on every new MRF document (both clientless and coded)
  - project_id propagated from MRF to PR/TR child docs (4 sites)
  - project_id propagated from PO/TR to RFP docs (3 sites)

affects: [78-03-issuance-backfill, MRF form submission, PR generation, TR generation, RFP creation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clientless project option value = Firestore doc ID (not project_code) as stable key"
    - "psOptions objects carry docId and clientless fields for combobox-to-submit pipeline"
    - "project_id denormalized alongside project_code on all procurement documents for backfill support"

key-files:
  created: []
  modified:
    - app/views/mrf-form.js
    - app/views/procurement.js

key-decisions:
  - "Phase 79-02 replaced populateProjectDropdown() optgroup with rebuildPSOptions() combobox — plan's EDIT A adapted to modify rebuildPSOptions() instead of the now-deleted DOM-manipulation function"
  - "Two new hidden inputs (projectServiceDocId, projectServiceClientless) added to MRF form HTML to thread doc ID from option selection through to Firestore write"
  - "hasProject in mrf-form.js now keyed on selectedType === 'project' (not presence of project_code) so clientless projects are correctly treated as project selections"

patterns-established:
  - "Combobox option objects carry docId and clientless properties — passed as 5th/6th args to _selectPSOption onclick handler"
  - "selectPSOption signature extended: (value, label, type, name, docId, clientless) — backward compatible (extra params undefined for non-project options)"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-04-27
---

# Phase 78 Plan 02: MRF Form Layer — Clientless Projects Summary

**Clientless projects surfaced in both MRF dropdowns with "(No code yet)" label; project_id denormalized on every new MRF/PR/TR/RFP for Plan-03 backfill**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-27T05:22:05Z
- **Completed:** 2026-04-27T05:28:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `mrf-form.js` combobox (`rebuildPSOptions`) now emits clientless projects as `{project_name} (No code yet)` options using doc ID as value; `selectPSOption` populates two new hidden inputs (`projectServiceDocId`, `projectServiceClientless`); `handleFormSubmit` reads them and writes `project_id` on the MRF document
- `procurement.js` Create-MRF dropdown builds options with `data-project-doc-id` and `data-clientless` attributes; `saveNewMRF` reads them, branches project lookup on `isClientlessProject`, and writes `project_id` on the MRF document
- 7 child-doc propagation sites updated: 4 MRF-to-PR/TR sites and 3 PO/TR-to-RFP sites now forward `project_id` so Plan-03's backfill can find all linked records by querying `where('project_id', '==', projectDocId)`

## Task Commits

1. **Task 1: mrf-form.js combobox + project_id denormalization** - `8f76b9c` (feat)
2. **Task 2: procurement.js Create-MRF + project_id propagation** - `825f575` (feat)

## Files Created/Modified
- `app/views/mrf-form.js` - rebuildPSOptions, renderPSDropdown, selectPSOption, handleFormSubmit updated; 2 hidden inputs added to render() template
- `app/views/procurement.js` - projectOptions builder, saveNewMRF dropdown read + project lookup + Firestore write, 4 mrfData propagation sites, 3 RFP propagation sites

## Decisions Made
- Adapted Task 1 edits to target `rebuildPSOptions()` instead of the old `populateProjectDropdown()` — Phase 79-02 already replaced the DOM-manipulation approach with an in-memory `psOptions` array. The plan's EDIT A was written against the old code; the functional outcome is identical.
- Added hidden inputs `projectServiceDocId` and `projectServiceClientless` to the form HTML to thread doc ID from combobox selection through to the Firestore write without touching the services path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 1 EDIT A adapted for combobox architecture**
- **Found during:** Task 1 (mrf-form.js update)
- **Issue:** Plan's EDIT A targeted `populateProjectDropdown()` with `option.dataset.projectDocId = project.id` DOM style, but Phase 79-02 replaced that function with `rebuildPSOptions()` that builds a `psOptions` array — no DOM option elements to assign dataset to
- **Fix:** Modified `rebuildPSOptions()` to include `docId: p.id` and `clientless: isClientless` fields on each psOption; extended `renderPSDropdown()` to pass those as args to `_selectPSOption`; extended `selectPSOption()` to write new hidden inputs; adapted `handleFormSubmit()` to read from hidden inputs
- **Files modified:** app/views/mrf-form.js
- **Verification:** Custom node check confirms all 9 acceptance criteria patterns present; no syntax errors
- **Committed in:** 8f76b9c

---

**Total deviations:** 1 auto-fixed (Rule 1 - architectural adaptation)
**Impact on plan:** Adaptation required because Phase 79-02 landed between plan writing and execution. Functional outcome is identical to what the plan specified — clientless projects appear with "(No code yet)" label and project_id is written on submit. No scope creep.

## Issues Encountered
None beyond the combobox adaptation described above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan-03 (code issuance + backfill) can now use `where('project_id', '==', projectDocId)` to find all MRF/PR/TR/RFP documents linked to a clientless project
- Coded-project flow is additive only — `project_id` is now written on all new procurement records regardless of whether the project is clientless or coded

---
*Phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned*
*Completed: 2026-04-27*
