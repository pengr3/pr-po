---
phase: 60-tr-rejection-independence
verified: 2026-03-09T13:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 8/8
  gaps_closed:
    - "Clicking a rejected TR card opens an editable detail panel (Plan 03 UAT gap — previously read-only)"
    - "Procurement can change qty, unit cost, category, unit, and supplier on each TR item before resubmitting"
    - "Clicking Save Changes persists updated items_json and total_amount to Firestore and refreshes cachedRejectedTRs in-place"
    - "Resubmit to Finance still works after saving changes (or without saving)"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Finance rejects a TR — confirm parent MRF stays 'Approved' in Firestore"
    expected: "MRF document status field unchanged after TR rejection"
    why_human: "Cannot trigger live Firestore write in static verification; logic confirmed clean in code"
  - test: "Finance TR modal for a resubmitted TR — confirm 'Previously Rejected' banner appears"
    expected: "Red banner with reason, rejector name, and timestamp visible in modal"
    why_human: "UI rendering requires a live TR document with rejection_reason set"
  - test: "Procurement 'Rejected Transport Requests' panel — click rejected TR card, edit an item qty, click Save Changes"
    expected: "Toast 'TR changes saved. Ready to resubmit.' Reopen same card — edited qty persists in inputs"
    why_human: "Requires live Firestore state and real document with items_json"
  - test: "Procurement 'Rejected Transport Requests' panel — click 'Resubmit to Finance'"
    expected: "TR disappears from panel; Finance sees it in Pending Approvals"
    why_human: "Real-time onSnapshot behavior requires live Firestore state"
---

# Phase 60: TR Rejection Independence Verification Report

