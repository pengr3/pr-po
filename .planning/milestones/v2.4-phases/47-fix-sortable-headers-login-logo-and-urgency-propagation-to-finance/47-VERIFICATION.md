---
phase: 47-fix-sortable-headers-login-logo-and-urgency-propagation-to-finance
verified: 2026-02-28T15:30:00Z
status: human_needed
score: 8/8 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Sorting persists across onSnapshot re-renders — materialPRs.sort() and transportRequests.sort() blocks added inside prListener and trListener callbacks at lines 1119-1130 and 1149-1160"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Navigate to Finance > Pending Approvals, click 'Urgency' header on Material PRs table, then in another tab approve a pending PR to trigger an onSnapshot update"
    expected: "After the snapshot fires and the approved PR disappears, remaining rows are still ordered by Urgency — not reverted to Firestore insertion order"
    why_human: "Cannot trigger a live Firestore snapshot programmatically; requires an actual data mutation in the running app"
  - test: "Sort Material PRs by Total Cost, switch to Finance > Purchase Orders, then switch back to Finance > Pending Approvals"
    expected: "Material PRs table shows Total Cost sort with blue arrow indicator and rows in sorted order — sort state persists across tab switches"
    why_human: "Router tab-switch behavior and sort indicator DOM state require live UI interaction to confirm"
  - test: "Apply 'Projects only' dept filter on Pending Approvals, sort by Urgency, then trigger a new PR to cause a snapshot"
    expected: "Table shows only project PRs, still sorted by urgency after the snapshot fires"
    why_human: "Combined filter+sort persistence after live snapshot cannot be verified statically"
---

# Phase 47: Fix Sortable Headers, Login Logo, and Urgency Propagation to Finance — Verification Report

