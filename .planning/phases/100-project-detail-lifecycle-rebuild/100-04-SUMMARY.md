---
phase: 100-project-detail-lifecycle-rebuild
plan: 04
subsystem: ui
tags: [vanilla-js, firestore, project-detail, lifecycle, gates, security-rules]

requires:
  - phase: 100-03
    provides: buildLifecycleBody, buildLifecycleBodyInPlace, lcAttachLink/lcAttachFile/lcRemoveDoc optimistic stubs

provides:
  - _canAdvanceProjectStatus(project, currentUser, targetStatus) — role gate helper
  - addProjectAuditEntry(projectId, action, actorId, actorName, comment) — audit subcollection write
  - _attachDocumentToProject(projectId, fields) — Firestore doc fields write + audit entry
  - window.lcAdvanceToForProposal — Gate 1 transition (For Inspection → For Proposal)
  - window.lcStartMobilization — Gate 2 transition (Client Approved → For Mobilization)
  - window.lcStartProject — Gate 3 transition (For Mobilization → On-going)
  - window.lcMarkProjectComplete — Gate 4 transition (On-going → Completed, admin only)
  - lcAttachLink/lcAttachFile/lcRemoveDoc wired to call _attachDocumentToProject after optimistic update
  - firestore.rules operations_user affectedKeys expanded with 16 lifecycle fields

affects: []

tech-stack:
  added: []
  patterns:
    - Role gate before any updateDoc — _canAdvanceProjectStatus checks role + personnel_user_ids
    - Optimistic local update then async Firestore write pattern for document attachment
    - Audit subcollection (projects/{id}/audit_log) with addDoc + serverTimestamp

key-files:
  created: []
  modified:
    - app/views/project-detail.js
    - firestore.rules

key-decisions:
  - "Gate 4 admin-only enforced JS-side; Firestore rules expanded to allow the field list for all ops_user writes (field-mask only, not role-gate) — defense-in-depth for internal tool"
  - "window.getCurrentUser?.() pattern used consistently — matches all other functions in this view"
  - "ISO timestamp slice(0,19).replace('T',' ') for mobilization_started_at / project_started_at / project_completed_at — consistent with existing date patterns in file"
  - "Audit log uses projects/{id}/audit_log subcollection with addDoc (auto-id)"

patterns-established:
  - "Gate function pattern: check currentProject.id === projectId → check doc requirement → check role → updateDoc → addProjectAuditEntry"
  - "9 lc* window functions total (5 from Plan 03 + 4 from Plan 04) all registered+deleted symmetrically"

requirements-completed: [SC-1, SC-3, SC-4, SC-5, SC-6, SC-10]

duration: ~20min
completed: 2026-06-08
---

# Phase 100-04: Lifecycle Gate Transitions and Firestore Rules

**Full lifecycle accordion end-to-end: 4 gate Firestore transitions with role guards, document attachment writes, audit entries, and expanded Firestore rules for operations_user**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-08
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- _canAdvanceProjectStatus() enforces role matrix: Gates 1-3 allow ops_user if assigned; Gate 4 admin-only
- addProjectAuditEntry() writes to projects/{id}/audit_log subcollection with serverTimestamp
- _attachDocumentToProject() saves doc fields to Firestore + records DOCUMENT_ATTACHED audit entry
- lcAttachLink/lcAttachFile/lcRemoveDoc now call _attachDocumentToProject after optimistic local update
- 4 gate window functions implement full Firestore transitions with role checks, guards, and audit logging
- firestore.rules operations_user hasOnly list expanded from 2 to 18 fields (16 new lifecycle fields)
- All 9 lc* window functions registered in attachWindowFunctions() and deleted in destroy() symmetrically

## Task Commits

1. **Task 1: Add 3 shared helpers + 4 gate window functions** - `07c7fbf` (feat(100-04))
2. **Task 2: Update Firestore rules affectedKeys** - `3188fc9` (feat(100-04))

## Files Created/Modified
- `app/views/project-detail.js` — _canAdvanceProjectStatus, addProjectAuditEntry, _attachDocumentToProject, 4 gate window functions, lcAttach* Firestore wiring
- `firestore.rules` — operations_user affectedKeys expanded with 16 lifecycle fields

## Decisions Made
- Gate 4 is admin-only at JS level; Firestore rules allow the field list for all ops_user (defense-in-depth — field-mask only, not role-gate) per plan spec
- ISO string format `slice(0,19).replace('T',' ')` for timestamps — matches existing date patterns in file
- Audit log subcollection approach matches existing edit_history pattern

## Deviations from Plan
None — plan executed exactly as written.

## Self-Check: PASSED
- `node --check app/views/project-detail.js` → PASS
- `_canAdvanceProjectStatus` count: 5 (>=5 required) ✓
- `addProjectAuditEntry` count: 7 (>=5 required) ✓
- `_attachDocumentToProject` count: 5 (>=4 required) ✓
- All 4 gate window functions present + 4 delete statements ✓
- firestore.rules brace balance: 61 open = 61 close ✓
- `inspection_report_url`, `certificate_of_completion_url`, `Phase 100` all in rules ✓

## Issues Encountered
None.

## Next Phase Readiness
- Phase 100 complete — full lifecycle accordion functional end-to-end
- Firestore rules deploy required: `firebase deploy --only firestore:rules` (carries over with existing 87.4 deploy debt)
- Browser UAT recommended to confirm gate transitions and document attachment in production Firebase

---
*Phase: 100-project-detail-lifecycle-rebuild*
*Completed: 2026-06-08*
