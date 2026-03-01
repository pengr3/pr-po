---
phase: 47-fix-sortable-headers-login-logo-and-urgency-propagation-to-finance
plan: 02
subsystem: ui
tags: [firebase, firestore, login, auth, urgency, procurement, finance]

# Dependency graph
requires:
  - phase: 45-visual-polish
    provides: register.js logo pattern (onerror fallback, .auth-logo img CSS rule)
provides:
  - Login page shows CLMC logo matching register.js (consistent branding)
  - PRs generated via generatePR() carry urgency_level from parent MRF
  - PRs generated via generatePRandTR() carry urgency_level from parent MRF
affects: [finance, procurement, login, register]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "onerror fallback on auth logo img for graceful broken-image handling"
    - "urgency_level denormalized from MRF to PR at generation time with || 'Low' default"

key-files:
  created: []
  modified:
    - app/views/login.js
    - app/views/procurement.js

key-decisions:
  - "Login logo replaced inline with img tag matching register.js exactly — no new CSS required, .auth-logo img rule in views.css already provides sizing"
  - "urgency_level: mrfData.urgency_level || 'Low' default matches existing pattern in TR addDoc calls and finance.js renderMaterialPRs() fallback"
  - "No backfill of existing PR documents — finance.js renderMaterialPRs() || 'Low' default handles old records gracefully"

patterns-established:
  - "PR addDoc denormalization: all MRF fields copied at generation time (department, requestor_name, urgency_level, project_code, service_code)"

requirements-completed: [BRD-02, URG-01]

# Metrics
duration: 5min
completed: 2026-02-28
---

# Phase 47 Plan 02: Login Logo and Urgency Propagation to Finance Summary

**CLMC logo added to login page (matching register.js) and urgency_level now propagated from MRF to PR documents in both generatePR() and generatePRandTR(), enabling correct urgency badges in Finance Pending Approvals.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-28T12:31:00Z
- **Completed:** 2026-02-28T12:36:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced CL blue square placeholder on login page with CLMC PNG logo (onerror fallback for dev environments where file may be absent)
- Added `urgency_level: mrfData.urgency_level || 'Low'` to the prDoc object in generatePR() — Finance will now see the correct urgency badge for PRs from the standard generate flow
- Added `urgency_level: mrfData.urgency_level || 'Low'` to the PR addDoc call in generatePRandTR() — mixed-item MRFs (PR + TR) also propagate urgency correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace login page CL placeholder with company logo** - `4a12230` (feat)
2. **Task 2: Add urgency_level to PR addDoc calls in generatePR() and generatePRandTR()** - `af7344f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/login.js` - auth-logo div replaced with img tag matching register.js pattern
- `app/views/procurement.js` - urgency_level added to two PR addDoc locations (lines 3309 and 3595)

## Decisions Made
- Login logo replaced inline with img tag matching register.js exactly — no new CSS required, `.auth-logo img` rule in views.css already provides `max-width: 120px; height: auto; display: inline-block;`
- `|| 'Low'` default for urgency_level matches the existing pattern already used in both TR addDoc calls (lines 3046 and 3660) and in `finance.js renderMaterialPRs()` fallback — consistent across the codebase
- No backfill of existing PR documents — finance.js `renderMaterialPRs()` `|| 'Low'` default handles old records gracefully without migration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 47-01 (sortable table headers) is independent and can proceed
- Finance Pending Approvals urgency display is now correct for all newly generated PRs
- Login page branding is consistent with register page

---
*Phase: 47-fix-sortable-headers-login-logo-and-urgency-propagation-to-finance*
*Completed: 2026-02-28*

## Self-Check: PASSED
- app/views/login.js: FOUND
- app/views/procurement.js: FOUND
- 47-02-SUMMARY.md: FOUND
- Commit 4a12230: FOUND
- Commit af7344f: FOUND
