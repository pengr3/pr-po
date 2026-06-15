---
phase: 101-project-journal-activity-feed-progress-updates-issues
plan: "05"
subsystem: ui
tags: [javascript, firestore, project-detail, procurement, journal, activity-feed, auto-entries, lifecycle-gates]

# Dependency graph
requires:
  - phase: 101-03
    provides: "_addActivityEntry(projectId, {type, text, is_system}) write primitive"
  - phase: 101-04
    provides: "resolveIssue/reopenIssue already call _addActivityEntry; all 3 journal listeners live"
provides:
  - "4 lifecycle gate functions (lcAdvanceToForProposal, lcStartMobilization, lcStartProject, lcMarkProjectComplete) each post a system Feed entry after addProjectAuditEntry"
  - "saveField NOTIF-19 cost block posts a fire-and-forget system Feed entry with fieldLabel/oldDisplay→newDisplay delta"
  - "procurement.js PO Delivered (non-subcon) posts a system Feed entry to the owning project resolved via mrf_id→project_name→projects traversal"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lifecycle gate auto-entry: await _addActivityEntry inside existing try block after addProjectAuditEntry"
    - "Cost-delta auto-entry: fire-and-forget .catch() — fieldLabel/oldDisplay/newDisplay hoisted above recipients guard so journal fires regardless of personnel count"
    - "mrf_id→project_name→projects traversal for PO-to-project linkage (POs have no project_id field)"
    - "Independent try/catch for journal writes in procurement.js — journal failure never blocks status update"

key-files:
  created: []
  modified:
    - app/views/project-detail.js
    - app/views/procurement.js

key-decisions:
  - "fieldLabel/oldDisplay/newDisplay moved above 'if (recipients.length > 0)' guard in NOTIF-19 block — journal entry must fire regardless of personnel count (D-06)"
  - "Journal entry in each gate function uses await (not fire-and-forget) inside the existing try/catch — gate transition already succeeded via updateDoc; if _addActivityEntry fails it is caught and logged without blocking the UI toast"
  - "procurement.js journal block is a SEPARATE try/catch from NOTIF-18 — notification failure and journal failure are independent (both swallowed)"
  - "No d.project_id guard in procurement.js — POs have no project_id per CLAUDE.md schema; project resolved entirely via mrf_id traversal"

# Metrics
duration: ~5min
completed: 2026-06-10
---

# Phase 101 Plan 05: Auto-system-entry wiring (4 gates + cost delta + PO Delivered) Summary

**4 lifecycle gate functions + saveField cost-delta block auto-post system Feed entries; PO Delivered (non-subcon) writes a system entry to the owning project resolved via mrf_id→project_name→projects traversal**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-10T07:56:33Z
- **Completed:** 2026-06-10
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

### Task 1: project-detail.js — 4 gate auto-entries + saveField cost-delta auto-entry

- `lcAdvanceToForProposal`: added `await _addActivityEntry(projectId, { type: 'system', is_system: true, text: 'Status advanced to For Proposal by ...' })` immediately after `addProjectAuditEntry` inside the existing try block
- `lcStartMobilization`: added `await _addActivityEntry(...)` with `'Mobilization started by ...'`
- `lcStartProject`: added `await _addActivityEntry(...)` with `'Project started by ...'`
- `lcMarkProjectComplete`: added `await _addActivityEntry(...)` with `'Project marked Completed by ...'`
- `saveField` NOTIF-19 block: hoisted `fieldLabel`, `oldDisplay`, `newDisplay` declarations to the top of `if (NOTIF19_COST_FIELDS.includes(fieldName) && normalizedOld !== valueToSave)` (outside `if (recipients.length > 0)`), then added fire-and-forget `_addActivityEntry(currentProject.id, {...}).catch(...)` after the notification block — `return true` at line ~1338 remains present and reachable

### Task 2: procurement.js — PO Delivered auto-entry (mrf_id→project_name→projects traversal)

- After the NOTIF-18 try/catch, still inside `if (newStatus === 'Delivered' && !isSubcon)`, added a separate try/catch
- Traversal: `poDataFresh.mrf_id` → `query(collection(db,'mrfs'), where('mrf_id','==', ...))` → MRF `project_name` → `query(collection(db,'projects'), where('project_name','==', projectName))` → `projectDocId`
- `addDoc(collection(db,'projects', projectDocId, 'activity_entries'), { type:'system', is_system:true, text:'PO ... from ... marked Delivered', created_by_uid, created_by_name, created_at: serverTimestamp() })`
- All four skip-guards present: `if (poDataFresh.mrf_id)`, `if (!mrfSnap.empty)`, `if (projectName)`, `if (!projSnap.empty)`
- Error logged as `[Procurement] Phase 101 PO Delivered journal entry failed:` and swallowed

## Task Commits

1. **Task 1: 4 gate auto-entries + saveField cost-delta auto-entry** — `a562244` (feat)
2. **Task 2: PO Delivered auto-entry to project Feed** — `f3b58eb` (feat)

## Files Created/Modified

- `app/views/project-detail.js` — 4 gate functions each +1 line `_addActivityEntry`; NOTIF-19 block refactored (3 declarations hoisted + 4 lines added for journal fire-and-forget)
- `app/views/procurement.js` — 32 lines added inside `if (newStatus === 'Delivered' && !isSubcon)`: traversal block + addDoc + try/catch

## Decisions Made

- **fieldLabel/oldDisplay/newDisplay hoisted above recipients guard:** D-06 says cost edits always auto-post a system entry regardless of personnel assignment. The existing NOTIF-19 block only computed those display strings inside `if (recipients.length > 0)`. Moving them to the outer block satisfies D-06 while keeping the notification gate untouched.
- **await (not fire-and-forget) inside gate try blocks:** The gate transition (updateDoc) already succeeded before `_addActivityEntry` is called. If the journal write fails it is caught by the existing catch, which logs and shows a toast — appropriate behavior. Using await keeps the code sequentially readable and consistent with `addProjectAuditEntry` above it.
- **Separate try/catch in procurement.js:** Keeps NOTIF-18 failure and journal failure independent. Either can fail without affecting the other or blocking the status update.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All auto-entry sources are fully wired.

## Threat Flags

None. No new network endpoints or auth paths introduced. `activity_entries` subcollection rules were deployed in Plan 02 (`allow create: if isActiveUser()`). The procurement.js write uses the same subcollection path as the project-detail.js helper.

## Self-Check: PASSED

- `app/views/project-detail.js` exists and modified
- `app/views/procurement.js` exists and modified
- `node --check app/views/project-detail.js` exits 0
- `node --check app/views/procurement.js` exits 0
- Task 1 verification script: PASS (all 5 required strings present; _addActivityEntry call count = 9 >= 6)
- Task 2 verification script: PASS (all 7 required strings present; no d.project_id; Delivered guard found)
- `return true;` present in saveField
- Commit `a562244` exists (Task 1)
- Commit `f3b58eb` exists (Task 2)
- 4 gate messages confirmed: 'Status advanced to For Proposal by', 'Mobilization started by', 'Project started by', 'Project marked Completed by'
- cost-delta entry NOT gated behind `if (recipients.length > 0)`
- procurement.js uses `where('project_name', '==', projectName)` traversal
- procurement.js error log string: '[Procurement] Phase 101 PO Delivered journal entry failed:'
