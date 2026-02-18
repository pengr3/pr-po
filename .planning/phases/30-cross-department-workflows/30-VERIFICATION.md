---
phase: 30-cross-department-workflows
verified: 2026-02-18T09:00:00Z
status: passed
score: 10/10 must-haves verified
re_verification: false
---

# Phase 30: Cross-Department Workflows Verification Report

**Phase Goal:** Finance and Procurement approve work from both departments in unified interface
**Verified:** 2026-02-18
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                              | Status     | Evidence                                                                                                    |
|----|------------------------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------|
| 1  | Finance Pending Approvals table shows a department badge in each PR and TR row                                                     | VERIFIED   | `finance.js:1185` — `getDeptBadgeHTML(pr)` in `renderMaterialPRs()` row; `finance.js:1238` — `getDeptBadgeHTML(tr)` in `renderTransportRequests()` row |
| 2  | Finance Purchase Orders table shows a department badge in each PO row                                                             | VERIFIED   | `finance.js:2073` — `getDeptBadgeHTML(po)` in `renderPOs()` row                                           |
| 3  | A department filter dropdown above the Material PRs section lets user select All / Projects / Services and instantly filters all three approval tables | VERIFIED   | `finance.js:651` — `<select id="deptFilterApprovals" onchange="window.applyFinanceDeptFilter(this.value)">` in render(); `finance.js:86-91` — `applyFinanceDeptFilter()` calls `renderMaterialPRs()`, `renderTransportRequests()`, `renderPOs()` |
| 4  | PR detail modal and TR detail modal each show the department badge alongside the label                                             | VERIFIED   | `finance.js:1320-1321` — PR modal shows "Department:" label with `getDeptBadgeHTML(pr)`; `finance.js:1453-1454` — TR modal shows department badge |
| 5  | Filter state resets to All Departments when user navigates away and returns (finance.js)                                          | VERIFIED   | `finance.js:1082-1083` — `destroy()` contains `delete window.applyFinanceDeptFilter` and `activeDeptFilter = ''` |
| 6  | Procurement MRF Records PO Tracking table shows a department badge in each row                                                   | VERIFIED   | `procurement.js:3833` — `getDeptBadgeHTML(po)` alongside `getMRFLabel(po)` in `renderPOTrackingTable()` row |
| 7  | A department filter dropdown in the MRF Records card header lets user select All / Projects / Services and filters the PO table   | VERIFIED   | `procurement.js:282-283` — `<select id="deptFilterPOTracking" onchange="window.applyPODeptFilter(this.value)">` in render(); filter applied via `displayPos` at `procurement.js:3774-3776` before pagination |
| 8  | The Procurement Timeline modal description for the MRF entry shows the correct department label using getMRFLabel()               | VERIFIED   | `procurement.js:4460` — `const deptLabel = mrf.department === 'services' ? 'Service' : 'Project'`; `procurement.js:4465` — `description: Requestor: ${mrf.requestor_name} | ${deptLabel}: ${getMRFLabel(mrf)}` |
| 9  | PR and PO timeline entries show a department indicator in their description text                                                  | VERIFIED   | `procurement.js:4475` — PR entry has `Dept: ${pr.department === 'services' ? 'Services' : 'Projects'}`; `procurement.js:4486` — TR entry has same; `procurement.js:4497` — PO entry has `${po.department === 'services' ? 'Services' : 'Projects'}` |
| 10 | Filter state resets to All Departments when user navigates away and returns (procurement.js)                                     | VERIFIED   | `procurement.js:625-626` — `destroy()` contains `delete window.applyPODeptFilter` and `activePODeptFilter = ''` |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact                      | Expected                                                    | Status     | Details                                                                                                      |
|-------------------------------|-------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------------------------|
| `app/views/finance.js`        | Department-aware finance view with badges and filter        | VERIFIED   | Contains `getDeptBadgeHTML` (line 52), `activeDeptFilter` (line 80), `applyFinanceDeptFilter` (line 86), filter dropdown (line 651), filter logic in all three render functions, modal badge updates. Wired to window in `attachWindowFunctions()` (line 133). |
| `app/views/procurement.js`    | Department-aware PO tracking table and timeline             | VERIFIED   | Contains `getDeptBadgeHTML` (line 33), `activePODeptFilter` (line 65), `applyPODeptFilter` (line 74), filter dropdown (line 282), `displayPos` filter before pagination (line 3774), badge in PO row (line 3833), timeline dept context (lines 4460-4497). Wired to window in `attachWindowFunctions()` (line 128). |

