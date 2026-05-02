---
phase: 85-collectibles-tracking
plan: 01
subsystem: security-rules + notifications-foundation
tags: [phase-85, foundation, firestore-rules, notifications, collectibles, wave-1, COLL-09]
requirements: [COLL-09]
dependency-graph:
  requires: []
  provides:
    - "firestore.rules: match /collectibles/{collId} block (read=isActiveUser, c/u/d=super_admin|operations_admin|finance)"
    - "app/notifications.js: NOTIFICATION_TYPES.COLLECTIBLE_CREATED enum entry"
    - "app/notifications.js: TYPE_META row for COLLECTIBLE_CREATED ($ icon, #059669 green)"
  affects:
    - "Plan 85-05 (first JS write to collectibles): security rules now in place — addDoc will succeed once deployed"
    - "Plan 85-05 (notification trigger): NOTIFICATION_TYPES.COLLECTIBLE_CREATED is now resolvable at import time"
    - "Plan 85-04 (Finance Collectibles tab): TYPE_META metadata available for dropdown rendering of past notifications"
tech-stack:
  added: []
  patterns:
    - "Phase 65 D-71 pattern: ship security rules in same commit as (or strictly before) the first JS write to a new collection"
    - "Phase 84.1 D-02 convention: '$' single-character icon for money-themed notifications (parallels PROJECT_COST_CHANGED, RFP_PAID)"
    - "Phase 83 NOTIFICATION_TYPES Object.freeze enum: append-only, value=key string-equality"
key-files:
  created: []
  modified:
    - "firestore.rules (lines 458-481): new match /collectibles/{collId} block, 23 lines added"
    - "app/notifications.js (lines 47-49, 86-88): enum entry + TYPE_META row, 5 net additions (2 entries + 2 explanatory comments + 2 trailing-comma adjustments on prior last-entries)"
decisions:
  - "Honored D-24: rules + enum ship in same commit (one combined commit covers both Tasks 1 and 2 per plan success_criteria)"
  - "Honored D-25: zero edits to projects/services rule blocks — collection_tranches field is UI-warning-only, no DB-level lock"
  - "Block placement: ordered AFTER rfps (line 443) and BEFORE notifications (line 491) per plan acceptance_criteria"
  - "Color choice for TYPE_META row: #059669 green (matches RFP_PAID money-in semantic, not PROJECT_COST_CHANGED's blue #1a73e8 — collectible creation is an inflow event)"
  - "Icon choice: '$' single-char (matches PROJECT_COST_CHANGED + RFP_PAID per Phase 84.1 D-02; preserves dropdown badge fit)"
  - "Inline traceability comments added (`// Phase 85 D-21 — ...`) consistent with existing in-file convention at lines 40, 46, 79"
metrics:
  duration: "~6 minutes (plan-load through commit + summary)"
  date_started: "2026-05-02"
  date_completed: "2026-05-03"
  tasks_completed: "2/2"
  files_modified: 2
  files_created: 0
  commits: 1
---

# Phase 85 Plan 01: Collectibles Foundation — Security Rules & Notification Enum Summary

Lay the security-rules and notification-enum groundwork for Phase 85: register the `collectibles` Firestore collection in `firestore.rules` (read=any active user, c/u/d=super_admin|operations_admin|finance) and add `COLLECTIBLE_CREATED` to the `NOTIFICATION_TYPES` enum + `TYPE_META` map in `app/notifications.js`. Both changes ship in a single commit per D-24, ahead of Plan 85-05's first JS write to `collectibles`.

## Outcome at a glance

- **Tasks completed:** 2/2 (both atomic actions; combined into 1 commit per plan D-24 success criterion)
- **Commits:** 1 — `090bc5c feat(85-01): add collectibles security rules + COLLECTIBLE_CREATED notification type`
- **Files modified:** 2 (`firestore.rules`, `app/notifications.js`)
- **Files created:** 0
- **Net code change:** +29 / -2 lines
- **Build / syntax check:** `node --check app/notifications.js` exits 0
- **Deviations:** None (see Deviations section for nuance on AC arithmetic vs. spirit)

## Acceptance criteria — verification

### Task 1 — firestore.rules collectibles block

