---
phase: 35-for-the-gaps-found-during-audit-for-v-2-3
verified: 2026-02-20T09:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 5/5
  note: "Previous verification covered Plan 01 only. UAT revealed two additional gaps (permission guard race condition, services_user prs/pos 403). Plans 02 and 03 were executed. This re-verification covers all three plans as the complete phase."
  gaps_closed:
    - "services_user permission guard race condition — canEdit !== false replaced with === true in renderServiceDetail(); canEditTab === false replaced with !== true in saveServiceField() and toggleServiceDetailActive()"
    - "services_user 403 on prs/pos aggregation — services_user service-scoped list branch added to prs and pos Firestore rules and deployed"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Log in as services_user. Navigate to a service detail page. Observe whether edit inputs (service name, status fields, etc.) are rendered as read-only/disabled from first render — no flash of editable controls."
    expected: "All inline edit inputs are absent or disabled. No save buttons visible. The canEdit === true guard means undefined (permissions loading) renders read-only."
    why_human: "Cannot verify rendering behavior or the absence of a race-condition flash without running the application and observing the initial render frame."
  - test: "As services_user on a service detail page with linked PRs and POs, observe the expense breakdown section."
    expected: "Expense breakdown section renders with MRF count, PR total, and PO total shown correctly. No 403 Forbidden errors in the browser console."
    why_human: "Cannot verify getAggregateFromServer succeeds against live Firebase without browser execution."
  - test: "Log in as services_admin. Navigate to a service detail page with linked PRs/POs. Confirm expense breakdown section renders and edit controls are visible."
    expected: "Edit controls visible. Expense data loads without errors. No regression from Plan 02/03 changes."
    why_human: "Regression check requires live application execution to confirm services_admin is not inadvertently blocked by the tightened guards."
---

# Phase 35: Complete Gap Closure Verification Report

