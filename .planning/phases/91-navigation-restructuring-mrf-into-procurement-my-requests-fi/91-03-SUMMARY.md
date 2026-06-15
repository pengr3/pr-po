---
phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi
plan: 03
subsystem: ui
tags: [permissions, sub-tab, mrf-form, procurement, delegation]

# Dependency graph
requires:
  - phase: 91-01
    provides: 4 new sub-tab permission keys (procurement_request, procurement_mrfs, procurement_suppliers, procurement_records) in seed-roles.js
  - phase: 91-02
    provides: /mrf-form route retired; procurement defaultTab changed to 'request'; nav links removed
provides:
  - Procurement view renders "Request" sub-tab (first) delegating to mrf-form.js render/init/destroy
  - Per-sub-tab access gating in tab row using canSeeXxx !== false flags
  - Default-tab fallthrough in init(): inaccessible request falls to mrfs > suppliers > records
  - mrf-form.js canEdit check reads procurement_request key (not mrf_form)
affects: [91-04, procurement-view, mrf-form-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ES module delegation via import * as mrfFormModule — procurement.js calls mrfFormModule.render/init/destroy
    - Sub-tab access flag pattern: hasTabAccess?.('key') !== false (bootstrap-safe permissive default)
    - _requestSubTabActive flag guards mrfFormModule.destroy() teardown in procurement.destroy()

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - app/views/mrf-form.js

key-decisions:
  - "mrfFormModule delegation (import * as): cleaner than inlining 600-line mrf-form logic into already-8000-line procurement.js"
  - "!== false permissive default for hasTabAccess: undefined during bootstrap shows tab (over-show > over-hide per T-91.3-04)"
  - "Request branch returns early from init() skipping procurement data pipeline — request sub-tab has its own data lifecycle in mrf-form.js"
  - "mrfFormModule.destroy() wrapped in try/catch with console.error — T-91.3-05 mitigate: orphaned listeners prevented even if destroy throws"
  - "deployment note: super_admin must run window.forceReseedRoleTemplates() once post-deploy so role docs carry the 4 new sub-tab keys; until then !==false guard treats undefined as accessible (over-show is safer)"

patterns-established:
  - "Sub-tab DOM gating: ${canSeeXxx ? '<a href=...>TabName</a>' : ''} — tabs absent from DOM when access is false"
  - "Module delegation lifecycle: set _moduleActive = true before init(), check flag in destroy() before tearing down"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-05-13
---

# Phase 91 Plan 03: Request Sub-tab Integration and Sub-tab Access Gating Summary

**Procurement view gains a "Request" first sub-tab delegating to mrf-form.js exports, with per-sub-tab DOM gating via 4 new permission keys and a D-01 fallthrough for inaccessible-request users**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-13T07:40:00Z
- **Completed:** 2026-05-13T07:55:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Procurement view tab row now emits 4 conditional anchors (Request / MRF Processing / Supplier Management / MRF Records) — each absent from DOM when its `hasTabAccess()` key returns false
- Navigating to `#/procurement/request` renders the full MRF submission form via `mrfFormModule.render('form')` and initializes it via `mrfFormModule.init('form')`; navigating away cleanly tears down mrf-form listeners via `mrfFormModule.destroy()`
- `mrf-form.js` canEdit check reads `procurement_request` key — finance role (access:false) sees view-only notice, not the form

## Task Commits

1. **Task 1: Wire Request sub-tab into procurement.js render()** - `ed6b38f` (feat)
2. **Task 2: Wire Request sub-tab init and destroy hooks** - `ee85111` (feat)
3. **Task 3: Patch mrf-form.js canEdit check** - `1c5cdb8` (fix)

## Files Created/Modified
- `app/views/procurement.js` - Added mrfFormModule import, _requestSubTabActive flag, 4 canSeeXxx flags in render(), conditional tab row, request-section delegation, default-tab fallthrough in init(), mrfFormModule.init/destroy hooks
- `app/views/mrf-form.js` - Changed canEditTab('mrf_form') to canEditTab('procurement_request') at render() line 159

## Decisions Made
- Delegation pattern (import * as mrfFormModule) chosen over inlining — avoids adding 600 lines to already-large procurement.js, preserves single-source-of-truth for form logic
- `!== false` permissive default for all 4 hasTabAccess checks — undefined during bootstrap treats tab as accessible (over-show), matching auth.js line 413 default-to-true behavior; T-91.3-04 accepted
- Request branch returns early from init() — the mrf-form module manages its own data pipeline; procurement's loadProjects/loadSuppliers/etc. pipeline is irrelevant and would waste Firestore reads
- `_requestSubTabActive` flag pattern — same module-delegation lifecycle used in other multi-view SPA patterns; ensures mrfFormModule.destroy() is called exactly once when needed

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## Deployment Note

After this plan ships, a super_admin must run `window.forceReseedRoleTemplates()` once from the browser console to push the 4 new sub-tab permission keys to all Firestore role documents (per Plan 01 T-91.1-02 / T-91.3-04). Until then, `hasTabAccess('procurement_request')` returns `undefined` for users on old role docs — the `!== false` guard treats this as accessible (over-show), which is the safer failure mode.

## Next Phase Readiness
- Plan 04 can now add the "My Requests" sub-tab inside mrf-form.js and wire the Records tab project-scope filtering
- procurement.js and mrf-form.js are both clean with no orphaned patterns to clean up

---
*Phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi*
*Completed: 2026-05-13*
