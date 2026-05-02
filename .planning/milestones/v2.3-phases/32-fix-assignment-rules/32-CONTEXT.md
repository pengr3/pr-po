# Phase 32: Fix Firestore Assignment Rules - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix `firestore.rules` to grant `services_admin` write access to `services_user` documents so that `syncServicePersonnelToAssignments()` can update `assigned_service_codes` arrays without Firestore permission-denied errors. Includes adding emulator tests and deploying updated rules to production. Does not touch client-side filtering logic (already built in Phase 28).

</domain>

<decisions>
## Implementation Decisions

### Permission scope
- `services_admin` update access is restricted to user documents where `role == 'services_user'` — cannot update documents for other roles (operations_admin, finance, super_admin, etc.)
- Field-level restriction within that document: Claude decides based on how existing assignment rules handle similar writes (e.g., whether assigned_project_codes writes are field-restricted)
- Get permission for `services_admin` on user docs: Claude decides based on whether `syncServicePersonnelToAssignments()` requires a preceding read, and what the existing operations_admin pattern does
- The services_user document scope restriction takes priority over mirroring operations_admin (which has no such restriction)

### Test coverage
- Add emulator tests to `firestore.test.js` for the new users collection rules
- Claude determines the specific test scenarios based on the rule logic and existing test structure in that file (positive and negative cases covering the new services_admin permissions)

### Verification approach
- Automated tests must pass first (emulator)
- After production deploy: include a manual checklist in the plan
- Claude determines which of the phase success criteria to include in the checklist based on what the rules change directly enables

### Claude's Discretion
- Exact field restriction syntax in the rules (if any)
- Whether services_admin needs get/read permission on user docs (based on syncServicePersonnelToAssignments implementation)
- Which specific test cases cover the new rules
- Which manual verification steps to include in the plan checklist

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The fix should mirror the services_user filtering restriction pattern already established in Phase 26 (isAssignedToService helper).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 32-fix-assignment-rules*
*Context gathered: 2026-02-19*
