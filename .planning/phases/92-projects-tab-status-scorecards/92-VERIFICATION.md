---
phase: 92-projects-tab-status-scorecards
verified: 2026-05-18T00:00:00Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open http://localhost:8000/#/projects and visually confirm the scorecard strip"
    expected: "A 6-column × 2-row grid appears above the filter bar showing 10 status cards (For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision, Client Approved, For Mobilization, On-going, Completed, Loss) plus a Total card spanning 2 columns. Initial counts show '—' then update to live numbers after the Firestore snapshot fires."
    why_human: "Visual layout and real-time count update require browser rendering with live Firestore data"
  - test: "Click a status card (e.g., 'On-going'), then click it again"
    expected: "First click: card highlights with blue border (#1a73e8) + light blue background (#e8f0fe); project table filters to only On-going projects. Second click: highlight clears; all projects shown; Total card becomes active."
    why_human: "Toggle interaction and highlight state require browser event testing"
  - test: "With a status card active, click anywhere outside the scorecard strip"
    expected: "Active filter clears, Total card highlights, all projects shown"
    why_human: "Click-outside listener behavior requires browser testing"
  - test: "With a status card active, type in the Search box or change the Client dropdown"
    expected: "Search/Client filters AND correctly with the active status filter — only projects matching both the status and the search/client appear"
    why_human: "AND-filter interaction requires live data to verify"
  - test: "Confirm 'Proposal for Internal Approval' label wraps cleanly without truncation"
    expected: "The long label wraps to 2 lines within its card cell; no overflow or ellipsis"
    why_human: "CSS word-break and card sizing require visual inspection"
  - test: "Open http://localhost:8000/#/ (Home page) as an operations_admin or operations_user role"
    expected: "Only the Procurement stat card is visible (Pending MRFs, Pending PRs, Active POs). No Projects status chart or canvas element present in the DOM."
    why_human: "Role-gated rendering requires an authenticated session with the correct role"
  - test: "Confirm Home page loads without JS console errors after Phase 92 changes"
    expected: "No uncaught errors in browser DevTools console on home page load for any role"
    why_human: "Runtime JS errors are only detectable in a live browser session"
---

# Phase 92: Projects Tab Status Scorecards — Verification Report

**Phase Goal:** Add a status scorecard strip to the Projects tab that gives users a live count of every project status, replacing the Home page chart as the status overview surface.
**Verified:** 2026-05-18
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Projects tab shows a 6-col × 2-row scorecard strip above the filter bar with 10 status cards + 1 Total card | ✓ VERIFIED | `projects.js` lines 191–202: `<div id="projectScorecards" class="project-scorecards">` with 10 cards from `UNIFIED_STATUS_OPTIONS.map(...)` + 1 total card; CSS grid at `views.css:2976–2981` |
| 2 | Each status card shows status label (small text) and live count (large bold) derived from allProjects | ✓ VERIFIED | `renderScorecards()` (lines 734–749) reads `allProjects` directly (not `filteredProjects`) for per-status counts and total |
| 3 | Clicking a status card sets activeStatusFilter and highlights the card; clicking same card again clears the filter | ✓ VERIFIED | `handleScorecardClick()` (lines 752–759) toggles `activeStatusFilter`; `renderScorecards()` applies `--active` class via `data-status` attribute query |
| 4 | Clicking Total card clears activeStatusFilter and shows all projects | ✓ VERIFIED | Total card `onclick` calls `handleScorecardClick(null)` → sets `activeStatusFilter = null` → `applyFilters()` shows all scoped projects |
| 5 | Clicking outside the scorecard strip clears activeStatusFilter and removes highlight | ✓ VERIFIED | `_scorecardClickOutside` at lines 291–299: registered in `init()`, removed in `destroy()`; checks `strip.contains(e.target)` guard |
| 6 | Client dropdown and Search input work as AND filters with active status filter | ✓ VERIFIED | `applyFilters()` lines 780–796: `matchesSearch && matchesProjectStatus && matchesClient` — all three conditions ANDed |
| 7 | UNIFIED_STATUS_OPTIONS no longer contains 'Draft' | ✓ VERIFIED | Zero occurrences of `'Draft'` in `projects.js`; array at lines 32–43 contains exactly 10 entries: For Inspection through Loss |
| 8 | The #projectStatusFilter select element is gone from the filter bar | ✓ VERIFIED | Zero occurrences of `projectStatusFilter` in `projects.js`; filter bar at lines 205–221 contains only clientFilter and searchInput |
| 9 | rebuildStatusFilterOptions function is deleted | ✓ VERIFIED | Zero occurrences of `rebuildStatusFilterOptions` in `projects.js`; `renderProjectsTable()` (line 901) begins with `const tbody = ...`, not a rebuild call |
| 10 | Home page has no dedicated Firestore onSnapshot listener for the projects collection | ✓ VERIFIED | `loadStats()` (lines 320–400) contains MRF, PR, PO, and services listeners only; no `collection(db, 'projects')` call present |
| 11 | Home page no longer renders a Projects stat card or Chart.js canvas for project status | ✓ VERIFIED | `render()` at lines 258–261: only `procurementCardHtml()` and conditional `servicesCardHtml()` — no `projectsCardHtml()` call; function does not exist |
| 12 | The 3 remaining procurement stat cards (Pending MRFs, Pending PRs, Active POs) are unchanged | ✓ VERIFIED | `procurementCardHtml()` (lines 105–125) intact; MRF, PR, PO listeners in `loadStats()` (lines 322–368) unchanged |
| 13 | home.js does not contain the string 'projectsListener' or 'projectsCardHtml' | ✓ VERIFIED | Zero occurrences of both strings in `home.js`; also `projectsByStatus` (0 occurrences) and `stat-projects-status` (0 occurrences) |