**Phase Goal:** Decouple TR lifecycle from MRF status — TR rejection/approval must not cascade to MRF document; treat TRs as child records like PRs, with editable detail panel for Procurement to revise items before resubmitting
**Verified:** 2026-03-09T13:00:00Z
**Status:** passed
**Re-verification:** Yes — after Plan 03 gap closure (UAT test 6 failure: read-only TR panel)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Finance rejecting a TR does NOT change the parent MRF's status field | VERIFIED | `submitRejection` isTransport branch (lines 2708-2721) writes only to `transport_requests` — no mrfs updateDoc in the isTransport block |
| 2 | Finance approving a TR does NOT change the parent MRF's status field | VERIFIED | `approveTR` (lines 2532-2583) writes only to `transport_requests` — no mrfs query or updateDoc present |
| 3 | TR document gets `rejection_reason`, `rejected_at`, `rejected_by` fields written on rejection | VERIFIED | `submitRejection` isTransport updateDoc at line 2711 writes all three fields |
| 4 | Finance TR modal shows 'Previously Rejected' notice when `tr.rejection_reason` is set | VERIFIED | Conditional block at lines 2321-2330 in `viewTRDetails` renders red banner with reason, rejected_by, rejected_at |
| 5 | `loadMRFs` query no longer includes 'TR Rejected' in status filter | VERIFIED | statuses array at line 734: `['Pending', 'In Progress', 'PR Rejected', 'Finance Rejected']` — 'TR Rejected' absent |
| 6 | Rejected TRs with mrf_id appear in a dedicated 'Rejected Transport Requests' panel | VERIFIED | `loadRejectedTRs` (line 787) onSnapshot feeds `cachedRejectedTRs`; panel rendered at lines 975-1005 in `renderMRFList` |
| 7 | Procurement can view rejection reason for a rejected TR | VERIFIED | `selectRejectedTR` (line 1029) renders red rejection banner with reason, rejected_by, and timestamp |
| 8 | Procurement can resubmit a rejected TR — same TR doc, `finance_status` reset to 'Pending', `tr_id` preserved | VERIFIED | `resubmitRejectedTR` (line 1246) calls `updateDoc` setting `finance_status: 'Pending'`; no new TR doc created; `tr_id` preserved |
| 9 | Clicking a rejected TR card opens an editable item table (not a read-only display) | VERIFIED | `selectRejectedTR` renders `<tbody id="lineItemsBody">` with `.item-name`, `.item-category`, `.item-qty`, `.item-unit`, `.unit-cost`, `.supplier-select` inputs pre-populated from `tr.items_json` |
| 10 | Procurement can edit TR items (qty, unit cost, category, unit, supplier) before resubmitting | VERIFIED | All input types confirmed at lines 1043-1126: text input for item-name, number inputs for qty/unit-cost with `oninput="window.calculateSubtotal(${index})"`, selects for category/unit/supplier populated from `suppliersData` |
| 11 | Save Changes writes updated items to Firestore and refreshes cachedRejectedTRs in-place | VERIFIED | `saveRejectedTRChanges` (line 1182): reads `#lineItemsBody tr`, calls `updateDoc` writing `items_json` + `total_amount`, then updates `cachedRejectedTRs[idx]` in-place |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/views/finance.js` | TR rejection/approval without MRF status cascade; prior rejection notice in viewTRDetails | VERIFIED | isTransport branch (lines 2708-2721) writes only to transport_requests; "Previously Rejected" block at lines 2321-2330 confirmed |
| `app/views/procurement.js` | TR Rejected removed from query/canEdit; cachedRejectedTRs listener; editable rejected TR panel; saveRejectedTRChanges function | VERIFIED | statuses array clean (line 734); canEdit checks at lines 1392 and 1699 exclude TR Rejected; all new functions present and wired |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `finance.js submitRejection` (isTransport branch) | `transport_requests` collection | `updateDoc trRef` only | WIRED | Lines 2708-2721: single updateDoc on trRef; no mrfsRef present in isTransport block |
| `finance.js approveTR` | `transport_requests` collection | `updateDoc trRef` only | WIRED | Lines 2532-2583: single updateDoc on trRef; no mrfs query or updateDoc in function |
| `finance.js viewTRDetails` | Prior rejection notice | `tr.rejection_reason` conditional | WIRED | Lines 2321-2330: renders only when `tr.rejection_reason` is truthy |
| `procurement.js loadMRFs` query | `mrfs` collection | `where('status', 'in', [...])` | WIRED | Line 734: statuses array is `['Pending', 'In Progress', 'PR Rejected', 'Finance Rejected']` — no 'TR Rejected' |
| `procurement.js loadRejectedTRs` | `transport_requests` collection | `onSnapshot` where `finance_status==Rejected` | WIRED | Lines 787-807: correct query, filters by `mrf_id`, pushes to `cachedRejectedTRs`, calls `reFilterAndRenderMRFs()`, listener pushed to `listeners[]` |
| `selectRejectedTR` detail panel | `#lineItemsBody` editable table | Input elements with `.item-name`, `.item-qty`, `.unit-cost`, `.supplier-select` | WIRED | Lines 1043-1154: editable inputs rendered; `id="lineItemsBody"` set on tbody; `oninput="window.calculateSubtotal(${index})"` wired |
| `Save Changes` button | `saveRejectedTRChanges(tr.id)` | `onclick="window.saveRejectedTRChanges(...)"` | WIRED | Line 1166: button confirmed in selectRejectedTR panel; function registered on window at line 153 |
| `saveRejectedTRChanges` | `transport_requests` document | `updateDoc` writing `items_json` + `total_amount` | WIRED | Lines 1216-1220: `updateDoc(trRef, { items_json, total_amount })` confirmed |
| `saveRejectedTRChanges` | `cachedRejectedTRs` | In-place splice at found index | WIRED | Lines 1222-1229: `cachedRejectedTRs[idx] = { ...cachedRejectedTRs[idx], items_json, total_amount }` |
| `resubmitRejectedTR` | `transport_requests` document | `updateDoc` resetting `finance_status: 'Pending'` | WIRED | Lines 1246+: updateDoc on trRef only; `finance_status: 'Pending'`; `tr_id` preserved; prior rejection archived to `rejection_history` array |
| `destroy()` | window functions and cache | `delete window.selectRejectedTR`, `delete window.resubmitRejectedTR`, `delete window.saveRejectedTRChanges`, `cachedRejectedTRs = []` | WIRED | Lines 647-651: all three deleted; cache reset |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| TR-INDEP-01 | 60-01-PLAN.md | TR rejection does not cascade to MRF status | SATISFIED | `submitRejection` isTransport branch writes only to transport_requests |
| TR-INDEP-03 | 60-01-PLAN.md | Finance TR modal shows prior rejection notice on resubmitted TRs | SATISFIED | "Previously Rejected" block in viewTRDetails at lines 2321-2330 |
| TR-INDEP-02 | 60-02-PLAN.md | Procurement sees rejected TRs independently of MRF status | SATISFIED | `loadRejectedTRs` listener and dedicated panel in `renderMRFList` |
| TR-INDEP-04 | 60-02-PLAN.md | Procurement can resubmit a rejected TR on same TR document | SATISFIED | `resubmitRejectedTR` resets `finance_status: 'Pending'` on same doc |
| TR-INDEP-03 | 60-03-PLAN.md | Editable TR detail panel — Procurement can revise items before resubmitting | SATISFIED | `selectRejectedTR` renders editable `#lineItemsBody` table; `saveRejectedTRChanges` persists to Firestore |

