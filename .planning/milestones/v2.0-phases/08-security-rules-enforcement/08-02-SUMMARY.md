---
phase: 08-security-rules-enforcement
plan: 02
subsystem: security
tags: [firebase, firestore, security-rules, rbac, server-side-enforcement]

# Dependency graph
requires:
  - phase: 07-project-assignment-system
    provides: assigned_project_codes field on operations_user documents, all_projects flag
  - phase: 06-role-infrastructure
    provides: role_templates collection, user.role field, 5-role system
  - phase: 05-core-authentication
    provides: users collection with status field, Firebase Auth integration
provides:
  - Server-side access control enforcement via Firestore Security Rules
  - Helper functions for reusable permission checks (isActiveUser, hasRole, isAssignedToProject)
  - Project-scoped filtering for operations_user on mrfs/prs/pos/transport_requests
  - Self-promotion prevention (user create enforces status == 'pending')
  - operations_admin scoping (can only access operations_user documents)
  - Legacy data graceful degradation (missing project_code visible to all)
affects: [08-03-security-test-suite, 08-04-production-deployment, 09-super-admin-dashboard, 10-route-protection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Document-read pattern with get() for user document (cached, one billable read per evaluation)"
    - "Short-circuit evaluation with isSignedIn() first to avoid get() on unauthenticated requests"
    - "Helper functions for DRY rules (isActiveUser, hasRole, isRole, isAssignedToProject)"
    - "Graceful degradation for legacy data (isLegacyOrAssigned helper)"
    - "Operations admin tier-scoped access (can only see/modify operations_user docs)"

key-files:
  created:
    - firestore.rules
  modified: []

key-decisions:
  - "Use get() document reads instead of custom claims (no backend/Admin SDK available)"
  - "operations_admin scoped to operations_user tier only (cannot see super_admin, finance, procurement user docs)"
  - "User self-create enforces status == 'pending' to prevent self-promotion attack"
  - "invitation_codes update uses isSignedIn() not isActiveUser() (registration marks code used while pending)"
  - "Legacy data (missing or empty project_code) visible to all active users on project-scoped collections"
  - "Project-scoped filtering for operations_user on mrfs/prs/pos/transport_requests (not just mrfs)"

patterns-established:
  - "Helper function naming: is* for boolean checks, has* for list membership"
  - "Short-circuit guards: always check isSignedIn() before calling getUserData()"
  - "Per-collection match blocks with explicit allow rules (no implicit deny)"
  - "Separate get vs list rules when different logic needed (users collection)"

# Metrics
duration: 2 min
completed: 2026-02-04
---

# Phase 08 Plan 02: Security Rules Enforcement Summary

**Complete Firestore Security Rules with server-side RBAC enforcement for 9 collections, closing the client-side bypass gap**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-04T05:52:59Z
- **Completed:** 2026-02-04T05:55:10Z
- **Tasks:** 1/1
- **Files modified:** 1

## Accomplishments

- Created firestore.rules with 247 lines enforcing server-side access control
- Defined 6 reusable helper functions (isSignedIn, getUserData, isActiveUser, hasRole, isRole, isAssignedToProject, isLegacyOrAssigned)
- Implemented rules for all 9 collections + deleted_mrfs (10 total match blocks)
- Enforced operations_admin scoping (can only read/update operations_user documents, not other admin tiers)
- Prevented self-promotion attack (user self-create enforces status == 'pending')
- Implemented project-scoped filtering for operations_user on mrfs, prs, pos, transport_requests with legacy data handling
- Configured invitation_codes update for registration flow (isSignedIn() not isActiveUser() - marks code used while pending)

## Task Commits

1. **Task 1: Write Firestore Security Rules with helper functions** - `eef0b80` (feat)

**Plan metadata:** (will be added in final commit)

## Files Created/Modified

- `firestore.rules` - Server-side access control for all 9 collections with helper functions, operations_admin scoping, self-promotion prevention, project-scoped filtering, and legacy data handling

## Decisions Made

**1. Document-read pattern with get() instead of custom claims**
- **Rationale:** This project has no backend (static SPA + Firebase only). Custom claims require Firebase Admin SDK (Cloud Functions or server) to set. The get() pattern is the only viable option. Trade-off: one billable read per request evaluation, but document reads to the same path are cached within one evaluation.

**2. operations_admin scoped to operations_user tier only**
- **Rationale:** Per CONTEXT.md locked decision - operations_admin can ONLY read/update user documents where `resource.data.role == 'operations_user'`. This prevents operations_admin from seeing or modifying super_admin, finance, or procurement user accounts. Enforces tier separation.

**3. Self-promotion prevention enforced in rules**
- **Rationale:** User self-create rule validates `request.resource.data.status == 'pending'`. This is defense-in-depth against a self-promotion attack where a malicious user creates their own account with status == 'active' via browser DevTools. Client-side checks are not sufficient.

**4. invitation_codes update uses isSignedIn() not isActiveUser()**
- **Rationale:** Registration flow (register.js) marks invitation codes as used immediately after account creation. At that point, the user is signed in but still has status == 'pending' (not active). Restricting to isActiveUser() would break the registration flow.

**5. Legacy data graceful degradation**
- **Rationale:** MRFs, PRs, POs, and TRs created before Phase 4 may lack `project_code` field or have empty string `project_code`. The isLegacyOrAssigned() helper treats these as visible to all active users (not filtered by project assignment). This matches the client-side defensive pattern in procurement.js (lines 501-502). Note: Legacy data will be wiped in a future cleanup - these rules are a safety net, not a long-term migration strategy.

**6. Project-scoped filtering applies to all four collections**
- **Rationale:** CONTEXT.md locked decision - operations_user is project-scoped on mrfs, prs, pos, and transport_requests (not just mrfs). The same isLegacyOrAssigned() check is used consistently across all four collections.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all requirements satisfied in a single task.

## User Setup Required

None - no external service configuration required. Security Rules are a Firebase feature (already configured in this project).

## Next Phase Readiness

**Ready for 08-03-PLAN.md (Security Rules Test Suite)**

The rules file is complete and ready for testing. Next steps:
- Install test dependencies (@firebase/rules-unit-testing, mocha, Node.js)
- Write unit tests for critical paths (~15-20 test cases)
- Verify unauthenticated blocked, pending users blocked, each role's primary operations succeed
- Test console bypass scenarios (attempt to bypass client-side checks via browser DevTools - rules should block)

**Blockers:** None

**Concerns:** None - all locked decisions from CONTEXT.md implemented correctly

---
*Phase: 08-security-rules-enforcement*
*Completed: 2026-02-04*
