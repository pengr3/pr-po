---
phase: 92-projects-tab-status-scorecards
reviewed: 2026-05-18
reviewer: claude-sonnet-4-6
status: passed-with-warnings
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
files_reviewed: 3
---

# Phase 92 Code Review

## Scope

- `app/views/projects.js` — renderScorecards, handleScorecardClick, activeStatusFilter, click-outside listener, UNIFIED_STATUS_OPTIONS (Draft removed), #projectStatusFilter removal, rebuildStatusFilterOptions removal
- `styles/views.css` — new .project-scorecards CSS block appended at end of file
- `app/views/home.js` — deletion of projectsCardHtml(), projectsListener onSnapshot block, projectsByStatus from cachedStats

## Warnings

### W-01 — Double renderScorecards() call on every card click and click-outside

**Confidence**: 85  
**File**: `app/views/projects.js`

`handleScorecardClick()` calls `renderScorecards()` then `applyFilters()`. `applyFilters()` unconditionally calls `renderScorecards()` at its tail. Result: two full DOM update passes per interaction. Same pattern in `_scorecardClickOutside`.

**Fix**: Remove the direct `renderScorecards()` call from `handleScorecardClick()` and from `_scorecardClickOutside`. `applyFilters()` is the canonical update path.

---

### W-02 — Stale comment in home.js declares projects.js as canonical source; arrays now intentionally diverge

**Confidence**: 82  
**File**: `app/views/home.js` line 8

Comment reads: `// Unified status list — canonical source: app/views/projects.js (Phase 81 D-02)`

After Phase 92 the two arrays differ: `projects.js` has 10 entries (no Draft); `home.js` has 11 (Draft retained for services chart). A developer following the comment and syncing to `projects.js` would silently drop the Draft bucket from the services chart.

**Fix**: Update comment to note the deliberate divergence.

## Info

### I-01 — Scorecard counts reflect global allProjects, not role-scoped view (by design)

Confidence: 70 — below threshold. operations_user sees global counts in scorecards but scoped rows in table. Intentional per plan spec.

### I-02 — Total card has no active highlight before first Firestore snapshot fires

Confidence: 65 — below threshold. Transient cosmetic gap (< 500ms). No code change needed.