**Note on REQUIREMENTS.md:** The identifiers TR-INDEP-01 through TR-INDEP-04 do not appear in `.planning/REQUIREMENTS.md`. These requirements were defined solely in the PLAN frontmatter and ROADMAP.md. There are no orphaned requirement IDs mapped to Phase 60 in REQUIREMENTS.md. This is a documentation gap (requirements not formally registered) but does not affect implementation correctness.

**Note on ROADMAP.md:** ROADMAP.md lists only TR-INDEP-01 and TR-INDEP-03 for Phase 60, but the phase executed 3 plans covering TR-INDEP-02 and TR-INDEP-04 as well (from Plans 02 and 03). The code is fully implemented for all requirement IDs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `procurement.js` | 867, 895, 932, 951 | `'TR Rejected'` references remain in `renderMRFList` display logic | Info | Acceptable — display-only labels for rendering MRF cards that may have legacy `status='TR Rejected'`; not in the query filter or canEdit gates |

No blockers or warnings found. The remaining 'TR Rejected' string references are defensively correct: old data with that status will not appear in the Pending MRFs area (excluded from query) and will not be editable (canEdit gates do not include it).

**Notable auto-fix in Plan 03:** `calculateSubtotal()` and `calculateGrandTotal()` had `if (!currentMRF) return;` guards removed. These are pure DOM functions — the guard was preventing them from working in the rejected TR panel where `currentMRF` is null. The fix is correct and non-regressive; both functions still work in the normal MRF form context.

### Human Verification Required

### 1. TR Rejection Does Not Change MRF Status

**Test:** In Finance, open a TR for a service MRF, reject it with a reason. Then open Firestore console and inspect the parent MRF document.
**Expected:** MRF `status` field remains `'Approved'` — no `TR Rejected`, no status change at all.
**Why human:** Cannot trigger live Firestore writes in static code verification; the logic is confirmed correct but the live behavior requires a real transaction.

### 2. Finance Modal Prior Rejection Notice

**Test:** Have Procurement resubmit a previously rejected TR. Then open Finance, go to Pending Approvals, and click Review on that TR.
**Expected:** A red "Previously Rejected" banner appears below the items table showing the rejection reason, who rejected it, and the timestamp.
**Why human:** Requires a live TR document with `rejection_reason` field populated; the conditional rendering is confirmed correct but the UI display needs end-to-end verification.

### 3. Editable TR Panel — Save Changes

**Test:** In Procurement > MRF Processing, click a rejected TR card. Confirm item rows appear with editable inputs (not static text). Change a qty value. Click Save Changes.
**Expected:** Toast "TR changes saved. Ready to resubmit." appears. Click the same TR card again — the changed qty persists in the inputs.
**Why human:** Requires a live rejected TR document with items_json populated; verifying the Firestore round-trip and cachedRejectedTRs in-place update requires actual state.

### 4. Procurement Rejected TR Panel and Resubmit Flow

**Test:** Reject a TR in Finance. Switch to Procurement view. Confirm a red "Rejected Transport Requests" section appears with the TR card showing rejection reason and "Resubmit to Finance" button. Click the button.
**Expected:** TR card disappears from the rejected panel (onSnapshot updates cachedRejectedTRs); TR reappears in Finance Pending Approvals.
**Why human:** Real-time onSnapshot behavior requires live Firestore state and two simultaneous browser sessions or sequential view checks.

### Gaps Summary

No gaps found. All 11 must-have truths are verified with substantive, wired implementation.

The previous VERIFICATION.md (created 2026-03-05) was accurate for Plans 01 and 02 but predated Plan 03 which closed the UAT gap (test 6: read-only TR panel). This re-verification confirms Plan 03's implementation is complete:

- `selectRejectedTR()` now renders a fully editable `#lineItemsBody` table matching the MRF edit form pattern
- `saveRejectedTRChanges()` reads DOM inputs, writes to Firestore, and refreshes `cachedRejectedTRs` in-place
- Both "Save Changes" and "Resubmit to Finance" buttons appear side by side
- All three new window functions registered in `init()` and cleaned up in `destroy()`
- `calculateSubtotal()` and `calculateGrandTotal()` guards removed so they work in the TR panel context

The phase goal — decoupling TR rejection from MRF status and treating TRs as fully independent child records with an editable Procurement workflow — is fully achieved in code.

---

_Verified: 2026-03-09T13:00:00Z_
_Verifier: Claude (gsd-verifier)_
