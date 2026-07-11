---
status: partial
phase: 108-home-per-role-attention-feeds
source: [108-VERIFICATION.md]
started: "2026-07-11T07:47:58Z"
updated: "2026-07-11T07:47:58Z"
---

## Current Test

[awaiting human testing — load the app on prod/dev and sign in per role]

## Tests

### 1. Per-role feed renders with no module-load error
expected: Sign in (or stub `getCurrentUser`) as each of the 7 roles (super_admin, operations_admin, services_admin, operations_user, services_user, finance, procurement). `await assembleFeed(getCurrentUser())` returns `{ items:[…], total:<number> }` with NO ReferenceError and NO "cannot access 'SEVERITY' before initialization". The Command Center renders the feed rows. (Confirms the engine↔sources SEVERITY cycle is benign at runtime.)
result: [pending]

### 2. Feed content matches the role
expected: finance feed contains `pr-pending:`/`tr-pending:` items; procurement contains `mrf-pending:`/`po-aging:`; super_admin contains `proposal-approval:`/`user-pending:`/`project-overdue:`. Each role sees only its HOME-0X source set.
result: [pending]

### 3. Strategy-A scoped reads (DevTools Network)
expected: costly sources #9/#14/#17/#19 issue scoped reads (a `due_date` or `procurement_status` filter), not whole-collection scans; #6 open-issues issues ≤ (assigned parents + 1) reads (bounded fan-out). No `onSnapshot` listeners opened by the feed.
result: [pending]

### 4. Assignment isolation (no cross-scope leak)
expected: as `operations_user`, `sourceOverdueServices` → `[]` (no service assignment) while `sourceOverdueProjects` returns only assigned project_codes; as `super_admin` both return cross-department rows. A dept admin sees only its home-dept collection.
result: [pending]

### 5. Deep-link clicks route correctly
expected: clicking each feed item navigates to its `deepLink` target — `#/finance`, `#/finance/collectibles`, `#/procurement/records`, `#/projects`, `#/services`, `#/admin?section=user-management` — with no dead links.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
