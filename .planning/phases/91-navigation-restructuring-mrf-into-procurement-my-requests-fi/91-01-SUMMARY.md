---
phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi
plan: 01
subsystem: permissions/seed-roles
tags: [permissions, role-templates, seed-roles, sub-tab-keys, phase-91]
dependency_graph:
  requires: []
  provides: [defaultRoleTemplates with 4 sub-tab keys per role, services_admin/services_user role objects, verifyRoleTemplates covering 11 tabs]
  affects: [app/seed-roles.js]
tech_stack:
  added: []
  patterns: [batch-write role templates, verifyRoleTemplates role+tab validation]
key_files:
  created: []
  modified:
    - app/seed-roles.js
decisions:
  - D-03 sub-tab permission matrix applied verbatim: procurement_request/mrfs/suppliers/records per all 7 roles
  - D-04 mrf_form key retained in all role templates (deprecated-but-not-deleted)
  - services_admin mirrors operations_admin permissions; services_user mirrors operations_user permissions
  - verifyRoleTemplates now validates 7 roles x 11 tabs (up from 5 roles x 7 tabs)
  - JSDoc note added above forceReseedRoleTemplates directing super_admin to run once after deploy
metrics:
  duration: "~1 minute"
  completed: "2026-05-13"
  tasks: 2
  files: 1
---

# Phase 91 Plan 01: Seed-Roles Sub-Tab Permission Keys Summary

Updated `app/seed-roles.js` with complete 7-role templates carrying 4 new sub-tab permission keys per D-03, adding `services_admin` and `services_user` role objects, and extending `verifyRoleTemplates()` to validate all 11 tabs across all 7 roles.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add 4 sub-tab keys to all existing role templates and add services_admin + services_user | 2072ef7 | app/seed-roles.js |
| 2 | Extend verifyRoleTemplates roles + requiredTabs and document forceReseed step | 955f03c | app/seed-roles.js |

## What Was Built

### Task 1 — defaultRoleTemplates updated (app/seed-roles.js)

- Added `procurement_request`, `procurement_mrfs`, `procurement_suppliers`, `procurement_records` keys inside `permissions.tabs` for all 5 existing role objects (super_admin, operations_admin, operations_user, finance, procurement).
- Added two new role template objects: `services_admin` (role_name "Services Admin") and `services_user` (role_name "Services User") with the full 11-key tab structure.
- Applied the D-03 permission matrix exactly:
  - super_admin, operations_admin, services_admin: all 4 new keys `{access:true, edit:true}`
  - operations_user, services_user: request `{access:true, edit:true}`, mrfs/suppliers/records `{access:true, edit:false}`
  - finance: all 4 new keys `{access:false, edit:false}`
  - procurement: request `{access:false, edit:false}`, mrfs/suppliers/records `{access:true, edit:true}`
- Retained `mrf_form` key unchanged in every role (D-04).

### Task 2 — verifyRoleTemplates and forceReseed (app/seed-roles.js)

- Extended `roles` array from 5 to 7 entries: added `'services_admin'` and `'services_user'`.
- Extended `requiredTabs` array from 7 to 11 entries: added `'procurement_request'`, `'procurement_mrfs'`, `'procurement_suppliers'`, `'procurement_records'` after `'role_config'`.
- Added JSDoc note immediately above `forceReseedRoleTemplates`: "Phase 91 — call this once after deploy to push the 4 new sub-tab permission keys to live role documents."
- Function signatures and batch-write behavior unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan is data-only (role template definitions and verify helper). No UI rendering stubs.

## Threat Surface Scan

No new Firestore collections, network endpoints, or auth paths introduced. This plan modifies only in-memory JavaScript data structures. The `forceReseedRoleTemplates()` write path to `role_templates` collection was already gated by existing Firestore Security Rules (super_admin write-only, deployed in Phase 6 + Phase 8). No new threat surface.

## Self-Check: PASSED

- `app/seed-roles.js` exists and contains all 7 `role_id:` declarations.
- Task 1 commit `2072ef7` exists.
- Task 2 commit `955f03c` exists.
- Verification script (plan-supplied) exits 0 for Task 1.
- Verification script (plan-supplied) prints "OK" for Task 2.
