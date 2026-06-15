# Phase 8: Security Rules Enforcement - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Write, test, and deploy Firebase Security Rules that enforce user status, role permissions, and project assignments server-side across all 9 Firestore collections. This closes the gap where all client-side checks (UI hiding, route blocking, assignment filtering from Phases 5-7) can be bypassed via browser DevTools. Testing uses the Firebase Emulator Suite with `@firebase/rules-unit-testing`. Deployment via Firebase CLI.

</domain>

<decisions>
## Implementation Decisions

### Role-to-collection mapping

**users collection:**
- All signed-in users can read their own document (`request.auth.uid == userId`)
- operations_admin can read AND update user documents **only where `resource.data.role == 'operations_user'`** — scoped to the ops tier, cannot see super_admin, finance, or procurement user docs
- super_admin can read and update any user document
- User self-create enforces `request.resource.data.status == 'pending'` — prevents self-promotion to active
- No client-side delete on users collection (`allow delete: if false`)

**role_templates collection:**
- All active users can read (permissions module needs this on login)
- Only super_admin can write

**invitation_codes collection:**
- Any signed-in user can read (validation during registration)
- super_admin creates codes
- Any signed-in user (including pending) can update (marks code as used during registration — see Registration section)
- No delete

**projects collection:**
- All active users can read
- super_admin + operations_admin can create and delete
- super_admin + operations_admin + finance can update

**mrfs collection:**
- Read (list): all active users, but operations_user is project-scoped (see Legacy data section)
- Read (get): all active users
- Create: super_admin, operations_admin, operations_user, procurement
- Update: super_admin, operations_admin, procurement (operations_user cannot update MRFs after creation)
- Delete: super_admin, operations_admin

**prs collection:**
- Read: all active users, but operations_user is project-scoped (same pattern as mrfs)
- Create: super_admin, operations_admin, procurement
- Update: super_admin, operations_admin, finance, procurement
- Delete: super_admin, operations_admin, procurement

**pos collection:**
- Read: all active users, but operations_user is project-scoped (same pattern as mrfs)
- Create: super_admin, finance (Finance issues POs after approving PRs — separation of duties)
- Update: super_admin, finance, procurement (Procurement tracks PO status: Procuring → Procured → Delivered)
- Delete: super_admin only

**transport_requests collection:**
- Read: all active users, but operations_user is project-scoped (same pattern as mrfs)
- Create: super_admin, operations_admin, operations_user, procurement
- Update: super_admin, operations_admin, finance, procurement
- Delete: super_admin, operations_admin, procurement

**suppliers collection:**
- Read: all active users
- Create/Update/Delete: super_admin, procurement

**deleted_mrfs collection (soft-delete archive):**
- Read: super_admin, operations_admin only
- Create: super_admin, operations_admin (append when MRF is soft-deleted)
- Update: false (append-only archive)
- Delete: false

### Legacy data & project scoping

- operations_user is project-scoped on mrfs, prs, pos, and transport_requests — not just mrfs
- Legacy documents missing `project_code` field OR with empty string `project_code` are visible to ALL operations_users (not filtered out)
- This applies consistently across all four project-scoped collections
- Legacy data will be wiped in a future cleanup — the graceful degradation rules are a safety net, not a long-term migration strategy

### Registration edge cases

- invitation_codes update permission uses `isSignedIn()`, not `isActiveUser()` — registration flow marks codes as used while user is still pending
- Status checking on the pending page is not a requirement — no special rules needed for that
- User self-create rule validates `request.resource.data.status == 'pending'` — defense in depth against self-promotion attack

### Test coverage & deployment

- Test suite targets critical paths only (~15-20 test cases): unauthenticated blocked, pending users blocked, each role's primary operation succeeds, console bypass blocked
- Emulator tests must pass before deploying rules to production
- No browser-based manual verification step required after deploy (emulator gate is sufficient)
- Test dependencies (package.json, node_modules, test files) isolated in `/test` subfolder
- firebase.json stays at repo root (required by Firebase CLI for deploy and emulator)
- firestore.rules at repo root (Firebase CLI convention)

### Claude's Discretion
- Exact test case selection within the "critical paths" scope
- Helper function naming and structure in the rules file
- Whether to split `get` vs `list` or use `allow read` shorthand per collection (use judgment based on whether different logic is needed)
- Mocha vs other test runner choice
- Node.js version specification in test setup

</decisions>

<specifics>
## Specific Ideas

- operations_admin's scoped access to operations_user documents only is a deliberate tier model — not a generic "admin sees all" pattern
- Self-promotion prevention (`status == 'pending'` on create) is a hard rule, not a client-side suggestion
- The project-scoping pattern for operations_user on prs/pos/transport_requests mirrors the mrfs pattern exactly — use the same `isAssignedToProject()` helper and legacy-data conditions
- Legacy data will be wiped — graceful degradation rules are a safety net only

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-security-rules-enforcement*
*Context gathered: 2026-02-04*
