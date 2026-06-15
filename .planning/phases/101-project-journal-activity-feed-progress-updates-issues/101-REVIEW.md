---
phase: 101
status: warnings
files_reviewed: 4
findings:
  critical: 0
  warning: 7
  info: 3
  total: 10
reviewed_at: "2026-06-10"
---

# Code Review — Phase 101: Project Journal

## Summary

4 files reviewed at standard depth. No critical bugs. 7 warnings — mostly CSS class name mismatches between the JS renderers and the CSS block (visual regressions, not data bugs). 2 warnings are behavioural concerns (unconditional pre-execution writes; `window.prompt()` UX deviation). 3 informational notes.

**Files reviewed:**
- `styles/views.css` (journal CSS block ~lines 3892–4384)
- `firestore.rules` (new subcollection blocks ~lines 269–298)
- `app/views/project-detail.js` (journal panel, listeners, tabs, auto-entries)
- `app/views/procurement.js` (PO Delivered auto-entry traversal)

---

## Warnings

### WR-01 — CSS class mismatch: `.journal-pct-badge` vs `.journal-progress-pct-badge`

**File:** `app/views/project-detail.js` ~line 2591 / `styles/views.css` ~line 4155
**Confidence:** 95%

`_renderProgressCard()` emits `<span class="journal-pct-badge">`. The CSS defines `.journal-progress-pct-badge`. The short alias has no rule — the percentage badge on every progress update card renders unstyled (no blue pill, no white text).

**Fix:** Change the JS emit to `journal-progress-pct-badge`, or add a CSS alias in the journal block.

---

### WR-02 — CSS class missing: `.journal-entry-meta-text` undefined in CSS

**File:** `app/views/project-detail.js` ~line 2592 / `styles/views.css`
**Confidence:** 95%

`_renderProgressCard()` emits `<span class="journal-entry-meta-text">` for the timestamp + author line. No rule exists in the CSS block. Renders as unstyled body text instead of the intended small grey treatment.

**Fix:** Rename the span class to `journal-entry-meta` (already defined at CSS ~line 4034), or add `.journal-entry-meta-text { font-size: 0.7rem; color: #94a3b8; }`.

---

### WR-03 — CSS classes missing: `.journal-progress-field` and `.journal-progress-label`

**File:** `app/views/project-detail.js` ~lines 2594–2596 / `styles/views.css`
**Confidence:** 95%

`_renderProgressCard()` emits `.journal-progress-field` wrapper divs and `.journal-progress-label` spans for Summary, Blockers, and Next Milestone. Neither class is defined. The CSS block defines per-field classes (`journal-progress-card-summary`, etc.) that are not used in the JS.

**Fix:** Add to the journal CSS block:
```css
.journal-progress-field { font-size: 0.83rem; color: #1e293b; line-height: 1.45; }
.journal-progress-label { font-weight: 600; color: #475569; margin-right: 0.25rem; }
```

---

### WR-04 — CSS class mismatch: `.journal-issue-desc` vs `.journal-issue-description`

**File:** `app/views/project-detail.js` ~line 2724 / `styles/views.css` ~line 4257
**Confidence:** 90%

`_renderIssueRow()` emits `<div class="journal-issue-desc">`. The CSS defines `.journal-issue-description`. No short alias exists. Issue description text renders unstyled.

**Fix:** Change the JS emit to `journal-issue-description`, or add a `.journal-issue-desc` alias.

---

### WR-05 — Five additional JS classes with no CSS backing rules

**Files:** `app/views/project-detail.js` / `styles/views.css`
**Confidence:** 85%

| Class | Location | Visual Impact |
|---|---|---|
| `.journal-issue-seq` | ~line 2718 | Issue "#N" renders unstyled (no bold, no muted color) |
| `.journal-issue-list` | ~line 2760 | No gap between issue cards |
| `.journal-progress-history` | ~line 2628 | No top margin between form and history |
| `.journal-entry-tag--issue` | ~line 2491 | "Issue" tag pill renders colorless |
| `.journal-entry-tag--edit` | ~line 2491 | "Edit" tag pill renders colorless |