### Key Link Verification

**Plan 01 (finance.js)**

| From                                   | To                                        | Via                                                      | Status  | Details                                                       |
|----------------------------------------|-------------------------------------------|----------------------------------------------------------|---------|---------------------------------------------------------------|
| `render()` Material PRs card-header    | `window.applyFinanceDeptFilter`           | `onchange` on `<select id="deptFilterApprovals">`        | WIRED   | `finance.js:651-652` — select id and onchange both present   |
| `applyFinanceDeptFilter()`             | `renderMaterialPRs()`, `renderTransportRequests()`, `renderPOs()` | sets `activeDeptFilter` then calls all three | WIRED   | `finance.js:86-91` — function body confirmed                 |
| `attachWindowFunctions()`              | `window.applyFinanceDeptFilter`           | explicit assignment                                      | WIRED   | `finance.js:133` confirmed                                   |
| `destroy()`                            | `activeDeptFilter` reset + window fn deleted | `delete` and `= ''` in destroy body                  | WIRED   | `finance.js:1082-1083` confirmed                             |

**Plan 02 (procurement.js)**

| From                                   | To                                        | Via                                                      | Status  | Details                                                       |
|----------------------------------------|-------------------------------------------|----------------------------------------------------------|---------|---------------------------------------------------------------|
| `render()` records-section card-header | `window.applyPODeptFilter`                | `onchange` on `<select id="deptFilterPOTracking">`       | WIRED   | `procurement.js:282-283` — select id and onchange both present |
| `applyPODeptFilter()`                  | `renderPOTrackingTable(filteredData)`     | filters `poData` in-memory then calls render             | WIRED   | `procurement.js:74-79` — filters `poData`, passes filtered array |
| `attachWindowFunctions()`              | `window.applyPODeptFilter`                | explicit assignment                                      | WIRED   | `procurement.js:128` confirmed                               |
| `showProcurementTimeline()`            | `getMRFLabel(mrf)`                        | MRF timeline item description uses `getMRFLabel()`       | WIRED   | `procurement.js:4465` — `${deptLabel}: ${getMRFLabel(mrf)}`  |
| `destroy()`                            | `activePODeptFilter` reset + window fn deleted | `delete` and `= ''` in destroy body                | WIRED   | `procurement.js:625-626` confirmed                           |

### Requirements Coverage

All 7 requirement IDs claimed in plan frontmatter are covered:

| Requirement | Source Plan | Description                                                               | Status    | Evidence                                                                                      |
|-------------|-------------|---------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------------|
| CROSS-01    | 30-01       | Finance Pending Approvals shows PRs/TRs from both Projects and Services   | SATISFIED | Finance view loads all PRs/TRs from Firestore with no department restriction; `getDeptBadgeHTML` in all rows |
| CROSS-02    | 30-02       | Procurement PO Tracking shows POs from both Projects and Services         | SATISFIED | PO tracking loads all POs via `onSnapshot` with no department restriction; badges in all rows |
| CROSS-03    | 30-01, 30-02 | Department badge/indicator visible in Finance and Procurement lists       | SATISFIED | Purple "Services" / blue "Projects" inline badge spans in all three Finance tables and PO Tracking table |
| CROSS-04    | 30-01, 30-02 | Optional department filter dropdown in Finance and Procurement views      | SATISFIED | `deptFilterApprovals` in finance.js; `deptFilterPOTracking` in procurement.js; both wired to window functions |
| CROSS-05    | 30-01       | PR generation works for Services-linked MRFs                              | SATISFIED | `procurement.js:3252-3254` — `generatePR()` copies `service_code`, `service_name`, `department` from MRF to PR doc |
| CROSS-06    | 30-01       | PO creation works for Services-linked PRs                                 | SATISFIED | `finance.js:1684-1686` — PO `addDoc` copies `service_code`, `service_name`, `department` from PR |
| CROSS-07    | 30-02       | Timeline audit trail shows department context                             | SATISFIED | `procurement.js:4460-4497` — MRF entry uses `deptLabel + getMRFLabel(mrf)`; PR/TR/PO entries each include dept text |