**Phase Goal:** Finance Pending Approvals tables have sortable column headers, login page shows company logo, and PR documents carry urgency level from parent MRF
**Verified:** 2026-02-28T15:30:00Z
**Status:** human_needed — all automated checks pass; 3 items flagged for live-app confirmation
**Re-verification:** Yes — after gap closure (plan 47-03, commit `03caae4`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Finance user can click a column header in the Material PRs table and rows reorder by that column | VERIFIED | `onclick="window.sortMaterialPRs('pr_id')"` etc. on 6 th elements (lines 647-653); `sortMaterialPRs()` sorts `materialPRs` in-place and calls `renderMaterialPRs()` (lines 1305-1328) |
| 2 | Finance user can click a column header in the Transport Requests table and rows reorder by that column | VERIFIED | `onclick="window.sortTransportRequests('tr_id')"` etc. on 5 th elements (lines 678-683); `sortTransportRequests()` sorts `transportRequests` in-place (lines 1329-1352) |
| 3 | Clicking the same column header toggles between ascending and descending order | VERIFIED | Both functions toggle direction when `prSortColumn === column` / `trSortColumn === column`; set 'asc' on new column (lines 1306-1310, 1330-1334) |
| 4 | Sort indicators show arrow direction on the active column and neutral arrows on inactive columns | VERIFIED | `renderMaterialPRs()` (lines 1219-1232) and `renderTransportRequests()` (lines 1286-1299) update `.sort-indicator` spans via `tbody.closest('table')` — blue ↑/↓ on active, gray ⇅ on others |
| 5 | Sorting persists across onSnapshot re-renders until the user changes it | VERIFIED | `prListener` (lines 1119-1130) and `trListener` (lines 1149-1160) now contain sort blocks between array population and render call, matching the `poListener` pattern. `materialPRs.sort()` uses `prSortColumn`/`prSortDirection`; `transportRequests.sort()` uses `trSortColumn`/`trSortDirection` |
| 6 | Login page displays the CLMC company logo image instead of the blue CL text placeholder | VERIFIED | `app/views/login.js` line 18: `<img src="./CLMC Registered Logo Cropped (black fill).png" alt="CLMC Logo" onerror="this.style.display='none'">` — CL placeholder div fully replaced |
| 7 | Newly generated PRs carry the urgency_level from their parent MRF document | VERIFIED | `procurement.js` line 3309: `urgency_level: mrfData.urgency_level || 'Low'` in `generatePR()` prDoc; line 3595: same field in `generatePRandTR()` PR addDoc — both paths covered |
| 8 | Finance Pending Approvals shows the correct urgency badge for PRs generated after this fix | VERIFIED | `renderMaterialPRs()` reads `pr.urgency_level || 'Low'` (line 1165 area) and renders color-coded badge; field is now populated on all new PRs |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/views/finance.js` | Sort state variables, sort functions, sortable headers, indicator updates for PR and TR tables, AND sort re-application inside onSnapshot callbacks | VERIFIED | All components present: state vars (lines 51-56), window registrations (lines 113-114), cleanup in destroy() (lines 1078-1079), sortable headers in render() (lines 647-653, 678-683), indicator updates in render functions (lines 1219-1232, 1286-1299), sort blocks inside both onSnapshot callbacks (lines 1119-1130, 1149-1160) |
| `app/views/login.js` | Logo image in render() matching register.js pattern | VERIFIED | img tag at line 18 with CLMC logo path and onerror fallback; no CL placeholder text remaining |
| `app/views/procurement.js` | urgency_level field in both PR addDoc calls | VERIFIED | 4 total urgency_level propagation lines: lines 3046, 3309 (PR), 3595 (PR), 3660 (TR) — 2 PR + 2 TR, all present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `render() <th onclick>` | `window.sortMaterialPRs / window.sortTransportRequests` | onclick handler on th elements | WIRED | Lines 647-653 (PRs), 678-683 (TRs) — all sortable headers call window functions |
| `sortMaterialPRs / sortTransportRequests` | `renderMaterialPRs / renderTransportRequests` | sort array then call render function | WIRED | `materialPRs.sort(...)` then `renderMaterialPRs()` at line 1328; `transportRequests.sort(...)` then `renderTransportRequests()` at line 1352 |
| `attachWindowFunctions` | `window.sortMaterialPRs / window.sortTransportRequests` | window assignment | WIRED | Lines 113-114: `window.sortMaterialPRs = sortMaterialPRs; window.sortTransportRequests = sortTransportRequests` |
| `app/views/login.js render()` | `./CLMC Registered Logo Cropped (black fill).png` | img src attribute | WIRED | Line 18: img src matches logo path exactly |
| `generatePR() prDoc object` | Firestore prs collection | addDoc with urgency_level field | WIRED | Line 3309: `urgency_level: mrfData.urgency_level || 'Low'` in prDoc |
| `generatePRandTR() PR addDoc` | Firestore prs collection | addDoc with urgency_level field | WIRED | Line 3595: `urgency_level: mrfData.urgency_level || 'Low'` in addDoc call |
| `onSnapshot prListener` | `renderMaterialPRs()` after sort re-application | sort block between array population and render call | WIRED | Lines 1119-1130: `materialPRs.sort()` using `prSortColumn`/`prSortDirection` inserted between forEach loop close and `renderMaterialPRs()` call — gap is closed |
| `onSnapshot trListener` | `renderTransportRequests()` after sort re-application | sort block between array population and render call | WIRED | Lines 1149-1160: `transportRequests.sort()` using `trSortColumn`/`trSortDirection` inserted between forEach loop close and `renderTransportRequests()` call — gap is closed |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SORT-01 | 47-01-PLAN.md | Finance user can sort the Material PRs table by clicking column headers | SATISFIED | Click-triggered sort works (lines 1305-1328); onSnapshot re-render preserves sort order (lines 1119-1130); both paths wired |
| SORT-02 | 47-01-PLAN.md | Finance user can sort the Transport Requests table by clicking column headers | SATISFIED | Click-triggered sort works (lines 1329-1352); onSnapshot re-render preserves sort order (lines 1149-1160); both paths wired |
| BRD-02 | 47-02-PLAN.md | Login page displays company logo instead of the "CL" text placeholder | SATISFIED | login.js render() uses img tag with CLMC logo path and onerror fallback; no CL placeholder remaining |
| URG-01 | 47-02-PLAN.md | PR documents carry urgency_level from parent MRF so Finance sees the correct urgency | SATISFIED | urgency_level added to both PR creation paths in procurement.js (lines 3309, 3595) |

No orphaned requirements — all 4 requirement IDs from PLAN frontmatter are fully satisfied. REQUIREMENTS.md traceability table (lines 117-120) still shows status "Planned" for all 4 IDs; these should be updated to "Complete" as a documentation task.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/views/procurement.js` | 2903 | Comment "// Placeholder stubs for remaining functions" | Info | Section header comment only — no actual stubs present; no action needed |

No stub implementations, empty handlers, or unimplemented functions found in phase-modified files.

### Human Verification Required

#### 1. Sort persistence after live Firestore snapshot

**Test:** Navigate to Finance > Pending Approvals, click the "Urgency" header on the Material PRs table to sort ascending, then in a separate tab approve one of the pending PRs (changing its `finance_status` to Approved, which removes it from the Pending query)
**Expected:** After the approved PR disappears from the table, the remaining rows are still ordered by Urgency level — not reverted to Firestore document order
**Why human:** Triggering a live Firestore onSnapshot requires an actual data mutation; cannot be simulated with static file inspection

#### 2. Sort state persistence across tab switches

**Test:** Sort Material PRs by "Total Cost" (click header), then navigate to Finance > Purchase Orders, then navigate back to Finance > Pending Approvals
**Expected:** Material PRs table shows the blue Total Cost sort arrow and rows are in Total Cost order — `prSortColumn` module-level variable retains its value since `destroy()` is not called on tab switch
**Why human:** Tab switch behavior and DOM re-render with persistent sort state require live router interaction

#### 3. Combined filter and sort persistence after snapshot

**Test:** On Finance > Pending Approvals, apply the "Projects" department filter, then sort by "Urgency", then generate a new PR from Procurement to trigger a snapshot update
**Expected:** After the snapshot, the table still shows only project PRs sorted by urgency — filter (activeDeptFilter) and sort (prSortColumn) state both persist
**Why human:** Combined filter+sort interaction after a live snapshot requires live UI testing

### Re-verification Summary

The gap identified in the initial verification — sort order resetting on every Firestore snapshot update for the Material PRs and Transport Requests tables — has been closed by plan 47-03 (commit `03caae4`).

**Gap closure confirmed:**
- `prListener` onSnapshot callback (lines 1108-1134): sort block at lines 1119-1130 correctly placed between the `snapshot.forEach` loop and the `renderMaterialPRs()` call, using `prSortColumn`/`prSortDirection` state variables
- `trListener` onSnapshot callback (lines 1141-1165): sort block at lines 1149-1160 correctly placed between the `snapshot.forEach` loop and the `renderTransportRequests()` call, using `trSortColumn`/`trSortDirection` state variables
- Both comparators match the existing `sortMaterialPRs()` and `sortTransportRequests()` functions exactly (null handling, string localeCompare, numeric subtraction)
- No special Timestamp handling needed: `date_generated` (PR) and `date_submitted` (TR) are stored as ISO date strings, which sort correctly via localeCompare — unlike the PO listener which handles Firestore Timestamps for `date_issued`

**No regressions detected:** All 7 previously-verified items confirmed present and wired in their original form.

**Documentation note:** REQUIREMENTS.md traceability table at lines 117-120 still shows "Planned" for SORT-01, SORT-02, BRD-02, URG-01. These should be updated to "Complete" in a documentation pass — this is a doc gap only, not a code gap.

---

_Verified: 2026-02-28T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