**Phase Goal:** Fix the service edit history path defect (plan 01) and close UAT-identified gaps: services_user permission guard race condition and missing prs/pos Firestore list rules for services_user
**Verified:** 2026-02-20T09:00:00Z
**Status:** human_needed
**Re-verification:** Yes — initial verification covered Plan 01 only (pre-UAT). Plans 02 and 03 executed post-UAT. This report covers all three plans as the complete phase.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Service edits write audit entries to services/{docId}/edit_history (not projects/{docId}/edit_history) | VERIFIED | `edit-history.js` both functions accept `collectionName = 'projects'` default. All 4 `service-detail.js` call sites and all 3 `services.js` call sites pass `'services'` as 4th arg. Commits `4c776d6`, `a017fae`, `348231c`. |
| 2 | Edit History button appears in Card 1 header of service-detail.js | VERIFIED | Lines 291-293 of `service-detail.js` contain `<button ... onclick="window.showEditHistory()">Edit History</button>` inside `justify-content: space-between` header div. |
| 3 | Clicking Edit History opens the timeline modal scoped to the service's doc ID | VERIFIED | `attachWindowFunctions()` registers `window.showEditHistory = () => currentService && currentServiceDocId && showEditHistoryModal(currentServiceDocId, currentService.service_code, 'services')`. Cleaned up in `destroy()`. |
| 4 | All existing project-detail.js edit history calls continue to work with no changes required | VERIFIED | `project-detail.js` call sites use 3-argument form with no 4th arg — correctly defaults to `'projects'` via the new optional parameter. |
| 5 | services_user sees service detail in read-only mode — no edit inputs visible during permission loading | VERIFIED | Line 250: `const showEditControls = canEdit === true;` — zero matches for the old `canEdit !== false` pattern. No `canEditTab.*=== false` matches in file. Commit `a6d62c1`. |
| 6 | saveServiceField and toggleServiceDetailActive return early without Firestore write when called by a read-only role | VERIFIED | Line 624: `if (window.canEditTab?.('services') !== true)`. Line 693: `if (window.canEditTab?.('services') !== true)`. Both guard functions before any DB write. Commit `a6d62c1`. |
| 7 | refreshServiceExpense skips aggregation queries when the user cannot read services tab (defense-in-depth) | VERIFIED | Lines 752-755 of `service-detail.js`: `const canRead = window.hasTabAccess?.('services'); if (canRead === false) return;` — positioned before `showLoading(true)` and all query calls. Commit `61d0525`. |
| 8 | services_user can run getAggregateFromServer on prs filtered by service_code without a 403 error | VERIFIED | `firestore.rules` line 203: `(isRole('services_user') && isAssignedToService(resource.data.service_code))` in prs list rule. Commit `a5fc13b` deployed to production. |
| 9 | services_user can run getAggregateFromServer on pos filtered by service_code without a 403 error | VERIFIED | `firestore.rules` line 227: `(isRole('services_user') && isAssignedToService(resource.data.service_code))` in pos list rule. Same commit deployed to production. |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/edit-history.js` | recordEditHistory and showEditHistoryModal with optional collectionName parameter | VERIFIED | Both function signatures have `collectionName = 'projects'` as 4th param. Both `collection(db, collectionName, ...)` usages confirmed. |
| `app/views/service-detail.js` | Edit History button + window.showEditHistory + correct collection arg | VERIFIED | Button at lines 291-293. `window.showEditHistory` in `attachWindowFunctions()` passing `'services'`. Cleaned in `destroy()`. |
| `app/views/service-detail.js` | Corrected permission guard: `canEdit === true` in renderServiceDetail | VERIFIED | Line 250 confirmed. Zero matches for old `canEdit !== false` pattern. |
| `app/views/service-detail.js` | Corrected save guard: `canEditTab !== true` in saveServiceField and toggleServiceDetailActive | VERIFIED | Lines 624 and 693 both read `!== true`. Zero matches for old `=== false` guard. |
| `app/views/service-detail.js` | canReadTab defense-in-depth guard in refreshServiceExpense | VERIFIED | Lines 752-755 confirmed present. Guard uses `hasTabAccess` (read check, not edit check). |
| `app/views/services.js` | Corrected recordEditHistory calls with 'services' as 4th arg | VERIFIED | All 3 call sites confirmed at lines 726, 1148, 1224. |
| `firestore.rules` | prs list rule with services_user service-scoped branch | VERIFIED | Line 203: `(isRole('services_user') && isAssignedToService(resource.data.service_code))`. |
| `firestore.rules` | pos list rule with services_user service-scoped branch | VERIFIED | Line 227: same branch. |
| `firestore.rules` | services/{serviceId}/edit_history subcollection security rule | VERIFIED | Lines 339-345: read for 5 roles, create for 2 roles, update/delete false. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `service-detail.js` | `edit-history.js recordEditHistory` | 4th argument `'services'` | WIRED | Pattern `recordEditHistory\(.*'services'\)` at lines 546-548, 601-603, 677-679, 711-713. |
| `service-detail.js` | `edit-history.js showEditHistoryModal` | window.showEditHistory lambda | WIRED | `showEditHistoryModal(currentServiceDocId, currentService.service_code, 'services')` at line 817-818. |
| `edit-history.js` | Firestore services/{id}/edit_history | `collection(db, collectionName, ...)` | WIRED | `collectionName` variable used in path; when called with `'services'` resolves correctly. |
| `service-detail.js renderServiceDetail()` | `window.canEditTab('services')` | `canEdit === true` guard | WIRED | Line 250 confirmed. `=== true` means undefined (loading) renders read-only. |
| `service-detail.js saveServiceField()` | permission check | `canEditTab !== true` guard | WIRED | Line 624 confirmed. `!== true` blocks write when undefined or false. |
| `service-detail.js refreshServiceExpense()` | Firestore prs collection | getAggregateFromServer — evaluates list rule | WIRED | prs list rule line 200-204 grants services_user service-scoped list access. |
| `service-detail.js refreshServiceExpense()` | Firestore pos collection | getAggregateFromServer — evaluates list rule | WIRED | pos list rule line 223-228 grants services_user service-scoped list access. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SERV-04 | 35-01-PLAN.md, 35-02-PLAN.md, 35-03-PLAN.md | Admin can edit existing services with inline editing and auto-save; edit history button/modal works; services_user sees read-only correctly | SATISFIED | Edit History button + modal wired in service-detail.js. Permission guards corrected in renderServiceDetail, saveServiceField, toggleServiceDetailActive. services_user prs/pos aggregation access granted in Firestore rules. |
| SERV-09 | 35-01-PLAN.md | Service has same fields as Projects — audit trail specifically: edit history entries for services stored at services/{docId}/edit_history | SATISFIED | All 7 service recordEditHistory call sites (4 in service-detail.js, 3 in services.js) pass `'services'` as 4th arg. edit-history.js uses collectionName dynamically. |

**Traceability note:** REQUIREMENTS.md maps SERV-04 and SERV-09 to Phase 28 as "Complete". Phase 35 is a defect-fix gap closure: Plan 01 corrected a silent audit trail path corruption; Plans 02 and 03 corrected a permission guard race condition and a missing Firestore rule — all within the scope of these two requirements. No new requirement IDs are introduced by Phase 35.

**Orphaned requirements check:** REQUIREMENTS.md traceability table does not assign any requirement IDs to Phase 35. The phase is a gap-closure supplement to Phase 28. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/views/service-detail.js` | 372 | `window.refreshServiceExpense()` button in template — calls async function from onclick | Info | Intentional pattern consistent with the rest of the SPA. Not a defect. |
| `firestore.rules` | 143 | `services_admin` still in `projects/edit_history` create rule (Phase 32 workaround) | Info | Harmless. Documented in Phase 35 research as intentional out-of-scope cleanup. No correctness impact since services now write to their own `services/{id}/edit_history` path. |

