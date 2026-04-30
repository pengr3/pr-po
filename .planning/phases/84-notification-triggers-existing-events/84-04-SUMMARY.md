---
phase: 84-notification-triggers-existing-events
plan: "04"
subsystem: notifications
tags: [notifications, register, registration, super_admin, fan-out]

requires:
  - phase: 84-01
    provides: notifications.js import already wired in register.js; createNotificationForRoles and NOTIFICATION_TYPES exported
provides:
  - NOTIF-12 trigger in handleRegister() — REGISTRATION_PENDING fan-out to all active super_admins
affects: [app/views/register.js]

tech-stack:
  added: []
  patterns: [fire-and-forget-try-catch, excludeActor-false-for-self-notifications]

key-files:
  created: []
  modified:
    - app/views/register.js

key-decisions:
  - "excludeActor: false explicit in call (D-13) — new user IS the actor, self-exclusion would silence their own registration notification to other super_admins"
  - "Notification fires after markInvitationCodeUsed and before signOut (D-11) — actor_id constraint satisfied since user is still authenticated at fire time (D-14)"
  - "Isolated try/catch around createNotificationForRoles — failure logs to console but never blocks signOut or success redirect (D-03)"

patterns-established:
  - "NOTIF-12 pattern: fire-before-signOut ensures actor_id == request.auth.uid Phase 83 Security Rule is met"

requirements-completed: [NOTIF-12]

duration: 4min
completed: 2026-04-30
---

# Phase 84 Plan 04: Register NOTIF-12 Trigger Summary

**REGISTRATION_PENDING fan-out wired in handleRegister() — fires to all active super_admins after createUserDocument(), before signOut(), with excludeActor:false to satisfy actor_id Security Rule**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-30T08:50:00Z
- **Completed:** 2026-04-30T08:54:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Wired NOTIF-12 `REGISTRATION_PENDING` notification call in `handleRegister()` — the final notification trigger in Phase 84 Wave 2
- Placed notification before `signOut(auth)` so the Phase 83 Security Rule (`actor_id == request.auth.uid`) is satisfied
- Set `excludeActor: false` explicitly per D-13 — prevents self-exclusion when a super_admin user registers
- Wrapped in isolated try/catch so notification failure never blocks registration completion or signOut

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire NOTIF-12 in register.js handleRegister()** - `8dbaace` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/views/register.js` — Added 16-line NOTIF-12 block in handleRegister() between markInvitationCodeUsed and signOut

## Decisions Made

- `excludeActor: false` set explicitly (D-13): new user IS the actor; if a super_admin registers, self-exclusion would wrongly suppress the notification to other admins.
- Notification fires before `signOut(auth)` (D-11/D-14): Phase 83 Security Rule requires `actor_id == request.auth.uid` on notification create — this is satisfied since `userId` is still the authenticated UID at fire time.
- Isolated `try/catch` with `console.error` (D-03): failure path logs `[Register] NOTIF-12 notification failed:` but does not rethrow, ensuring signOut and the success redirect always complete.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `excludeActor: false` comment in the code generated two matches in `grep -c "excludeActor: false"` (once in comment, once in code). The implementation code value is correctly set; the acceptance criterion is satisfied.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 84 Wave 2 is now fully complete: all four NOTIF triggers are wired (NOTIF-07 in Plan 02, NOTIF-08 in Plan 02, NOTIF-11 in Plan 03, NOTIF-12 in Plan 04)
- Phase 84 milestone ready for final verification and close-out
- Phase 87 (proposal-event notifications: NOTIF-09/NOTIF-10) can proceed — same plumbing is established

## Self-Check

### Files exist:
- [x] app/views/register.js — FOUND (modified)

### Commits exist:
- [x] 8dbaace — feat(84-04): wire NOTIF-12 REGISTRATION_PENDING in register.js handleRegister()

## Self-Check: PASSED

---
*Phase: 84-notification-triggers-existing-events*
*Completed: 2026-04-30*
