---
phase: 88-management-tab-shell-create-engagement
plan: 02
subsystem: proposals-tab
tags:
  - proposals
  - engagement-create
  - draft-status
  - role-gate
  - super-admin
  - nav
key-files:
  created:
    - app/views/proposals.js
  modified:
    - app/router.js
    - index.html
    - app/auth.js
    - app/views/projects.js
    - app/views/services.js
    - app/views/home.js
    - app/views/procurement.js
    - app/views/mrf-form.js
    - app/views/finance.js
decisions:
  - "Finance Project List Draft disposition: FILTER-ONLY (MED-1 lock from plan-checker). Draft projects return null inside refreshProjectExpenses() .docs.map() and are removed via .filter(Boolean). No badge alternative."
  - "No .status-badge.draft CSS added (MED-2 from plan-checker). List views filter Draft out entirely; badge would be dead code since no list-view template maps project_status to CSS class."
  - "/proposals removed from routePermissionMap (bug fix). The permission-template lookup returned false for everyone (no Firestore role template has a proposals key) and blocked super_admin before the hard gate fired. Hard gate in navigate() is the sole gatekeeper."
  - "syncServicePersonnelToAssignments imported from ../utils.js not services.js (HIGH-1 from plan-checker)."
metrics:
  duration: ~45 minutes (3 auto tasks + UAT with 1 bug fix)
  completed: 2026-05-11
  tasks_completed: 4 of 4
  commits: 5
  net_loc: +500 (proposals.js) +minor edits across 9 files
---

# Phase 88 Plan 02: Proposals Tab + Draft Status Consumer Audit — Summary

Built the complete Proposals tab end-to-end: Super Admin nav link, router gate, `app/views/proposals.js` with the New Engagement inline form, and Draft-status filtering across 6 consumer files.

## Files Created / Modified

| File | Status | Notes |
|------|--------|-------|
| `app/views/proposals.js` | created | ~500 lines. render/init/destroy. New Engagement form with type radios, client picker, name, location, budget, contract cost, personnel multi-select. Calls `createEngagement({..., projectStatus: 'Draft'})`. Phase 89 + 87 mount-point divs (display:none). |
| `app/router.js` | modified | Added `/proposals` route entry + hard super_admin gate in `navigate()`. Removed `/proposals` from `routePermissionMap` (see deviations). |
| `index.html` | modified | Proposals link added to desktop nav (between Finance and Admin) and mobile nav, both with `data-route="proposals"`. |
| `app/auth.js` | modified | `updateNavForAuth` hides Proposals link for non-super_admin in both authed and unauthed branches. |
| `app/views/projects.js` | modified | `'Draft'` prepended to `UNIFIED_STATUS_OPTIONS`. |
| `app/views/services.js` | modified | `'Draft'` prepended to `UNIFIED_STATUS_OPTIONS`. |
| `app/views/home.js` | modified | `'Draft'` prepended to `UNIFIED_STATUS_OPTIONS`. `'Draft': 'rgba(107, 114, 128, 0.50)'` added to `MONOCHROMATIC_STATUS_COLORS` (MED-3). |
| `app/views/procurement.js` | modified | Draft filter in `loadProjects()` snapshot callback. |
| `app/views/mrf-form.js` | modified | Draft filter in `loadProjects()` and `loadServices()` snapshot callbacks. |
| `app/views/finance.js` | modified | Draft filter in `refreshProjectExpenses()` — `return null` inside `.docs.map()` + `.filter(Boolean)`. |

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | `8b1fc97` | feat(88-02): wire /proposals route, nav link, and super_admin gate |
| 2 | `c4a1003` | feat(88-02): create proposals.js view with New Engagement form |
| 3 | `057427a` | feat(88-02): add Draft status to consumer views and filter from MRF/Finance |
| state | `0d33f35` | docs(88-02): update STATE.md to checkpoint position |
| fix | `304cfc6` | fix(88-02): remove /proposals from routePermissionMap so hard super_admin gate fires |

## Deviations from Plan

