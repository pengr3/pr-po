---
phase: 95-notification-row-redesign
verified: 2026-05-26T00:00:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open app, submit a new MRF, then inspect the notification dropdown as a recipient"
    expected: "Row shows 3 lines: (1) 'New MRF' + relative time, (2) MRF-YYYY-NNN · project name, (3) by [submitter name]"
    why_human: "renderDropdownRows reads from live Firestore; dropdown UI requires browser rendering and a real auth session to verify actual row anatomy layout"
  - test: "Generate a PR from Procurement tab; log in as Finance user and open the notification dropdown"
    expected: "PR_REVIEW_NEEDED row shows '● Action needed' chip on line 1; MRF project name appears on line 2; submitter name on line 3"
    why_human: "Action chip visibility requires browser rendering and a real notification doc with PR_REVIEW_NEEDED type"
  - test: "Register a new test account; log in as Admin and open notifications"
    expected: "REGISTRATION_PENDING row has no line 3 (actor_name = 'System' is suppressed)"
    why_human: "actor_name='System' suppression can only be confirmed visually in the rendered dropdown"
  - test: "Open browser DevTools console while performing the MRF submit, PR generate, and registration flows"
    expected: "Zero JS errors across all 8 modified files"
    why_human: "Runtime errors only surface in a live browser session with authenticated Firebase calls"
---

# Phase 95: Notification Row Redesign Verification Report