No blocking or warning anti-patterns found.

### Human Verification Required

### 1. services_user read-only view — no flash of edit controls

**Test:** Log in as a `services_user` assigned to a service. Navigate directly to that service's detail page (e.g., `#/services/detail/CLMC_CODE_2026001`). Watch the initial render — before and after the `permissionsChanged` event fires.
**Expected:** Edit inputs are never visible. The service information card shows plain text values (no `<input>` or `<select>` elements). The canEdit === true guard means the undefined state (before permissions load) renders read-only, not the old "flash editable then re-render" behavior.
**Why human:** Race condition behavior and rendering cannot be verified by static code grep. Requires observing the actual first-paint frame in a live browser.

### 2. services_user expense breakdown — no 403 console errors

**Test:** As `services_user`, navigate to a service detail page for a service that has at least one linked MRF/PR/PO. Open the browser DevTools console.
**Expected:** The expense breakdown section renders with MRF count, PR total, and PO total displayed. Zero `403 Forbidden` or `PERMISSION_DENIED` errors in the console.
**Why human:** Requires live Firebase backend call — `getAggregateFromServer` on `prs` and `pos` filtered by `service_code` — to confirm the deployed Firestore list rule grants access.

### 3. services_admin regression check — edit controls and expense breakdown intact

**Test:** Log in as `services_admin`. Open any service detail page. Confirm: (a) inline edit inputs are visible and functional, (b) the expense breakdown loads without errors, (c) Edit History button opens the correct service timeline.
**Expected:** Full edit capability. No regressions from Plan 02 guard tightening (`=== true` should still return `true` for services_admin, so edit controls render). Expense breakdown aggregation succeeds.
**Why human:** Regression confirmation requires live application execution with a services_admin account.

## Gaps Summary

No automated gaps. All 9 observable truths are verified by code inspection. All 7 required artifacts exist, are substantive (not stubs), and are correctly wired. Both requirement IDs (SERV-04, SERV-09) are satisfied. No blocker anti-patterns.

Three items are flagged for human verification because they require live application behavior: the permission-loading race condition is a timing phenomenon, the 403 resolution requires a live Firebase call, and the regression check requires role-specific rendering.

**Commit verification:** All six task commits documented across the three summaries are present in git history:
- `4c776d6` — feat(35-01): add collectionName parameter to recordEditHistory and showEditHistoryModal
- `a017fae` — feat(35-01): fix service-detail.js edit history path + add Edit History button
- `348231c` — feat(35-01): fix services.js edit history path + add Firestore services/edit_history rule
- `a6d62c1` — fix(35-02): tighten canEdit guards in renderServiceDetail, saveServiceField, toggleServiceDetailActive
- `61d0525` — fix(35-02): add canReadTab defense-in-depth guard to refreshServiceExpense()
- `a5fc13b` — feat(35-03): add services_user branch to prs and pos list rules

All commits verified present in `git log --oneline`.

---

_Verified: 2026-02-20T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
