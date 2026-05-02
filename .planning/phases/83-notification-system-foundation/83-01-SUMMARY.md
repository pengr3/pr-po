---
phase: 83-notification-system-foundation
plan: "01"
subsystem: firestore-infrastructure
tags: [security-rules, firestore-indexes, notifications, NOTIF-13]
dependency_graph:
  requires: []
  provides:
    - notifications-collection-rules
    - notifications-composite-indexes
  affects:
    - firestore.rules
    - firestore.indexes.json
tech_stack:
  added: []
  patterns:
    - per-user-firestore-rules
    - composite-index-predeploy
key_files:
  modified:
    - firestore.rules
    - firestore.indexes.json
    - .planning/STATE.md
decisions:
  - "DEFER: notification rule unit tests deferred to v4.1 hygiene phase alongside rfps collection tests"
  - "notifications rules block follows rfps block (line 430-445) as nearest structural precedent"
  - "Two composite indexes pre-deployed before first addDoc: (user_id, created_at desc) + (user_id, read, created_at desc)"
metrics:
  duration_minutes: 2
  completed_date: "2026-04-30"
  tasks_completed: 3
  files_modified: 3
---

# Phase 83 Plan 01: Notifications Storage Layer (Rules + Indexes) Summary

Per-user Firestore Security Rules and composite indexes for the `notifications` collection, with test-infra investigation resolving to DEFER pending a v4.1 test-hygiene phase.

## Tasks Completed

| Task | Name | Result | Commit | Files |
|------|------|--------|--------|-------|
| 1 | Investigate test/firestore.test.js currency — ADD vs DEFER | DEFER verdict (evidence below) | N/A (investigation only) | None |
| 2 | Add notifications block to firestore.rules + composite indexes to firestore.indexes.json | Done | 701fdb2 | firestore.rules, firestore.indexes.json |
| 3 | (Conditional) Add rule-unit-tests for notifications | Skipped per Task 1 DEFER | N/A | None |

## Task 1: Test Infra Investigation

**Verdict: DEFER**

**Evidence:**

- `test/firestore.test.js` is 691 lines (verified via `node -e` check).
- Harness uses modern `@firebase/rules-unit-testing` v2+ API (`initializeTestEnvironment`, `assertSucceeds`, `assertFails` — confirmed at lines 5-8).
- `npm test` command: `mocha firestore.test.js --exit` (verified at `test/package.json:7`).
- Collections currently covered by tests: `users` (lines 205-254), `role_templates` (lines 260-283), `invitation_codes` (lines 190-199), `mrfs` (lines 289-370), `projects` (lines 377-442), `clients` (lines 448-531), `services` (lines 537-636), `deleted_users` (lines 642-690 in the `services_admin user document access` suite).
- `rfps` collection (added Phase 65) is NOT covered — confirmed by `grep -c 'rfps' test/firestore.test.js` returning 0.
- `assignments` collection (added Phase 39) is NOT covered.
- Last new test suite added was Phase 49 (services collection tests, lines 537-690).

**Why DEFER (not ADD):** Adding notification tests now would leave `rfps` (Phase 65, over 4 months old) untested. Piecemeal per-collection test additions erode confidence in the suite as a whole. The correct remediation is a single test-hygiene phase that adds `rfps` + `notifications` tests together so the suite comprehensively reflects the current production ruleset. This is a v4.1 candidate per STATE.md Pending Todos.

**STATE.md updated:** Deferred item appended to Pending Todos section with test predicates reference (D-17/D-18/D-19) so the hygiene phase has a concrete starting point.

## Task 2: firestore.rules + firestore.indexes.json

### Rules Block Insertion

Inserted after line 445 (closing `}` of `match /rfps/{rfpId}`) and before the document/service closing braces (original lines 446-447). The block follows the structural template from `firestore.rules:6-39` (the ADDING NEW COLLECTIONS comment) and the comment style from the rfps block at lines 430-445.

**Line ranges in final file:**

```
// notifications block starts at approximately line 447
// =============================================
// notifications collection (Phase 83 — NOTIF-13)
// =============================================
match /notifications/{docId} {
  allow read: ...         // D-17
  allow list: ...         // D-17 (scoped collection query)
  allow create: ...       // D-18 (actor_id pinned to request.auth.uid)
  allow update: ...       // D-17 + D-19 (only read/read_at mutable)
  allow delete: ...       // D-17
}
```