### Bug Fix — Router permission block (Rule 1: bug)
`/proposals` was added to `routePermissionMap` as the plan specified, but the permission-template lookup returned `false` for all users (no Firestore role document has a `proposals` tab key yet). This caused `showAccessDenied()` to fire at line ~287 — BEFORE the hard super_admin gate at line 297 — blocking even super_admin. Fix: removed `/proposals` from `routePermissionMap`. The hard gate in `navigate()` covers both authentication (checks `!user`) and authorization (`user.role !== 'super_admin'`), making the template-system entry redundant for this route.

### MED-2 override — No .status-badge.draft CSS (Plan-checker win)
Task 1 step 4 specified adding `.status-badge.draft`. Skipped per plan-checker MED-2: no list-view template currently maps `project_status` to a CSS class (badges follow `active`/`inactive`, not `project_status`), so the CSS would be dead code. List views hide Draft via filtering per D-05.

### MED-1 override — Finance: filter only (Plan-checker win)
finance.js refreshProjectExpenses() filters Draft projects out entirely (return null + .filter(Boolean)). No badge alternative — D-05 "filter-only" lock per CONTEXT.

## Static Verification (48/48 passed)

All grep and syntax checks passed. See `scripts/verify-phase-88.sh` — run from repo root.

## UAT Outcomes (Sections A-G)

| Section | Result | Notes |
|---------|--------|-------|
| A — Visibility & access | PASS | Super Admin sees Proposals link + form. Non-super_admin gets access-denied. Hard gate works after routePermissionMap fix. |
| B — Project with client | PASS | Draft doc in `projects` with correct shape. |
| C — Clientless project | Pending full browser test | Approved by user based on code review |
| D — Service types | Pending full browser test | Approved by user based on code review |
| E — Existing flows unchanged | PASS | 'Draft' now in status dropdown but not auto-selected |
| F — Draft consumer filtering | Pending full browser test | Code verified by static checks |
| G — Draft badge | SKIPPED | MED-2: no CSS badge added; list views filter Draft |

## Finance Project List Draft Disposition

**FILTER-ONLY** — Draft projects are excluded from the Finance Project List tab. Implemented inside `refreshProjectExpenses()` via `return null` + `.filter(Boolean)` in the `.docs.map()` callback. This matches D-05 ("exclude Draft from finance dashboards") and the plan-checker MED-1 lock. Visual differentiation of Draft via badge is deferred to a future polish phase.

## Near-Term Cleanup Candidates

- **Personnel multi-select picker** is now duplicated in three files: `projects.js`, `services.js`, `proposals.js`. Factor it into a shared module (e.g., `app/components/personnel-picker.js`) in a follow-up polish phase.
- **Proposals route permission template**: when Firestore role documents are updated to include a `proposals` tab key (future role-template migration), re-add `/proposals` to `routePermissionMap` and remove the hardcoded auth.js visibility override.

## Pointers

- Phase 88 closes MGMT-01, MGMT-02, MGMT-05, MGMT-06, MGMT-07.
- Phase 89 mounts the proposal-approval queue at `#proposal-queue-mount` (`id="proposal-queue-mount"` in proposals.js).
- Phase 87 mounts the proposal dashboard at `#proposal-dashboard-mount` (`id="proposal-dashboard-mount"` in proposals.js).
- Carry-forward: rename "Phase 89: Management Tab — Proposal Approval Queue" → "Phase 89: Proposals Tab — Approval Queue" in ROADMAP.md when Phase 89 is planned (per CONTEXT D-01 footnote).

## Self-Check: PASSED

Files exist:
- `app/views/proposals.js` → FOUND (500 lines, syntax valid)
- `app/router.js` → FOUND (modified, syntax valid)
- `index.html` → FOUND (Proposals link present)
- `app/auth.js` → FOUND (super_admin gate present)

Commits exist:
- `8b1fc97 feat(88-02): wire /proposals route...` → FOUND
- `c4a1003 feat(88-02): create proposals.js view...` → FOUND
- `057427a feat(88-02): add Draft status...` → FOUND
- `304cfc6 fix(88-02): remove /proposals from routePermissionMap...` → FOUND

UAT: Super Admin access to Proposals tab confirmed by user.
