---
phase: 84-notification-triggers-existing-events
plan: "02"
subsystem: notifications
tags: [notifications, procurement, mrf, pr, tr, rfp, notif-07, notif-08]
dependency_graph:
  requires: [84-01]
  provides: [resolveRequestorUid, NOTIF-07-rejectMRF, NOTIF-07-generatePR, NOTIF-07-generatePRandTR, NOTIF-08-generatePR, NOTIF-08-generatePRandTR, NOTIF-08-submitTransportRequest, NOTIF-08-submitRFP, NOTIF-08-submitTRRFP, NOTIF-08-submitDeliveryFeeRFP]
  affects: [app/views/procurement.js]
tech_stack:
  added: []
  patterns: [fire-and-forget-try-catch, legacy-uid-fallback, writeBatch-fan-out]
key_files:
  created: []
  modified:
    - app/views/procurement.js
decisions:
  - "resolveRequestorUid checks requestor_user_id first (Plan 01 field), falls back to users collection full_name query for legacy MRFs (D-02)"
  - "rejectedMrfSnap captures currentMRF fields before nullification so notification has mrf_id and requestor_user_id even after currentMRF = null"
  - "All notification calls in isolated try/catch — zero primary action blocking (D-03 fire-and-forget)"
metrics:
  duration_seconds: 216
  completed_date: "2026-04-30"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 84 Plan 02: NOTIF-07/08 Trigger Wiring in procurement.js Summary

**One-liner:** Wired all 8 procurement action triggers — MRF reject/approve notifications to requestors (NOTIF-07) and PR/TR/RFP review-needed fan-outs to Finance (NOTIF-08) — with resolveRequestorUid legacy fallback and fire-and-forget try/catch on every call.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add resolveRequestorUid helper + wire NOTIF-07 in rejectMRF() | eddeeaf | app/views/procurement.js |
| 2 | Wire NOTIF-07 MRF_APPROVED + NOTIF-08 PR_REVIEW_NEEDED in generatePR() | 5c7dc13 | app/views/procurement.js |
| 3 | Wire NOTIF-07/08 in generatePRandTR, submitTransportRequest, and all 3 RFP functions | e5ade7e | app/views/procurement.js |

## What Was Built

### resolveRequestorUid private helper (procurement.js)

Added before `rejectMRF()`. Checks `mrf.requestor_user_id` first (set on new MRFs by Plan 01). Falls back to a one-shot `getDocs` query on the `users` collection matching `full_name == mrf.requestor_name` for legacy MRFs. Returns null if no match — callers silently skip notification.

### NOTIF-07 — MRF Requestor Notifications

- **rejectMRF():** Captures `rejectedMrfSnap = { ...currentMRF }` before the `updateDoc` call. After the updateDoc succeeds, fires `MRF_REJECTED` notification to the requestor UID via `resolveRequestorUid`. Fires BEFORE `currentMRF = null`.
- **generatePR():** After `status: 'PR Generated'` updateDoc, fires `MRF_APPROVED` notification with first PR ID in message.
- **generatePRandTR():** After `status: 'PR Submitted'` updateDoc, fires `MRF_APPROVED` notification with first PR ID and TR ID in message.

### NOTIF-08 — Finance Review Fan-outs

- **generatePR():** Fires `PR_REVIEW_NEEDED` to `finance` role with list of PR IDs.
- **generatePRandTR():** Fires `PR_REVIEW_NEEDED` (PR list) + `TR_REVIEW_NEEDED` (TR ID) to `finance` role in separate try/catch blocks.
- **submitTransportRequest():** Fires `TR_REVIEW_NEEDED` to `finance` role after MRF updateDoc.
- **submitRFP():** Fires `RFP_REVIEW_NEEDED` to `finance` role after `addDoc` for the RFP.
- **submitTRRFP():** Fires `RFP_REVIEW_NEEDED` to `finance` role after `addDoc` for the TR RFP.
- **submitDeliveryFeeRFP():** Fires `RFP_REVIEW_NEEDED` to `finance` role after `addDoc` for the Delivery Fee RFP.

## Verification

| Check | Expected | Actual |
|-------|----------|--------|
| `node --check` exit code | 0 | 0 |
| `async function resolveRequestorUid` count | 1 | 1 |
| `MRF_REJECTED` count | 1 | 1 |
| `MRF_APPROVED` count | 2 | 2 |
| `PR_REVIEW_NEEDED` count | 2 | 2 |
| `TR_REVIEW_NEEDED` count | 2 | 2 |
| `RFP_REVIEW_NEEDED` count | 3 | 3 |

## Deviations from Plan

None — plan executed exactly as written.

Note: Plan's acceptance criteria for Task 1 stated `rejectedMrfSnap` would appear 2 times (declaration + notification call), but the notification block uses `rejectedMrfSnap` in 3 places (resolveRequestorUid arg, message template, source_id), giving 4 total occurrences. Implementation is correct — the acceptance criteria count was approximate.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. All writes go to the existing `notifications` collection via helpers from Plan 01. Both threats (T-84-03, T-84-04) pre-accepted in plan's threat model.

## Self-Check

### Files exist:
- [x] app/views/procurement.js — FOUND (modified)

### Commits exist:
- [x] eddeeaf — feat(84-02): add resolveRequestorUid helper + wire NOTIF-07 in rejectMRF()
- [x] 5c7dc13 — feat(84-02): wire NOTIF-07 MRF_APPROVED + NOTIF-08 PR_REVIEW_NEEDED in generatePR()
- [x] e5ade7e — feat(84-02): wire NOTIF-07/08 triggers in generatePRandTR, submitTransportRequest, and all RFP functions

## Self-Check: PASSED
