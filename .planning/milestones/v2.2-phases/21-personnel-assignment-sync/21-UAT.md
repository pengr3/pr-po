---
status: complete
phase: 21-personnel-assignment-sync
source: 21-01-SUMMARY.md
started: 2026-02-09T20:00:00Z
updated: 2026-02-09T21:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Create project with personnel syncs assignment
expected: Create a new project with a personnel user. After save, the user's `assigned_project_codes` in Firestore includes the new project code. Console shows `[PersonnelSync]` log with additions count.
result: pass

### 2. Edit project personnel syncs changes
expected: Edit an existing project's personnel — remove one user, add another. After save, the removed user's `assigned_project_codes` no longer has the project code, and the added user's array now includes it. Console shows both Added and Removed counts.
result: pass

### 3. Add personnel from project detail page
expected: Navigate to a project's detail page. Add a new personnel user via the pill selector. After the save succeeds, the added user's `assigned_project_codes` includes the project code. Console shows `[PersonnelSync]` log.
result: pass

### 4. Remove personnel from project detail page
expected: On a project detail page, click the X on a personnel pill to remove them. After save, that user's `assigned_project_codes` no longer has the project code. Console shows `[PersonnelSync]` with `Removed: 1`.
result: pass

### 5. All-projects user is not affected by sync
expected: If a user has `all_projects: true` on their Firestore document, adding them as personnel should NOT modify their `assigned_project_codes`. Console should show `[PersonnelSync] Skipping all_projects user:` log.
result: issue
reported: "removed a user in a project does not remove that project in that user's project list. This is critical kindly fix"
severity: blocker
resolution: diagnosed as expected behavior for all_projects users + discovered dead variable bug in editProject(). Fixed editProject() (projectsData→allProjects), added reverse sync from Admin>Assignments to project personnel, fixed operations_user permission error, suppressed expense toast on page load.

### 6. Operations user sees assigned project immediately
expected: Log in as an operations user who was just added as personnel on a project. The project appears in their Projects list without needing to be manually assigned via the Admin > Assignments panel.
result: pass

### 7. Project Assignments admin panel still works
expected: Navigate to Admin > Assignments. Manually assign/unassign a project code to a user. The assignment works as before — this panel directly writes `assigned_project_codes` and is independent of the personnel sync.
result: pass

### 8. No console errors on page load
expected: Load the app fresh, navigate to Projects, project detail, and Admin pages. No `syncPersonnelToAssignments is not a function`, `arrayUnion is not a function`, or other import errors appear in the console.
result: pass

### 9. Admin Assignments reverse sync to project personnel
expected: Assign a project to a user via Admin > Assignments. The user appears as personnel on the project detail page. Console shows sync logs and toast confirms success.
result: pass

## Summary

total: 9
passed: 8
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "all_projects users removal behavior"
  status: resolved
  reason: "Expected behavior — all_projects:true users see all projects via getAssignedProjectCodes() returning null. Removal sync is correct (arrayRemove no-op). Additional fixes applied: editProject dead variable, reverse sync from Admin>Assignments, operations_user permission handling, expense toast suppression."
  severity: blocker
  test: 5
  root_cause: "all_projects flag overrides assigned_project_codes filtering"
  fixes_applied:
    - "fix(21): use allProjects instead of dead projectsData variable in editProject (2a1650a)"
    - "feat(21): add reverse sync from Admin Assignments to project personnel (f81f8b6)"
    - "fix(21): suppress expense toast on page load (d5fb923)"
    - "fix(21): add sync toast notification + fix permission error for operations_user (e12b45d)"