**Score:** 13/13 truths verified

### ROADMAP Success Criteria vs Implementation Deviation (WARNING)

ROADMAP SC1 lists the status set as including **Draft** (and omitting Loss). The implementation — per Plan 01's deliberate design decision — **removed Draft and retained Loss**. Both result in 10 status cards. This is an intentional plan-level deviation from the ROADMAP wording, not an accidental omission:

- ROADMAP says: Draft, For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision, Client Approved, For Mobilization, On-going, Completed (no Loss)
- Implementation has: For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision, Client Approved, For Mobilization, On-going, Completed, Loss (no Draft)

Plan 01 explicitly calls out "Remove 'Draft' from UNIFIED_STATUS_OPTIONS" as Change 2, consistent with Phase 88 D-05 decisions. The home.js retains Draft in its local `UNIFIED_STATUS_OPTIONS` for the services chart. No override entry is required — this is a plan-scoped design decision, not an unexpected deviation.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/views/projects.js` | renderScorecards, handleScorecardClick, updated applyFilters, updated UNIFIED_STATUS_OPTIONS, updated init/destroy | ✓ VERIFIED | All required functions present; no draft, no projectStatusFilter, no rebuildStatusFilterOptions |
| `styles/views.css` | .project-scorecards grid styles | ✓ VERIFIED | CSS block at lines 2972–3033: 6-col grid, card styles, active state, total span, label/count sizing, responsive |
| `app/views/home.js` | Home page without projects chart listener and card | ✓ VERIFIED | All projects-related code removed; services and procurement code intact |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `loadProjects()` onSnapshot | `renderScorecards()` | `applyFilters()` call at end of onSnapshot, which calls `renderScorecards()` at line 805 | ✓ WIRED | `loadProjects()` line 891: `applyFilters()`; `applyFilters()` line 805: `renderScorecards()` |
| Scorecard card onclick | `handleScorecardClick(status)` | `window.handleScorecardClick` registered in `attachWindowFunctions()` line 84 | ✓ WIRED | HTML at line 194: `onclick="window.handleScorecardClick('${s}'); event.stopPropagation()"` |
| document click listener | `_scorecardClickOutside` → `applyFilters()` | Registered in `init()` at line 299 | ✓ WIRED | `destroy()` removes it at lines 364–367 |
| `home.js render()` | no projectsCardHtml call | N/A (deletion verified) | ✓ WIRED (absent) | `render()` at line 258 only calls `procurementCardHtml()` and conditionally `servicesCardHtml()` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `renderScorecards()` in projects.js | `allProjects` | `onSnapshot(collection(db, 'projects'), ...)` in `loadProjects()` (line 884) | Yes — Firestore live snapshot; `allProjects` populated on every snapshot fire | ✓ FLOWING |
| `procurementCardHtml()` in home.js | `cachedStats.activeMRFs`, `pendingPRs`, `activePOs` | Three separate `onSnapshot` blocks in `loadStats()` (lines 322–368) | Yes — Firestore live snapshots for mrfs, prs, pos collections | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points without a browser session (zero-build static website served via `python -m http.server`; no CLI or module exports that can be exercised standalone).

### Probe Execution

Step 7c: SKIPPED — no probe scripts declared in PLAN frontmatter and no `scripts/*/tests/probe-*.sh` files present in this project.

### Requirements Coverage

No requirements mapped to Phase 92 (ROADMAP: "Requirements: None mapped (UX migration phase)"). Step 6 not applicable.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No TBD/FIXME/XXX markers, no stub patterns, no hardcoded empty returns in modified files. The click-outside handler omits the explicit `renderScorecards()` call specified in the plan (calls only `applyFilters()` which chains to `renderScorecards()`). This is functionally equivalent and not a defect.

### Human Verification Required

#### 1. Scorecard Strip Visual Layout

**Test:** Open `http://localhost:8000/#/projects` — confirm the scorecard strip renders above the filter bar.
**Expected:** 6-column × 2-row grid with 10 single-column cards + 1 double-column Total card. All cards initially show "—" then live Firestore counts within ~500ms. No #projectStatusFilter select visible.
**Why human:** Visual layout and real-time count population require live browser rendering.

#### 2. Status Card Click — Filter and Highlight

**Test:** Click any status card (e.g., "On-going"). Then click it again.
**Expected:** First click: card gets blue border + light blue background; project table shows only rows matching that status. Second click: highlight clears; all rows visible; Total card becomes active.
**Why human:** DOM class toggle and table filter result require a browser session with live data.

#### 3. Click-Outside Clears Filter

**Test:** Activate a status card filter, then click anywhere on the page outside the scorecard strip.
**Expected:** Active filter clears; Total card highlights; all projects shown again.
**Why human:** Document-level click listener behavior requires browser event propagation testing.

#### 4. AND-Filter Combination

**Test:** With a status card active (e.g., "On-going"), type a project name in Search or select a client in the Client dropdown.
**Expected:** Only projects matching BOTH the active status AND the search/client criteria appear.
**Why human:** Requires live Firestore data to produce meaningful intersection results.

#### 5. Long Label Wrapping

**Test:** Inspect the "Proposal for Internal Approval" card.
**Expected:** Label wraps to 2 lines within the card without truncation, overflow, or ellipsis. Other cards render their labels cleanly.
**Why human:** CSS word-break rendering requires visual inspection in the actual browser at various viewport widths.

#### 6. Home Page — Projects Chart Absent

**Test:** Open `http://localhost:8000/#/` as operations_admin or operations_user role (or inspect DOM source for any role).
**Expected:** No canvas element with id containing "projects-status". Procurement card shows Pending MRFs, Pending PRs, Active POs counts. No JS console errors.
**Why human:** Role-gated rendering and canvas DOM presence require an authenticated browser session.

#### 7. Services Chart Unaffected

**Test:** Open home page as services_admin or super_admin role.
**Expected:** Services chart (One-time and Recurring status breakdowns) renders correctly. Chart.js canvas is present and populated.
**Why human:** Services chart rendering requires the correct role and live Firestore services data.

### Gaps Summary

No automated gaps found. All 13 must-haves verified via static code analysis. The 7 human verification items above cover the interactive and visual behaviors that cannot be confirmed without a live browser session.

---

_Verified: 2026-05-18_
_Verifier: Claude (gsd-verifier)_