**Fix:** Add to the journal CSS block:
```css
.journal-issue-seq           { font-weight: 700; color: #475569; font-size: 0.78rem; flex-shrink: 0; }
.journal-issue-list          { display: flex; flex-direction: column; }
.journal-progress-history    { margin-top: 0.5rem; }
.journal-entry-tag--issue    { background: #fee2e2; color: #991b1b; }
.journal-entry-tag--edit     { background: #f1f5f9; color: #475569; }
```

---

### WR-06 — `saveField` writes cost-change activity entries unconditionally, including pre-execution project statuses

**File:** `app/views/project-detail.js` ~lines 1331–1338
**Confidence:** 82%

When `budget` or `contract_cost` changes, `_addActivityEntry()` fires regardless of `currentProject.project_status`. The journal panel only renders for `For Mobilization`, `On-going`, and `Completed`. For pre-execution statuses (`For Proposal`, `Client Approved`, etc.) the write goes to Firestore with no listener attached and no UI surface. When those projects later advance to `On-going`, stale cost-change entries appear in the feed with old timestamps.

**Fix:** Wrap the call in a status check:
```javascript
const JOURNAL_VISIBLE_STATUSES = ['For Mobilization', 'On-going', 'Completed'];
if (JOURNAL_VISIBLE_STATUSES.includes(currentProject.project_status)) {
    _addActivityEntry(currentProject.id, { ... }).catch(...);
}
```

---

### WR-07 — `resolveIssue` uses `window.prompt()`, which can be blocked and contradicts the project's modal UX pattern

**File:** `app/views/project-detail.js` ~lines 2807–2808
**Confidence:** 80%

`resolveIssue()` calls `window.prompt('Resolution notes (required):')`. The project's UI design system uses injected `<div class="modal">` overlays for all interactive flows. `prompt()` is blocked by some browser popup settings and suppressed in iframes. When blocked, it returns `null` silently — resolution does nothing with no user feedback.

Every comparable action (billing request, confirm delete, proposal submit) uses the modal pattern.

**Fix:** Replace `window.prompt()` with an expand-in-place resolution notes field inside the issue row, or a small inline modal. See `openBillingRequestModal()` (~line 839) as a reference pattern.

---

## Info

### IN-01 — Journal listeners not re-attached on mid-session status transition

**File:** `app/views/project-detail.js`
**Confidence:** 75%

If a project transitions from a non-journal status (e.g. `Client Approved`) to a journal-visible status (`For Mobilization`) while the user has the detail page open, `lcStartMobilization` triggers `renderProjectDetail()` re-render which now includes the journal panel — but `ensureJournalListeners()` is gated by `if (!journalActivityUnsub)` which was never set. The panel renders with empty state until page reload. Low-impact (requires live status transition while viewing the page).

---

### IN-02 — `firestore.rules` issues subcollection allows full-field update, not just status transitions

**File:** `firestore.rules` ~line 285
**Confidence:** 70%

`allow update: if isActiveUser()` on the `issues` subcollection has no field mask — any active user can overwrite `title`, `created_by_name`, `issue_type`, etc. The stated intent (D-13/D-14) is open↔resolved transitions only. Acceptable for a small-team app; documented for awareness.

---

### IN-03 — Verify PO Delivered auto-entry is present in `procurement.js` (reviewer may have missed it)

**File:** `app/views/procurement.js`
**Confidence:** 60%

The code reviewer noted no `activity_entries` write on PO Delivered in `updatePOStatus`. However, the Plan 05 executor SUMMARY explicitly states the traversal (`PO.mrf_id → MRF.project_name → projects → addDoc activity_entries`) was committed at `f3b58eb`. This may be a reviewer false-negative. Verify during browser UAT that the PO Delivered auto-entry appears in the project feed.
