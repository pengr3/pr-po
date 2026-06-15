---
phase: 99-billing-request-flow
plan: 01
subsystem: infra
tags: [firestore-rules, notifications, security, billing]

# Dependency graph
requires:
  - phase: 85-collectibles
    provides: collectibles rules block (analog) + COLLECTIBLE_CREATED notification type (anatomy analog)
provides:
  - "match /billing_requests/{id} Security Rules block (read/create=isActiveUser, update/delete=finance roles)"
  - "BILLING_REQUEST_SUBMITTED + BILLING_REQUEST_DECIDED in NOTIFICATION_TYPES enum + TYPE_META"
affects: [99-02, 99-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Create-rule asymmetry: open create (isActiveUser) + role-gated update for advisory-amount collections"
key-files:
  created: []
  modified:
    - firestore.rules
    - app/notifications.js
key-decisions:
  - "create rule is isActiveUser() NOT a role gate — operations_user (lacks collectible authority) is the intended creator (D-16); amount is advisory, Finance re-derives at approval (T-99-01 accept)"
  - "SUBMITTED is action_required + routes to #/finance/collectibles; DECIDED not action_required + routes to #/projects (D-17)"
patterns-established:
  - "Rules-first protocol honored: rules block lands in Wave 1, before any Wave 2 JS write"
requirements-completed: [BILL-06]

# Metrics
duration: ~5 min
completed: 2026-06-04
---

# Phase 99 Plan 01: Billing-Request Foundation Summary

**Firestore `billing_requests` Security Rules block (open create / finance-gated update) plus two frozen notification types (SUBMITTED action-required, DECIDED info) — the foundation Plans 02/03 build on.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-04T15:30:00Z
- **Completed:** 2026-06-04T15:35:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `match /billing_requests/{id}` rules block inserted after the collectibles block (firestore.rules), with the deliberate create-rule asymmetry (`isActiveUser()`, not `hasRole`) so operations_user can submit.
- `BILLING_REQUEST_SUBMITTED` + `BILLING_REQUEST_DECIDED` added to the frozen `NOTIFICATION_TYPES` enum and to `TYPE_META` with full Phase-95 anatomy (label/icon/color/action_required/target_route).
- Rules-first protocol satisfied — this Wave-1 commit precedes the Wave-2 JS writes (Plans 02/03).

## Task Commits

1. **Task 1: billing_requests Security Rules block (BILL-06)** — `0064849` (feat)
2. **Task 2: BILLING_REQUEST_SUBMITTED/DECIDED notification types (D-17)** — `de68d76` (feat)

## Files Created/Modified
- `firestore.rules` — added `match /billing_requests/{id}` block (read/create=isActiveUser; update/delete=super_admin/operations_admin/finance).
- `app/notifications.js` — extended `NOTIFICATION_TYPES` enum + `TYPE_META` with the two billing-request types.

## Decisions Made
- None beyond the plan. Create rule = `isActiveUser()` (advisory amount, Finance re-derives at approval — T-99-01 accepted). Both notification types follow the locked Phase-95 TYPE_META anatomy.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. (Git emitted a benign `LF will be replaced by CRLF` warning on firestore.rules — cosmetic, no impact.)

## User Setup Required
None - no external service configuration required.

**DEPLOY NOTE (MEMORY firebase-dev-prod-deploy):** the new rules block is NOT live until deployed. After merge, run `firebase deploy --only firestore:rules --project dev` for UAT, then prod. The CLI active project is PROD — do NOT deploy to prod for UAT.

## Next Phase Readiness
- Foundation complete. Plan 99-02 (project-detail.js) can now `addDoc(collection(db,'billing_requests'))` and fire `BILLING_REQUEST_SUBMITTED`; Plan 99-03 (finance.js) can `updateDoc` (approve/reject) and fire `BILLING_REQUEST_DECIDED`.
- Plans 02 and 03 touch different files (project-detail.js vs finance.js) and only READ the new types — no shared-file write conflict.

---
*Phase: 99-billing-request-flow*
*Completed: 2026-06-04*

## Self-Check: PASSED
- firestore.rules billing_requests block present, valid shape, braces balanced (61/61).
- app/notifications.js `node --check` passes; both types present in enum + TYPE_META with correct action_required/target_route.
- Commits `0064849` + `de68d76` present on v3.3.