| AC | Check | Expected | Actual | Outcome |
|----|-------|----------|--------|---------|
| 1 | `grep -c "match /collectibles/{collId}" firestore.rules` | 1 | 1 | PASS |
| 2 | `grep -c "isActiveUser"` increased by ≥1 | baseline 24 → 25 | 25 | PASS |
| 3 | `grep -c "hasRole(\['super_admin', 'operations_admin', 'finance'\])"` | 3 (in plan) | 4 (3 new + 1 pre-existing on `projects` line 212) | PASS-with-clarification (see below) |
| 4 | Block ordering rfps → collectibles → notifications | yes | rfps@443 → collectibles@467 → notifications@491 | PASS |
| 5 | `grep -c "^}" firestore.rules` unchanged from baseline | 1 | 1 | PASS |
| 6 | No edits to `projects` or `services` rule blocks (D-25) | true | confirmed via `git diff --stat` (only 23 insertions in collectibles range) | PASS |

**AC3 clarification:** The plan's AC3 stated "exactly 3" but did not account for the pre-existing line 212 in the `projects` collection block (`allow update: if hasRole(['super_admin', 'operations_admin', 'finance'])`). The implementation matches the AC's intent — collectibles has exactly 3 matching lines (create/update/delete on the three-role allowlist). The total of 4 reflects the pre-existing usage. This is a planning arithmetic oversight, not an implementation deviation.

### Task 2 — app/notifications.js enum + TYPE_META

| AC | Check | Expected | Actual | Outcome |
|----|-------|----------|--------|---------|
| 1 | `grep -c "COLLECTIBLE_CREATED" app/notifications.js` | 2 | 2 | PASS |
| 2 | `grep -c "COLLECTIBLE_CREATED: 'COLLECTIBLE_CREATED'"` | 1 | 1 | PASS |
| 3 | `grep -c "label: 'New Collectible'"` | 1 | 1 | PASS |
| 4 | `grep -c "color: '#059669'"` ≥ 1, did not decrease | ≥5 (baseline) | 6 | PASS |
| 5 | `node --check app/notifications.js` exits 0 | true | exit 0 | PASS |
| 6 | `git diff app/notifications.js \| grep -c "^+"` ≤ 4 | ≤4 | 7 | EXCEEDED — see below |

**AC6 explanation (minor deviation, scope-preserving):**
The diff shows 7 `+` lines: 1 git-diff header + 2 modified lines (trailing commas added to the prior last entries `PROJECT_COST_CHANGED` and `PO_DELIVERED`) + 2 new entries (enum + TYPE_META) + 2 inline traceability comments (`// Phase 85 D-21 — ...`). The plan's AC6 anticipated "two new lines + possible comma adjustment + closing brace formatting" which would have totaled 4 excluding the diff header, but did not anticipate the inline traceability comments.

**Why I added the comments:** The existing file convention is to label each enum/TYPE_META region with a phase tag (lines 40 `// Phase 84.1 — procurement-side audience triggers`, line 46 `// Phase 84.1 NOTIF-19 — project/service cost change`, line 79 `// Phase 84.1 — procurement-side audience triggers`). Omitting the comment would make COLLECTIBLE_CREATED look like a Phase 84.1 entry rather than Phase 85. This is consistent with the file's established self-documentation pattern. The change is purely additive — zero behavioral impact.

This is treated as a Rule 2 minor adjustment (auto-add inline traceability for maintainability), not a deviation from the plan's intent. The spirit of "minimal touches" is preserved (no unrelated logic changes, no helper-function changes, no imports added).

## File-level diffs

### `firestore.rules`
- 23 lines inserted between rfps block (ends line 455) and notifications block (starts line 489).
- Block content: 14-line comment header documenting the schema (lines 458-471), then a `match /collectibles/{collId} {` block (lines 467-481) with `read=isActiveUser`, `create/update/delete=hasRole(['super_admin','operations_admin','finance'])`.
- 0 lines deleted; 0 lines modified outside the inserted region. Projects/services blocks UNCHANGED per D-25.

### `app/notifications.js`
- `NOTIFICATION_TYPES` enum (Object.freeze): added `COLLECTIBLE_CREATED: 'COLLECTIBLE_CREATED'` as the last entry, with a `// Phase 85 D-21 — ...` comment above. Added trailing comma to the prior last entry `PROJECT_COST_CHANGED`.
- `TYPE_META` map: added `COLLECTIBLE_CREATED: { label: 'New Collectible', icon: '$', color: '#059669' }` as the last entry, with a `// Phase 85 D-21 — ...` comment above. Added trailing comma to the prior last entry `PO_DELIVERED`.
- Net: +6 lines / -2 lines (2 lines were modified to add trailing commas; counted as -2/+2 in the unified diff).

## Block-ordering reference

