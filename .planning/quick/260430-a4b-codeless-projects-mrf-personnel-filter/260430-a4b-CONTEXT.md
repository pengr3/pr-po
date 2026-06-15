# Quick Task 260430-a4b: codeless projects/services with assigned personnel_user_ids should appear in MRF - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Task Boundary

In `rebuildPSOptions()` (mrf-form.js), when an `operations_user` has specific `assigned_project_codes`,
codeless projects (project_code === null) are filtered out because `assignedCodes.includes(null)` is always false.
The same pattern exists for `services_user` with codeless services.

The fix: also include codeless entries where the current user's uid is in the entry's `personnel_user_ids` array.
This is the correct scoped fix (differs from the previously-reverted "all codeless" blanket pass-through).

</domain>

<decisions>
## Implementation Decisions

### Why personnel_user_ids (not blanket codeless pass-through)
- Prior debug: `ops-user-mrf-project-filter` — blanket `!p.project_code ||` was too broad (all operations_users saw all codeless projects)
- Prior debug: `ops-user-mrf-unassigned-project` — reverted to strict filter
- Correct fix: codeless entry passes only if `uid in personnel_user_ids` — user must be explicitly assigned

### Firestore rules
- Projects: `allow read: if isActiveUser()` — no rule change needed; all active users already read all projects
- Services: codeless services don't exist in practice (service_code always generated at creation); no rule change needed

### Services query (loadServices)
- For services_user, query uses `where('service_code', 'in', assignedCodes)`. Codeless services can't be fetched this way.
- Since services are always coded, no query change needed — only `rebuildPSOptions()` needs the defensive services fix.

### Scope
- Change only `rebuildPSOptions()` in mrf-form.js (projects filter + services filter)
- No Firestore rules changes
- No loadServices() query changes

### Claude's Discretion
- Comment wording in new filter line

</decisions>

<specifics>
## Specific Ideas

Projects filter (line ~1208-1213) in rebuildPSOptions():
- Current: `projects = cachedProjects.filter(p => assignedCodes.includes(p.project_code));`
- New: also pass codeless projects where `uid in personnel_user_ids`
- Implementation: `!p.project_code && uid && (p.personnel_user_ids || []).includes(uid)`

Services filter (line ~1231-1234) in rebuildPSOptions():
- Current: `services = cachedServices.filter(s => assignedCodes.includes(s.service_code) && s.active === true);`
- New: also pass codeless services where `uid in personnel_user_ids`
- Implementation: same pattern as projects

</specifics>

<canonical_refs>
## Canonical References

- .planning/debug/ops-user-mrf-project-filter.md — first fix attempt (too broad, reverted)
- .planning/debug/ops-user-mrf-unassigned-project.md — revert session (strict filter restored)
- app/utils.js:643 — syncPersonnelToAssignments() skips when !projectCode (codeless → no assigned_project_codes sync)
- app/utils.js:717 — syncServicePersonnelToAssignments() skips when !serviceCode (same pattern)

</canonical_refs>