**Cross-check against REQUIREMENTS.md:** All seven CROSS-01 through CROSS-07 requirements are marked `[x]` in `.planning/REQUIREMENTS.md` at lines 85-91 with "Phase 30: Complete" in the traceability table (lines 188-194). No orphaned requirements were found — the REQUIREMENTS.md Phase 30 mapping exactly matches the plan frontmatter declarations.

### Anti-Patterns Found

| File                         | Line  | Pattern                         | Severity | Impact |
|------------------------------|-------|---------------------------------|----------|--------|
| `app/views/procurement.js`   | 3744  | Scoreboard uses filtered `pos` when called from `applyPODeptFilter` | Warning  | When filter is active, scoreboard counts reflect the filtered subset rather than global totals. This contradicts the plan's stated success criterion ("Scoreboard counts still calculated from the full unfiltered `pos` parameter"). The filter IS idempotent (table display is correct) but scoreboard global accuracy is lost during active filtering. Does not block the phase goal. |

**Explanation of the scoreboard issue:** `applyPODeptFilter()` filters `poData` and passes the result to `renderPOTrackingTable(filtered)`. Inside `renderPOTrackingTable`, the scoreboard loop at line 3744 runs `pos.forEach(...)` where `pos` is the already-filtered argument. So when "Services" filter is active, the scoreboard shows only Services counts. The `displayPos` secondary filter at line 3774 is then redundant (filtering already-filtered data) but harmless. This is a design inconsistency where the plan intended scoreboards to show global totals but the call path does not achieve this when the filter is user-triggered.

### Human Verification Required

The following items require a browser to verify visually:

#### 1. Badge Visual Appearance

**Test:** Navigate to Finance > Pending Approvals. Inspect PR rows.
**Expected:** Purple badge labeled "Services" for services-linked PRs; blue badge labeled "Projects" for project-linked PRs. Badge is compact, inline beside the project/service label.
**Why human:** CSS rendering, color accuracy, and visual layout cannot be verified by static analysis.

#### 2. Filter Dropdown — Live Filtering Behavior

**Test:** Select "Services" from the department dropdown above Material PRs.
**Expected:** Material PRs, Transport Requests, and Purchase Orders tables all instantly filter to show only services-linked records (or empty state message). No page refresh needed.
**Why human:** DOM mutation behavior and real-time response requires browser execution.

#### 3. Filter State Reset on Navigation

**Test:** Navigate to Finance, apply "Services" filter, then navigate to Home, then back to Finance.
**Expected:** Filter dropdown resets to "All Departments" and all records are visible.
**Why human:** Navigation lifecycle behavior requires live browser session.

#### 4. Tab Switching Within Finance

**Test:** Apply "Services" filter in Finance Pending Approvals, then switch to Finance > Purchase Orders tab, then back to Finance > Pending Approvals.
**Expected:** Filter dropdown and window function still work after tab switching.
**Why human:** Tab-switch window function lifecycle requires live browser session.

#### 5. Procurement Timeline Department Context

**Test:** Click "Timeline" on a services-linked PO in Procurement > MRF Records.
**Expected:** MRF entry shows "Service: CLMC_XXX_YYYYNNN - Service Name" (not just project_name). PR, TR, and PO entries each show "Dept: Services".
**Why human:** Requires live data in Firestore to populate the modal.

#### 6. Procurement Scoreboard Behavior Under Filter (Confirm Acceptance)

**Test:** Apply "Services" filter in Procurement > MRF Records. Observe scoreboard cards.
**Expected (per code):** Scoreboard will show filtered counts (Services-only), not global totals — this is a deviation from the plan success criteria.
**Why human:** User/stakeholder decision on whether this behavior is acceptable or requires a fix.

---

## Gaps Summary

No gaps blocking phase goal achievement. All 10 must-have truths verified, all 5 key links wired in both files, all 7 requirements (CROSS-01 through CROSS-07) satisfied with direct code evidence. All 4 implementation commits confirmed in git history (25f55bf, 9b2d98f, 9e0817f, d6e10c5).

One warning-level issue identified: the procurement scoreboard counts show filtered totals (not global totals) when the department filter is active. This contradicts a stated plan success criterion but does not prevent the core phase goal ("Finance and Procurement approve work from both departments in unified interface"). The filter works correctly for the table display, and the scoreboard issue only affects the summary counts during active filtering.

---

_Verified: 2026-02-18_
_Verifier: Claude (gsd-verifier)_