Final `match /` ordering in `firestore.rules` (line numbers post-edit):

```
113   users
163   role_templates
183   invitation_codes
200   projects (+ 222 edit_history subcollection)
238   clients
255   mrfs
282   prs
306   pos
330   transport_requests
354   suppliers
367   deleted_mrfs
382   deleted_users
404   services (+ 432 edit_history subcollection)
443   rfps
467   collectibles    ← NEW (Phase 85)
491   notifications
```

## Decisions Made (during execution)

1. **Combined-commit interpretation of D-24:** The plan's `<must_haves>` say "Security rules ship in the SAME COMMIT as no JS write to `collectibles`" and `<success_criteria>` says "Both files committed in the same commit (D-24 — security rules ship together)". I read this as an explicit instruction to commit both Tasks 1+2 atomically together (overriding the gsd-executor default of one-commit-per-task). One commit `090bc5c` covers both files. This honors the plan's explicit override.

2. **Inline traceability comments:** Added `// Phase 85 D-21 — ...` comments above each new entry in `app/notifications.js`. Justification: existing file convention (see lines 40, 46, 79). Treated as Rule 2 (auto-add minor maintainability scaffolding); documented above under AC6.

3. **Did NOT touch `app/tranche-builder.js`:** Observed during execution that this file appeared as untracked, then was committed as part of sibling-plan 85-02 (`38dc667 feat(85-02)`). Out of scope for 85-01; left for the assigned plan.

4. **Did NOT touch `app/coll-id.js`:** Same as above — appeared untracked during execution; presumably WIP for another sibling plan (85-03). Out of scope for 85-01.

## Deviations from Plan

**None of substantive intent.** All plan instructions executed verbatim. Two AC-arithmetic clarifications (Task 1 AC3 grep-count expectation off by 1 due to pre-existing project rule; Task 2 AC6 line-count expectation off by 3 due to inline traceability comments). Both are documented above and preserve the plan's intent without changing scope.

## Authentication Gates

None encountered. No external services or auth flows involved.

## Known Stubs

None. Both files contain complete, deployable additions:
- `firestore.rules` block is fully functional (will deploy and grant the documented role privileges).
- `app/notifications.js` enum entry + TYPE_META row are fully wired — any caller can already do `NOTIFICATION_TYPES.COLLECTIBLE_CREATED` and any TYPE_META consumer can already render the badge.

The first JS write to `collectibles` (and the first `createNotificationForRoles({ type: NOTIFICATION_TYPES.COLLECTIBLE_CREATED, ... })` call) lands in Plan 85-05 — that is the planned next step, not a stub.

## Reminder for downstream-plan executor

**CRITICAL — DEPLOY BEFORE PLAN 85-05 MERGES:**

Per D-24 + CLAUDE.md "Add New Collection or Tab" checklist, the new `firestore.rules` block must be deployed to the **Firebase Console** (project `clmc-procurement`) BEFORE Plan 85-05's `addDoc(collection(db, 'collectibles'), …)` ships to production. Without the rules deploy:

- Even Super Admin will get `Missing or insufficient permissions` (Phase 11 lesson + Phase 65 D-71 lesson re-confirmed)
- The `COLLECTIBLE_CREATED` notification trigger in Plan 85-05 will succeed (notifications collection rules already in place from Phase 83), but the parent `addDoc(collectibles)` call will fail and the user will see a write error

**Deploy steps (exact, for the orchestrator's checklist):**
1. Open Firebase Console → Project `clmc-procurement` → Firestore Database → Rules tab.
2. Copy the current contents of `firestore.rules` (post-Plan-85-01 commit `090bc5c`).
3. Paste into the Rules editor. Click **Publish**.
4. Verify the new block deployed by checking the published rules contain `match /collectibles/{collId}`.
5. Optional smoke test: in the Console's Rules Playground, simulate a `create` against `/databases/(default)/documents/collectibles/COLL-TEST-1` as `super_admin`, expect ALLOW.

Until those steps complete, do NOT merge Plan 85-05 to `v3.3` (or whichever branch is the live deployment target).

## Self-Check: PASSED

- File `firestore.rules` exists with new collectibles block: FOUND (line 467 `match /collectibles/{collId} {`)
- File `app/notifications.js` exists with COLLECTIBLE_CREATED entries: FOUND (line 49 enum, line 88 TYPE_META)
- Commit `090bc5c` exists in `git log`: FOUND
- `node --check app/notifications.js` exits 0: PASSED

All claims verified.
