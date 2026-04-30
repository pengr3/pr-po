---
status: resolved
slug: ops-user-mrf-unassigned-project
trigger: "careful with this user can MRF a project that is not assigned to its name why is that? Kindly fix this is a bug"
created: 2026-04-30T09:20:00Z
updated: 2026-04-30T09:25:00Z
---

## Symptoms

- **Expected:** operations_user should only be able to submit MRFs for projects explicitly assigned to them
- **Actual:** operations_user could see and MRF codeless projects (those with no project_code) that were never in their assigned_project_codes list
- **Root cause introduced by:** previous fix to ops-user-mrf-project-filter session

## Current Focus

hypothesis: resolved
next_action: done

## Resolution

root_cause: "Previous fix added `!p.project_code ||` guard to `rebuildPSOptions()` in mrf-form.js, making ALL codeless projects visible to ALL operations_users with specific assignments. Codeless projects can never appear in `assigned_project_codes` (there's no code to assign by), so they were always 'unassigned' — the guard was too broad."

fix: "Reverted both the projects filter (line 1211) and services filter (line 1233) in rebuildPSOptions() to the strict `assignedCodes.includes(p.project_code)` form. Users with `all_projects: true` already see everything (including codeless) via the null-return path in getAssignedProjectCodes(). Users with specific codes see only those coded projects."

verification: "operations_user with assigned_project_codes=['CODE-A'] should only see CODE-A in the MRF dropdown, not codeless projects. operations_user with all_projects:true should see all projects including codeless ones."

files_changed:
  - app/views/mrf-form.js
