---
phase: quick-260615-nlj
plan: 01
subsystem: procurement
tags: [scoping, security, mrf-visibility, services_user, operations_user]
requires:
  - window.getAssignedProjectCodes (app/utils.js — unchanged)
  - window.getAssignedServiceCodes (app/utils.js — unchanged)
provides:
  - Tightened MRF scope predicates across all 4 filter functions in procurement.js
affects:
  - app/views/procurement.js
tech-stack:
  added: []
  patterns:
    - "null === 'no filter' contract preserved via if (assignedCodes !== null) guards"
key-files:
  created: []
  modified:
    - app/views/procurement.js
decisions:
  - "Removed only the inner `code == null ||` escape term; surrounding `!== null` no-filter guards kept byte-for-byte"
  - "Display-layer change only — firestore.rules and app/utils.js intentionally untouched"
metrics:
  duration: ~10m
  completed: 2026-06-15
---

# Quick 260615-nlj: Tighten MRF Visibility Scoping Summary

Removed the `mrf.project_code == null` / `mrf.service_code == null` leak terms from all 8 MRF scope-predicate sites in `app/views/procurement.js`, so scoped roles now see ONLY their own department's MRFs instead of inheriting every uncoded/cross-department MRF.

## What Changed

At each of the 8 predicate sites the body was reduced from
`mrf.project_code == null || assignedCodes.includes(mrf.project_code)` to the bare
`assignedCodes.includes(mrf.project_code)` (and the service-code analog). The enclosing
`if (assignedCodes !== null) { ... }` / `if (assignedServiceCodes !== null) { ... }` guards
were left untouched, preserving the `null === "no filter"` contract from `app/utils.js`.

The 8 sites span 4 functions:

| Function | Project predicate | Service predicate |
| --- | --- | --- |
| `loadMRFs()` onSnapshot | ~2992 | ~2998 |
| `reFilterAndRenderMRFs()` | ~3065 | ~3071 |
| `reFilterAndRenderPRPORecords()` | ~3097 | ~3102 |
| `loadPRPORecords()` cache-hit | ~5355 | ~5358 |
| `loadPRPORecords()` fresh-fetch | ~5409 | ~5415 |

(5 rows × ... = 8 distinct predicate sites; loadPRPORecords contributes 4 across its two paths.)

## Effect

- `services_user` no longer sees project-type MRFs (`service_code` null).
- `operations_user` no longer sees uncoded MRFs (`project_code` null).
- Truly uncoded legacy MRFs (no project_code AND no service_code) become invisible to scoped roles — intended side effect per plan.
- Cross-department roles (admin/finance/procurement, where `getAssigned*` returns `null`) are unaffected and still see the full unscoped set, because the `!== null` guards short-circuit the filter entirely.

## Verify Gate Result

Plan verify gate — grep for leak terms and confirm guards intact:

```
project_code == null ||      : 0
service_code == null ||      : 0
combined 'code == null ||'   : 0   (PASS — zero remaining)
assignedCodes !== null       : 5   (4 MRF guards + 1 out-of-scope assignment check, all intact)
assignedServiceCodes !== null: 7   (4 MRF guards + 3 out-of-scope, all intact)
```

`node --check app/views/procurement.js` → PASS.

All 8 target predicate bodies confirmed by grep to read exactly `assignedCodes.includes(mrf.project_code)` / `assignedServiceCodes.includes(mrf.service_code)`. The extra `!== null` counts (5 and 7 rather than 4 and 4) come from unrelated, out-of-scope guard sites elsewhere in the file (e.g. the `loadServicesForNewMRF` query block and other assignment checks) which were correctly left untouched.

## Scope Boundaries Honored

- `app/utils.js` — NOT touched (the `null === "no filter"` contract source).
- `firestore.rules` — NOT touched and NOT staged (user's uncommitted WIP — `collection_tranches` + services rule — preserved unstaged).
- The line-~2896 `loadServicesForNewMRF` Firestore `where('service_code','in',...)` query block — NOT touched (out of scope, not an MRF display predicate).

## Deviations from Plan

None — plan executed exactly as written.

## Commit

- `4149736` — fix(procurement): tighten MRF scope predicates to remove null-code leak (app/views/procurement.js only, 10 insertions / 10 deletions)

## Verification (manual UAT — pending user)

Zero-build static SPA; no test harness. Final confirmation is the user's browser UAT:
sign in as a `services_user` (project MRFs must NOT appear), an `operations_user` (uncoded
MRFs must NOT appear), and admin/procurement (everything still appears).

## Self-Check: PASSED

- FOUND: app/views/procurement.js (modified, committed)
- FOUND: commit 4149736 in git log
- Grep verify gate: 0 leak terms remaining
- node --check: PASS