**Acceptance criteria verified:**

| Check | Result |
|-------|--------|
| `grep -c "match /notifications/{docId}" firestore.rules` | 1 |
| `grep -c "actor_id == request.auth.uid" firestore.rules` | 1 |
| `grep -c "request.resource.data.created_at == resource.data.created_at" firestore.rules` | 1 |
| Brace balance (opens == closes) | 47 == 47 (balanced) |

### Composite Indexes Added

Appended two new index objects to `firestore.indexes.json` `indexes` array. Original 4 indexes preserved. Total is now 6.

**JSON path:** `firestore.indexes.json → indexes[4]` and `indexes[5]`

| Index | Fields | Purpose |
|-------|--------|---------|
| `indexes[4]` | `user_id ASC, created_at DESC` | History page query (D-10, NOTIF-06) |
| `indexes[5]` | `user_id ASC, read ASC, created_at DESC` | Bell badge + Mark-all queries (D-04, NOTIF-01) |

**Acceptance criteria verified:**

| Check | Result |
|-------|--------|
| `grep -c '"collectionGroup": "notifications"' firestore.indexes.json` | 2 |
| `node -e "JSON.parse(...)"` exits 0 | Valid JSON |
| Total indexes count | 6 (original 4 + 2 new) |

## Task 3: Rule-Unit-Tests

**Skipped per Task 1 verdict (DEFER).** No changes made to `test/firestore.test.js`. File is identical to pre-plan state (0 git diff lines).

**If ADD had been chosen, the 10 test cases to implement were:**
1. Cross-user read denied (D-17)
2. Same-user read allowed (D-17)
3. List with where-clause succeeds (D-17)
4. List without where-clause denied (D-17, Pitfall 7)
5. Create with actor_id != auth.uid fails (D-18)
6. Create with actor_id == auth.uid + required fields succeeds (D-18)
7. Update flipping read=true succeeds for owner (D-19)
8. Update by non-owner denied (D-17)
9. Update changing immutable field (e.g., type) denied (D-19)
10. Inactive user denied all (D-17/D-18)

These predicates are documented here for the v4.1 hygiene phase.

## Deviations from Plan

None — plan executed exactly as written. Task 1 DEFER verdict was anticipated as a possibility. STATE.md was updated as required by the Task 1 acceptance criteria.

## Cross-References for Downstream Plans

- **Plan 02 (bell badge listener):** Can rely on the `(user_id ASC, read ASC, created_at DESC)` index being in source. The query `where('user_id','==',uid), where('read','==',false), orderBy('created_at','desc'), limit(11)` will not hit `failed-precondition` once Plan 05 deploys.
- **Plan 03 (history page):** Can rely on `(user_id ASC, created_at DESC)` index for cursor-based pagination query.
- **Plan 05 (deploy gate):** Owns `firebase deploy --only firestore:rules,firestore:indexes`. Both files modified by this plan must be included in that deploy.
- **Phase 84 (triggers):** `createNotification` and `createNotificationForRoles` callers rely on the create rule (D-18) permitting any active user to write to another user's feed, with `actor_id == request.auth.uid` as the only constraint.

## Known Stubs

None — this plan modifies only infrastructure files (firestore.rules, firestore.indexes.json). No UI stubs.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-collection-write-surface | firestore.rules | The `notifications` create rule allows any active user to write to ANY other user's notification feed (D-18 intentional design — required without Cloud Functions). Mitigated by `actor_id == request.auth.uid` audit trail and invitation-only user pool. Documented in 83-CONTEXT.md D-18 risk acceptance. |

## Self-Check: PASSED

- `firestore.rules` modified and contains `match /notifications/{docId}` — FOUND
- `firestore.indexes.json` modified with 2 new notification indexes (total 6) — FOUND
- Commit 701fdb2 exists — FOUND (verified via git log)
- `test/firestore.test.js` unchanged — CONFIRMED (0 diff lines)
- STATE.md Pending Todos updated with DEFER entry — CONFIRMED (grep match found)
