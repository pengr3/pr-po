---
status: resolved
slug: ops-user-mrf-project-filter
trigger: "super_admin can request thru MRF for projects without code however for operations_user it does not appear. Ensure that this does not happen with services as these process are basically same with each other"
created: 2026-04-30T09:05:00Z
updated: 2026-04-30T09:15:00Z
---

## Symptoms

- **Expected:** Both super_admin and operations_user should see all projects (including those without a project code) in the MRF form project/service dropdown
- **Actual:** super_admin sees projects without a code; operations_user does not see those projects in the MRF form
- **Scope:** Also verify services follow the same filtering logic as projects — they should behave identically
- **Error messages:** None reported (silent filtering)
- **Reproduction:** Log in as operations_user, go to MRF form, check project dropdown vs same view as super_admin

## Current Focus

hypothesis: resolved
test: ""
expecting: ""
next_action: "done"

## Evidence

- `rebuildPSOptions()` in `mrf-form.js` line 1208-1211: when `assignedCodes !== null` (i.e. operations_user has an assignment list), the filter was `assignedCodes.includes(p.project_code)`. For clientless projects, `p.project_code` is undefined/null, so `includes(undefined)` returns false — they silently drop out.
- The comment on the same lines correctly stated the intent ("assignment filter applies to coded projects only") but the implementation didn't match.
- `getAssignedProjectCodes()` returns null for super_admin (no filter applied), so super_admin always saw all projects including clientless ones.
- Analogous risk in the services filter (line 1233): `assignedCodes.includes(s.service_code)` would also exclude codeless services for services_user.

## Eliminated

- Firestore Security Rules — query fetches all active projects regardless of role (no per-doc rule restriction on projects collection)
- procurement.js "Create New MRF" — uses `projectsData` directly with no assignment filter, correctly shows all projects

## Resolution

root_cause: "`rebuildPSOptions()` in `mrf-form.js` filtered clientless projects out for `operations_user` because `assignedCodes.includes(undefined)` is always false. The intent (comment says 'filter applies to coded projects only') was never implemented."
fix: "Added `!p.project_code ||` guard to both the projects filter (line 1211) and the services filter (line 1233) in `rebuildPSOptions()` so codeless entries always pass through regardless of role."
verification: "operations_user should now see projects without a project_code in the MRF form dropdown, labeled '(No code yet)'. services_user should see codeless services (if any exist) as well."
files_changed:
  - app/views/mrf-form.js
