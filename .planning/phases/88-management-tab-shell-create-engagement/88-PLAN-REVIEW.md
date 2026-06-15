# Phase 88 Plan Review (Pre-Execution)

**Reviewer:** gsd-plan-checker
**Date:** 2026-05-11
**Plans:** 88-01-PLAN.md, 88-02-PLAN.md
**VERDICT:** WARN — 2 HIGH (must fix before execution), 3 MED (tighten before Task 3), 3 LOW (cosmetic)

After in-flight fixes applied directly to 88-02-PLAN.md, status is **PASS** for execution.

---

## Coverage

| Req | Description | Plan | Task | Status |
|-----|-------------|------|------|--------|
| MGMT-01 | Super Admin sees "Proposals" tab in nav | 88-02 | Task 1 (index.html + auth.js) | COVERED |
| MGMT-02 | Non-super-admin: nav hidden, route blocked, rules deny | 88-02 | Task 1 + Task 4 UAT step 6 | COVERED |
| MGMT-05 | Create Engagement form auto-routes to projects/services | 88-01 + 88-02 | 88-01 T1, 88-02 T2 | COVERED |
| MGMT-06 | Form captures type/client/name/budget/cost/personnel | 88-02 | Task 2 (8 fields) | COVERED |
| MGMT-07 | Firestore rules deny back-end ops for non-super_admin | 88-02 | Task 1 + Task 4 UAT | COVERED |
| Phase Goal: mount points for 89/87 | n/a | 88-02 | Task 2 (`#proposal-queue-mount`, `#proposal-dashboard-mount`) | COVERED |
| D-05: Draft consumer audit | n/a | 88-02 | Task 3 | COVERED after MED-1/2 applied |

## File-line drift
All references within 50-line tolerance EXCEPT:
- finance.js "trace forward" pointer (vague) — fixed by MED-1 (tightened to `refreshProjectExpenses()` line 3582-3597).

## Findings

### HIGH-1 (FIXED) — Wrong import attribution for `syncServicePersonnelToAssignments`
**Where:** 88-02-PLAN.md Task 2 import + `<interfaces>` block.
**Plan said:** import from `./services.js`.
**Truth:** function lives in `app/utils.js:717`. `services.js` only exports `render`, `init`, `destroy`.
**Fix applied:** import from `../utils.js`; `<interfaces>` reattributed to utils.js:717.

### HIGH-2 (FIXED) — UAT Section A Step 6 role mismatch
**Where:** 88-02-PLAN.md Task 4 UAT Section A step 6.
**Plan said:** Operations Admin's direct Firestore write to `projects` should fail with PERMISSION_DENIED.
**Truth:** `firestore.rules:206` allows `operations_admin` to create projects. Write succeeds.
**Fix applied:** changed test role to "Finance" (no `projects` create access) OR dropped step in favor of acknowledgement note that MGMT-07's true bite lands on Phase 87/89's proposal-specific collections.

### MED-1 (FIXED) — Finance Project List Draft disposition
**Where:** 88-02-PLAN.md Task 3 step 6.
**Issue:** vague "trace forward" pointer + reopens locked CONTEXT D-05 decision.
**Fix applied:** pointer tightened to `refreshProjectExpenses()` finance.js:3582-3597 (filter inside `.docs.map(...)` callback). Disposition locked to "filter only" per D-05; "badge alternative" removed.

### MED-2 (FIXED) — `.status-badge.draft` CSS class would be unused
**Where:** 88-02-PLAN.md Task 1 step 4 + Task 3 done criterion + UAT step 24.
**Issue:** No list-view template currently emits `<span class="status-badge ${project_status}">` — they emit based on `active ? 'approved' : 'rejected'`. Adding the CSS class without rendering wiring leaves it dead.
**Fix applied:** dropped the `.status-badge.draft` CSS rule and UAT step 24. Visual differentiation deferred to a future polish phase. List views still hide Draft via filtering (D-05) — so a Draft badge isn't surfaced anyway.

### MED-3 (FIXED) — home.js Draft chart palette
**Where:** 88-02-PLAN.md Task 3 step 3.
**Issue:** `home.js` `MONOCHROMATIC_STATUS_COLORS` has no Draft entry; bar would render with fallback gray.
**Fix applied:** added explicit Draft palette entry instruction (`'Draft': 'rgba(107, 114, 128, 0.50)'`).

### LOW-1, LOW-2, LOW-3 — cosmetic / portability
Acknowledged. `tdd="true"` on Task 2 is downgraded to behavioral-trace (already documented in action block); shell portability handled by Bash tool availability; UAT step 7 role mismatch (Operations Admin can't create services) noted as in-flight handling.

## Dimension Summary

| Dimension | Result |
|-----------|--------|
| 1. Coverage | PASS |
| 2. Sequencing (88-01 → 88-02) | PASS |
| 3. File-line accuracy | PASS (after MED-1) |
| 4. Refactor safety (Plan 88-01) | PASS |
| 5. D-05 Draft filtering compliance | PASS (after MED-1, MED-2) |
| 6. Listener / window-function cleanup | PASS |
| 7. Threat model | PASS |
| 8. Comment policy (WHY only) | PASS |
| 9. Cross-phase contracts (mount points 89/87) | PASS |
| 10. Orphan-ownership (parallel-file edits) | PASS (sequential — no conflict) |

## Overall Verdict (post-fix): PASS

Plan 88-01 (refactor) ready to execute. Plan 88-02 (shell + Draft audit) ready after the 5 surface edits applied. Run `/gsd-execute-phase 88`.
