---
status: complete
phase: 108-home-per-role-attention-feeds
source: [108-VERIFICATION.md]
started: "2026-07-11T07:47:58Z"
updated: "2026-07-13T05:52:28Z"
---

## Current Test

number: —
name: All tests complete
expected: |
  All 5 UAT items passed (operator-confirmed 2026-07-13). Phase 108 ready to
  mark complete.
awaiting: none

## Tests

### 1. Per-role feed renders with no module-load error
expected: Sign in (or stub `getCurrentUser`) as each of the 7 roles (super_admin, operations_admin, services_admin, operations_user, services_user, finance, procurement). `await assembleFeed(getCurrentUser())` returns `{ items:[…], total:<number> }` with NO ReferenceError and NO "cannot access 'SEVERITY' before initialization". The Command Center renders the feed rows. (Confirms the engine↔sources SEVERITY cycle is benign at runtime.)
result: pass — feed renders, no module-load ReferenceError / SEVERITY init error (operator-confirmed 2026-07-13)

### 2. Feed content matches the role
expected: finance feed contains `pr-pending:`/`tr-pending:` items; procurement contains `mrf-pending:`/`po-aging:`; super_admin contains `proposal-approval:`/`user-pending:`/`project-overdue:`. Each role sees only its HOME-0X source set.
result: pass — each role's feed shows only its own item types, no cross-role leakage, no errors (operator-confirmed 2026-07-13)

### 3. Strategy-A scoped reads (DevTools Network)
expected: costly sources #9/#14/#17/#19 issue scoped reads (a `due_date` or `procurement_status` filter), not whole-collection scans; #6 open-issues issues ≤ (assigned parents + 1) reads (bounded fan-out). No `onSnapshot` listeners opened by the feed.
result: pass — Check A (no auto-update → no onSnapshot) + Check B (all 200, runAggregationQuery count queries, bounded scoped-read burst, tiny payloads, DOMContentLoaded 245ms, no red rows; long gsessionid channel is the SDK's persistent WebChannel transport, not a feed listener) (operator-confirmed 2026-07-13)

### 4. Assignment isolation (no cross-scope leak)
expected: as `operations_user`, `sourceOverdueServices` → `[]` (no service assignment) while `sourceOverdueProjects` returns only assigned project_codes; as `super_admin` both return cross-department rows. A dept admin sees only its home-dept collection.
result: pass — operations_user: overdue-services empty + overdue-projects assigned-only; super_admin cross-department; dept admins home-dept only (operator-confirmed 2026-07-13)

### 5. Deep-link clicks route correctly
expected: clicking each feed item navigates to its `deepLink` target — `#/finance`, `#/finance/collectibles`, `#/procurement/records`, `#/projects`, `#/services`, `#/admin?section=user-management` — with no dead links.
result: pass — feed items deep-link to correct routes (#/finance, #/finance/collectibles, #/procurement/records, #/projects, #/services, #/admin?section=user-management), no dead links (operator-confirmed 2026-07-13)

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