**Phase Goal:** Upgrade notification dropdown rows to a 3-line anatomy: (1) event title + optional "Action needed" chip + time, (2) source ID · object name, (3) "by ActorName". Extend TYPE_META with action_required + target_route for all 16 types. Extend three creation functions to accept and persist object_name + actor_name. Update all 27 call sites to pass these fields.
**Verified:** 2026-05-26
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dropdown rows display event title, optional action chip, and relative time on line 1 | VERIFIED | `renderDropdownRows` builds `.na-l1` with `<span class="na-event">`, conditional `<span class="na-chip">● Action needed</span>`, and `<span class="na-time">` (notifications.js lines 201-202) |
| 2 | Dropdown rows display objectId · objectName on line 2 (falls back to source_id or message for old docs) | VERIFIED | `.na-l2` rendered using `safeTargetId` (from `n.source_id`) and `safeObjName` (from `n.object_name \|\| n.message`); entire div omitted when both empty (notifications.js lines 205-207) |
| 3 | Dropdown rows display 'by ActorName' on line 3 only when actor_name is non-empty and not 'System' | VERIFIED | `const l3 = (safeActor && safeActor !== 'System') ? '<div class="na-l3">by ' + safeActor + '</div>' : ''` (notifications.js line 210) |
| 4 | Action chip appears for PR_REVIEW_NEEDED, TR_REVIEW_NEEDED, RFP_REVIEW_NEEDED, PROPOSAL_SUBMITTED, REGISTRATION_PENDING rows | VERIFIED | All 5 types have `action_required: true` in TYPE_META (lines 75-77, 80-81); chip condition is `meta.action_required ? '<span class="na-chip">...'` (line 201) |
| 5 | createNotification/createNotificationForRoles/createNotificationForUsers accept object_name and actor_name as optional params and write them to Firestore | VERIFIED | All three function signatures include `object_name = '', actor_name = ''`; all three Firestore batch.set/addDoc payloads include both fields (notifications.js lines 483, 499-500, 536, 566-567, 600, 634-635) |
| 6 | All 16 TYPE_META entries have action_required (bool) and target_route (string) fields | VERIFIED | 16 entries confirmed: 5 with `action_required: true`, 11 with `action_required: false`; all 16 have `target_route`; grep count = 18 total (16 in TYPE_META + 1 fallback default + 1 chip condition) |
| 7 | All 27 createNotification* call sites pass object_name and actor_name | VERIFIED | object_name count per file: proposal-modal.js=2, home.js=1, mrf-form.js=1, register.js=1, project-detail.js=2, service-detail.js=2, finance.js=6, procurement.js=12; total=27 |
| 8 | Human-triggered write sites pass actor_name = getCurrentUser().full_name \|\| 'System' | VERIFIED | Pattern `window.getCurrentUser?.()?.full_name \|\| 'System'` present in all 25 human-actor sites (verified in all 8 files via grep) |
| 9 | System/automated write sites pass actor_name = 'System' | VERIFIED | PO_DELIVERED (procurement.js line 7686): `actor_name: 'System'`; REGISTRATION_PENDING (register.js line 284): `actor_name: 'System'` |
| 10 | No syntax errors — node --check app/notifications.js passes | VERIFIED | `node --check app/notifications.js` exits 0 with no output |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/notifications.js` | Updated TYPE_META, renderDropdownRows, creation API signatures | VERIFIED | Contains all required patterns: `action_required`, `target_route`, `object_name`, `actor_name`, `na-body`, `na-l1`, `na-l2`, `na-l3`, `na-chip` |
| `styles/components.css` | New .na-* CSS rules for 3-line anatomy | VERIFIED | All 10 .na-* classes present (lines 2026-2103); `.notif-row-message` preserved at line 2000 |
| `app/proposal-modal.js` | PROPOSAL_SUBMITTED + PROPOSAL_DECIDED with object_name/actor_name | VERIFIED | `object_name: proposal.title` at lines 997 and 1166 |
| `app/views/finance.js` | RFP_PAID, COLLECTIBLE_CREATED, PR_DECIDED, TR_DECIDED (x2) with object_name/actor_name | VERIFIED | 6 occurrences of `object_name:` confirmed |
| `app/views/mrf-form.js` | MRF_SUBMITTED with object_name/actor_name | VERIFIED | `object_name: projectOrServiceLabel` at line 1745 |
| `app/views/procurement.js` | All 12 procurement call sites with object_name/actor_name | VERIFIED | 12 occurrences of `object_name:` confirmed including `poDataFresh.supplier_name` with `actor_name: 'System'` |
| `app/views/project-detail.js` | PROJECT_STATUS_CHANGED + PROJECT_COST_CHANGED with object_name/actor_name | VERIFIED | `object_name: currentProject.project_name \|\| ''` at lines 845 and 868 |
| `app/views/service-detail.js` | Service notifications with object_name/actor_name | VERIFIED | `object_name: notifServiceName \|\| ''` at lines 804 and 817 |
| `app/views/register.js` | REGISTRATION_PENDING with object_name/actor_name | VERIFIED | `object_name: email \|\| ''`, `actor_name: 'System'` at lines 283-284 |
| `app/views/home.js` | PROPOSAL_DECIDED (home queue) with object_name/actor_name | VERIFIED | `object_name: proposal.title` at line 429 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `renderDropdownRows()` | `TYPE_META` | `meta.action_required` check for chip render | WIRED | `meta.action_required ? '<span class="na-chip">...'` at line 201 |
| `renderDropdownRows()` | `n.object_name / n.source_id / n.message` | graceful fallback chain | WIRED | `safeTargetId = escapeHTML(n.source_id \|\| '')`, `safeObjName = escapeHTML(n.object_name \|\| n.message \|\| '')` |
| `createNotification()` | Firestore notifications collection | addDoc with object_name + actor_name in payload | WIRED | Both fields in addDoc payload at lines 499-500 |
| `createNotificationForRoles()` | Firestore notifications collection | batch.set with object_name + actor_name in payload | WIRED | Both fields in batch.set payload at lines 566-567 |
| `createNotificationForUsers()` | Firestore notifications collection | batch.set with object_name + actor_name in payload | WIRED | Both fields in batch.set payload at lines 634-635 |
| `app/views/procurement.js PO_DELIVERED` | `actor_name: 'System'` | automated status-update trigger | WIRED | Line 7686: `actor_name: 'System'` confirmed |
| `app/views/register.js REGISTRATION_PENDING` | `actor_name: 'System'` | self-service registration | WIRED | Line 284: `actor_name: 'System'` confirmed |
| `handleNotificationClick()` | `TYPE_META[cached?.type]?.target_route` | fallback when link absent | WIRED | Line 440: `const link = cached?.link \|\| TYPE_META[cached?.type]?.target_route \|\| ''` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `renderDropdownRows` in notifications.js | `recentDocs` | `loadRecentForDropdown()` → Firestore `getDocs` with `where('user_id','==',uid)` query | Yes — live Firestore query with user scoping | FLOWING |
| `n.object_name` in renderDropdownRows | written by call sites | 27 call sites pass real Firestore doc fields (project_name, supplier_name, proposal.title, etc.) | Yes — sourced from actual Firestore documents | FLOWING |
| `n.actor_name` in renderDropdownRows | written by call sites | Human sites: `getCurrentUser().full_name`; System sites: literal 'System' | Yes — real user display name or explicit 'System' marker | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — zero-build static SPA with Firebase CDN dependency; no runnable entry points without a browser+auth session. The `node --check` syntax validation was performed in lieu.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| No syntax errors in notifications.js | `node --check app/notifications.js` | exit 0, no output | PASS |
| All required patterns present in notifications.js | inline node check (22 patterns) | ALL OK | PASS |
| All 27 call sites have object_name | inline node count per file | 2+1+1+1+2+2+6+12=27 | PASS |
| .na-* CSS rules present and notif-row-message preserved | inline node check (11 patterns) | ALL OK | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| NOTIF-R01 | 95-01 | TYPE_META extended with action_required + target_route on all 16 entries | SATISFIED | 16 TYPE_META entries confirmed; 5 true / 11 false action_required |
| NOTIF-R02 | 95-01, 95-02 | object_name + actor_name accepted and written by all creation functions | SATISFIED | All 3 function signatures and payloads confirmed |
| NOTIF-R03 | 95-01 | renderDropdownRows produces 3-line .na-body structure | SATISFIED | .na-l1/.na-l2/.na-l3 structure in renderDropdownRows confirmed |
| NOTIF-R04 | 95-01 | Old docs (no object_name) fall back to message in line 2 | SATISFIED | `safeObjName = escapeHTML(n.object_name \|\| n.message \|\| '')` confirmed |
| NOTIF-R05 | 95-02 | All 27 call sites pass object_name and actor_name | SATISFIED | Count confirmed: 27 total across 8 files |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| app/views/finance.js | 2825 | `=== 'TBD'` | Info | String literal comparison in `formatDocumentDate()` helper; tests for the data value "TBD" as a possible Firestore date field — not a debt marker comment. Pre-existing, not introduced by Phase 95. |
| app/views/procurement.js | 8941 | `=== 'TBD'` | Info | Same pattern as above — `formatDocumentDate()` helper. Pre-existing. |
| app/views/procurement.js | 6196 | `// Placeholder stubs for remaining functions` | Info | Pre-existing section header comment; the function bodies below it are fully implemented including all Phase 95 notification call sites. |
| All 8 modified files | various | `placeholder="..."` | Info | HTML input placeholder attributes — UI affordances, not stub implementations. No impact on goal. |

