---
phase: 60-tr-rejection-independence
verified: 2026-03-05T11:30:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Finance rejects a TR — confirm parent MRF stays 'Approved' in Firestore"
    expected: "MRF document status field unchanged after TR rejection"
    why_human: "Cannot trigger live Firestore write in static verification; logic confirmed clean in code"
  - test: "Finance TR modal for a resubmitted TR — confirm 'Previously Rejected' banner appears"
    expected: "Red banner with reason, rejector name, and timestamp visible in modal"
    why_human: "UI rendering requires a live TR document with rejection_reason set"
  - test: "Procurement 'Rejected Transport Requests' panel — click rejected TR, then 'Resubmit to Finance'"
    expected: "TR disappears from panel; Finance sees it in Pending Approvals"
    why_human: "Real-time onSnapshot behavior requires live Firestore state"
---

# Phase 60: TR Rejection Independence Verification Report

**Phase Goal:** Decouple TR lifecycle from MRF status — TR rejection/approval must not cascade to MRF document; treat TRs as child records like PRs
**Verified:** 2026-03-05T11:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Finance rejecting a TR does NOT change the parent MRF's status field | VERIFIED | `submitRejection` isTransport branch (lines 2708-2721) writes only to `transport_requests` — no mrfs updateDoc present |
| 2 | Finance approving a TR does NOT change the parent MRF's status field | VERIFIED | `approveTR` (lines 2532-2583) writes only to `transport_requests` — no mrfs updateDoc present |
| 3 | TR document gets `rejection_reason`, `rejected_at`, `rejected_by` fields written on rejection | VERIFIED | `submitRejection` isTransport updateDoc at line 2711 writes all three fields |
| 4 | Finance TR modal shows 'Previously Rejected' notice when `tr.rejection_reason` is set | VERIFIED | Conditional block at lines 2321-2330 in `viewTRDetails` renders red banner with reason, rejected_by, rejected_at |
| 5 | `loadMRFs` query no longer includes 'TR Rejected' in status filter | VERIFIED | statuses array at line 732: `['Pending', 'In Progress', 'PR Rejected', 'Finance Rejected']` — 'TR Rejected' absent |
| 6 | Rejected TRs with mrf_id appear in a dedicated 'Rejected Transport Requests' panel | VERIFIED | `loadRejectedTRs` (line 785) onSnapshot feeds `cachedRejectedTRs`; panel rendered at line 973-1003 in `renderMRFList` |
| 7 | Procurement can view rejection reason for a rejected TR | VERIFIED | `selectRejectedTR` (line 1027) renders TR details panel with rejection reason, rejected_by, timestamp |
| 8 | Procurement can resubmit a rejected TR — same TR doc, `finance_status` reset to 'Pending', `tr_id` preserved | VERIFIED | `resubmitRejectedTR` (lines 1087-1143) calls `updateDoc` setting `finance_status: 'Pending'`; no new TR doc created; `tr_id` preserved |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/views/finance.js` | TR rejection/approval without MRF status cascade; prior rejection notice in viewTRDetails | VERIFIED | Two MRF update blocks removed; "Previously Rejected" block at lines 2321-2330 confirmed in viewTRDetails |
| `app/views/procurement.js` | TR Rejected removed from query/canEdit; cachedRejectedTRs listener; resubmit function | VERIFIED | statuses array clean (line 732); canEdit checks at lines 1233 and 1542 exclude TR Rejected; all new functions present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `finance.js submitRejection` (isTransport branch) | `transport_requests` collection | `updateDoc trRef` only | WIRED | Lines 2710-2719: single updateDoc on trRef; no mrfsRef present in isTransport block |
| `finance.js approveTR` | `transport_requests` collection | `updateDoc trRef` only | WIRED | Lines 2558-2568: single updateDoc on trRef; no mrfs query or updateDoc in function |
| `finance.js viewTRDetails` | Prior rejection notice | `tr.rejection_reason` conditional | WIRED | Lines 2321-2330: renders only when `tr.rejection_reason` is truthy |
| `procurement.js loadMRFs` query | `mrfs` collection | `where('status', 'in', [...])` | WIRED | Line 732: statuses array is `['Pending', 'In Progress', 'PR Rejected', 'Finance Rejected']` — no 'TR Rejected' |
| `procurement.js loadRejectedTRs` | `transport_requests` collection | `onSnapshot` where `finance_status==Rejected` | WIRED | Lines 785-807: correct query, filters by `mrf_id`, pushes to `cachedRejectedTRs`, calls `reFilterAndRenderMRFs()`, listener pushed to `listeners[]` |
| `resubmitRejectedTR` | `transport_requests` document | `updateDoc` resetting `finance_status: 'Pending'` | WIRED | Line 1116-1123: updateDoc on trRef only; `finance_status: 'Pending'`; `tr_id` preserved (not touched); prior rejection archived to `rejection_history` array |
| `renderMRFList` rejected TR panel | `cachedRejectedTRs` | template render at line 973 | WIRED | `if (cachedRejectedTRs.length > 0)` guard confirmed; correct window function calls `selectRejectedTR` and `resubmitRejectedTR` |
| `destroy()` | window functions and cache | `delete window.selectRejectedTR`, `delete window.resubmitRejectedTR`, `cachedRejectedTRs = []` | WIRED | Lines 646-649 confirm full cleanup |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| TR-INDEP-01 | 60-01-PLAN.md | TR rejection does not cascade to MRF status | SATISFIED | `submitRejection` isTransport branch writes only to transport_requests |
| TR-INDEP-03 | 60-01-PLAN.md | Finance TR modal shows prior rejection notice on resubmitted TRs | SATISFIED | "Previously Rejected" block in viewTRDetails at lines 2321-2330 |
| TR-INDEP-02 | 60-02-PLAN.md | Procurement sees rejected TRs independently of MRF status | SATISFIED | `loadRejectedTRs` listener and dedicated panel in `renderMRFList` |
| TR-INDEP-04 | 60-02-PLAN.md | Procurement can resubmit a rejected TR on same TR document | SATISFIED | `resubmitRejectedTR` resets `finance_status: 'Pending'` on same doc |

**Note on REQUIREMENTS.md:** The identifiers TR-INDEP-01 through TR-INDEP-04 do not appear in `.planning/REQUIREMENTS.md` (no entry exists for any TR-INDEP-* ID). These requirements were defined solely in the PLAN frontmatter and ROADMAP.md. There are no orphaned requirement IDs mapped to Phase 60 in REQUIREMENTS.md. This is a documentation gap (requirements not formally registered) but does not affect implementation correctness.

**Note on ROADMAP.md:** ROADMAP.md lists only TR-INDEP-01 and TR-INDEP-03 for Phase 60, but Phase 60 executed 2 plans covering TR-INDEP-02 and TR-INDEP-04 as well. The ROADMAP was not updated to reflect the full scope of Plan 02. The code, however, is fully implemented for all four requirement IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `procurement.js` | 865, 893, 930, 949 | `'TR Rejected'` references remain in `renderMRFList` display logic | Info | Acceptable — these are display-only labels for rendering MRF cards that happen to have `status='TR Rejected'` from legacy data; they are not in the query filter or canEdit gates |

No blockers or warnings found. The remaining 'TR Rejected' string references are defensively correct: if old data exists with that status, the display label would appear but the MRF would not enter the Processing Area (it's excluded from the query) and would not be editable (canEdit gates do not include it).

### Human Verification Required

### 1. TR Rejection Does Not Change MRF Status

**Test:** In Finance, open a TR for a service MRF, reject it with a reason. Then open Firestore console and inspect the parent MRF document.
**Expected:** MRF `status` field remains `'Approved'` — no `TR Rejected`, no status change at all.
**Why human:** Cannot trigger live Firestore writes in static code verification; the logic is confirmed correct but the live behavior requires a real transaction.

### 2. Finance Modal Prior Rejection Notice

**Test:** Have Procurement resubmit a previously rejected TR. Then open Finance, go to Pending Approvals, and click Review on that TR.
**Expected:** A red "Previously Rejected" banner appears below the items table showing the rejection reason, who rejected it, and the timestamp.
**Why human:** Requires a live TR document with `rejection_reason` field populated; the conditional rendering is confirmed correct but the UI display needs end-to-end verification.

### 3. Procurement Rejected TR Panel and Resubmit Flow

**Test:** Reject a TR in Finance. Switch to Procurement view. Confirm a red "Rejected Transport Requests" section appears with the TR card showing rejection reason and "Resubmit to Finance" button. Click the button.
**Expected:** TR card disappears from the rejected panel (onSnapshot updates cachedRejectedTRs); TR reappears in Finance Pending Approvals.
**Why human:** Real-time onSnapshot behavior requires live Firestore state and two simultaneous browser sessions or sequential view checks.

### Gaps Summary

No gaps found. All 8 must-have truths are verified with substantive, wired implementation. The phase goal — decoupling TR rejection from MRF status and treating TRs as independent child records — is fully achieved in code.

The PR rejection cascade (MRF status -> 'PR Rejected') is confirmed preserved and unchanged, consistent with the plan's intent to only decouple TR outcomes.

---

_Verified: 2026-03-05T11:30:00Z_
_Verifier: Claude (gsd-verifier)_
