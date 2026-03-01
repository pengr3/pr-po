---
phase: 49-security-audit
plan: 02
subsystem: auth
tags: [firebase, firestore, security-rules, auth, role-based-access, session-management]

# Dependency graph
requires:
  - phase: 49-security-audit plan 01
    provides: CONTEXT.md with audit scope, accepted risks, and phase decisions

provides:
  - Audited Firestore Security Rules for all 12 collections + 2 subcollections
  - Field-level restriction on users self-update preventing role escalation
  - Documented invitation_codes accepted risk with full justification
  - Auth edge case fix: Firestore listener failure now forces logout + redirect
  - Security audit block comment in firestore.rules documenting all findings

affects: [49-security-audit-plan-03, SECURITY-AUDIT.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Field-level Firestore rule restriction using !('field' in request.resource.data)"
    - "onSnapshot error callback forces signOut + redirect instead of silently logging"

key-files:
  created: []
  modified:
    - firestore.rules
    - app/auth.js

key-decisions:
  - "invitation_codes open read/update rules are documented ACCEPTED RISK — intentional design confirmed"
  - "users self-update restricted to non-sensitive fields (role, status, invitation_code blocked from self-update)"
  - "Firestore listener error callback now forces logout rather than leaving user in broken authenticated state"

patterns-established:
  - "Field-level self-update restriction pattern: !('role' in request.resource.data) && !('status' in request.resource.data)"
  - "Auth listener failure = force logout: onSnapshot error -> signOut -> redirect to /login"

requirements-completed: [SEC-04, SEC-05]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 49 Plan 02: Firebase Security Rules & Auth Edge Cases Summary

**Firestore Security Rules audited across all 12 collections and 2 subcollections — role escalation vulnerability fixed via field-level self-update restriction; auth session listener failure now forces graceful logout**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-01T08:20:32Z
- **Completed:** 2026-03-01T08:23:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Audited all 12 Firestore collections + 2 subcollections against least-privilege principle; all collections verified
- Fixed role escalation vulnerability: users can no longer change their own `role`, `status`, or `invitation_code` fields via self-update
- Documented invitation_codes open rules as ACCEPTED RISK with complete justification in firestore.rules
- Added security audit block comment in firestore.rules cataloging all 6 findings/verifications from 2026-03-01 audit
- Fixed auth session edge case: Firestore listener error callback now forces signOut + redirect to login instead of silently logging

## Task Commits

Each task was committed atomically:

1. **Task B1: Audit Firebase Security Rules for authorization gaps** - `3b93daa` (fix)
2. **Task B2: Review auth edge cases and address gaps** - `a918027` (fix)

**Plan metadata:** (committed as part of final docs commit)

## Files Created/Modified
- `firestore.rules` - Added field-level self-update restriction on users collection, ACCEPTED RISK documentation for invitation_codes, security audit summary block
- `app/auth.js` - Fixed onSnapshot error callback to force logout on listener failure instead of silently logging

## Decisions Made
- `invitation_codes` open read/update rules are ACCEPTED RISK — confirmed per CONTEXT.md. Codes are random strings; real security is in the pending-user approval workflow. Documented with full rationale in firestore.rules.
- Self-update restriction blocks `role`, `status`, and `invitation_code` fields from self-modification. These are the three fields that could be exploited for privilege escalation or identity fraud.
- `invitation_code` added to the self-update blocklist even though escalation via that field is less obvious — prevents a user from reassigning their own invite code linkage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Role escalation vulnerability in users self-update rule**
- **Found during:** Task B1 (Firebase Security Rules audit)
- **Issue:** The `allow update` rule for the users collection allowed any signed-in user to update their own document including the `role` and `status` fields (`request.auth.uid == userId` with no field restriction). A user could POST a Firestore update changing their own role to `super_admin`.
- **Fix:** Added field-level guards to the self-update branch: `!('role' in request.resource.data) && !('status' in request.resource.data) && !('invitation_code' in request.resource.data)`
- **Files modified:** `firestore.rules`
- **Verification:** Admin-initiated updates (super_admin, operations_admin, services_admin branches) are unaffected; only the self-update branch is restricted
- **Committed in:** `3b93daa` (Task B1 commit)

**2. [Rule 2 - Missing Critical] Firestore listener error callback silently swallowed errors**
- **Found during:** Task B2 (auth edge case review)
- **Issue:** The `onSnapshot` error callback on the user document listener only logged the error. If the auth token expired and could not be refreshed during an active session, the user would remain in the authenticated UI with no data access — a broken state with no recovery path.
- **Fix:** Extended the error callback to call `signOut(auth)` and redirect to `#/login`, ensuring the user returns to a clean unauthenticated state to re-authenticate.
- **Files modified:** `app/auth.js`
- **Verification:** Code path confirmed: listener error -> unsubscribe -> signOut -> redirect to /login (even if signOut fails, redirect still happens)
- **Committed in:** `a918027` (Task B2 commit)

---

**Total deviations:** 2 auto-fixed (1 security bug, 1 missing critical error handling)
**Impact on plan:** Both fixes were directly identified during the planned audit tasks. No scope creep.

## Issues Encountered

- The `app/auth.js` file was modified by a linter between reads (several `console.log` statements were removed). The security fix was applied to the linter-cleaned version. The removed log statements were debug logs that were already captured by `console.error` statements at the same locations — no functional regression.

## User Setup Required

None - no external service configuration required. Security Rules changes take effect upon next Firebase deploy.

## Next Phase Readiness
- firestore.rules and app/auth.js are audited and hardened
- All findings documented in this SUMMARY for inclusion in Plan C's SECURITY-AUDIT.md
- Key findings for Plan C: role escalation fix, invitation_codes accepted risk, listener failure recovery
- No blockers for Plan 03 (SECURITY-AUDIT.md report creation)

## Self-Check: PASSED

- FOUND: `firestore.rules`
- FOUND: `app/auth.js`
- FOUND: `.planning/phases/49-security-audit/49-02-SUMMARY.md`
- FOUND commit: `3b93daa` (Task B1 - Security Rules audit)
- FOUND commit: `a918027` (Task B2 - Auth edge cases)
- FOUND commit: `3a90ec2` (Plan metadata)

---
*Phase: 49-security-audit*
*Completed: 2026-03-01*
