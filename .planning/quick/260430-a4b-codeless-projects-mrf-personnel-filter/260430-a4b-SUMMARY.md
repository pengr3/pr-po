---
quick_id: 260430-a4b
slug: codeless-projects-mrf-personnel-filter
status: complete
date: 2026-04-30
commit: 551125d
---

# Quick Task 260430-a4b: Summary

## What changed

`rebuildPSOptions()` in `app/views/mrf-form.js` — two filter updates:

**Projects** (operations_user scoped path):
Before: `projects = cachedProjects.filter(p => assignedCodes.includes(p.project_code));`
After: also passes codeless projects where `uid in personnel_user_ids`

**Services** (services_user scoped path):
Before: `services = cachedServices.filter(s => assignedCodes.includes(s.service_code) && s.active === true);`
After: also passes codeless services where `uid in personnel_user_ids`

## Why

`syncPersonnelToAssignments()` is explicitly skipped for codeless projects (no code to sync to `assigned_project_codes`).
So the only way to know an `operations_user` was assigned to a codeless project is to check `personnel_user_ids` directly.

## Verification

- `all_projects:true` path returns null from getAssignedProjectCodes → untouched
- Coded projects still require the code to be in assignedCodes
- Codeless projects require the user's uid to be in personnel_user_ids — narrower than the previously-reverted "all codeless" pass-through

## Related debug sessions

- `ops-user-mrf-project-filter` (resolved): identified the root cause
- `ops-user-mrf-unassigned-project` (resolved): reverted blanket codeless fix; this task applies the correctly-scoped fix