No BLOCKER anti-patterns found. The `TBD` occurrences are data value comparisons inside string guards, not unreferenced debt marker comments.

### Human Verification Required

### 1. 3-Line Row Anatomy — MRF Submit Flow

**Test:** Submit a new MRF as a non-admin user. Log in as a Procurement/Admin user who receives MRF_SUBMITTED notifications. Open the bell dropdown.
**Expected:** Row shows 3 distinct lines: (1) "New MRF" + no chip + relative time, (2) MRF-YYYY-NNN · project/service name, (3) "by [submitter's display name]"
**Why human:** Requires a live browser session with Firebase auth, Firestore writes, and rendered CSS layout.

### 2. Action Chip Visibility — PR Review Flow

**Test:** Approve an MRF from Procurement tab (generatePR). Log in as Finance user and open notification dropdown.
**Expected:** PR_REVIEW_NEEDED row shows "● Action needed" chip on line 1 alongside the event label. MRF project name appears on line 2. Submitter name on line 3.
**Why human:** Chip render depends on `meta.action_required` being true and the DOM actually showing the amber chip element — only verifiable in the browser.

### 3. System Actor Suppression — Registration Flow

**Test:** Register a new test user account. Log in as Admin/Super Admin and open notifications.
**Expected:** REGISTRATION_PENDING row shows line 1 (label + chip + time) and line 2 (email as ID), but NO line 3 (actor_name='System' is suppressed).
**Why human:** Line 3 suppression requires checking rendered HTML in a live session.

### 4. Zero Console Errors

**Test:** Perform the MRF submit, PR generation, and registration flows above.
**Expected:** Browser DevTools console shows zero JS errors from any of the 8 modified files.
**Why human:** Runtime errors from Firebase calls or DOM manipulation only surface in a live authenticated browser session.

### Gaps Summary

No gaps found. All 10 must-have truths are verified in the codebase. The phase goal is fully implemented at the code level — all structural, data-model, and wiring requirements are met. Human verification items are runtime/UI checks that require a live browser session and cannot be confirmed statically.

---

_Verified: 2026-05-26_
_Verifier: Claude (gsd-verifier)_
