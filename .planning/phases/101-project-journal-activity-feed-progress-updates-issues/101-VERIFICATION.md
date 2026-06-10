---
phase: 101-project-journal-activity-feed-progress-updates-issues
verified: 2026-06-10T08:30:00Z
status: passed
score: 15/15 must-haves verified
human_uat: passed 2026-06-10
overrides_applied: 0
human_verification:
  - test: "Confirm Firestore rules are deployed to the production project (clmc-procurement), not just clmc-procurement-dev"
    expected: "firebase deploy --only firestore:rules against the default (clmc-procurement) project succeeds, or confirmation that the rules are live in production Firestore"
    why_human: "101-02-SUMMARY.md states 'deployed to clmc-procurement-dev' but 101-02-PLAN.md Task 2 explicitly states the active CLI project IS production (clmc-procurement). Cannot programmatically query which Firebase project received the deployed rules. Until confirmed, all journal writes in production will fail with Missing or insufficient permissions."
  - test: "Browser UAT — journal panel visibility gate: open a For Mobilization or On-going project; verify 3-tab panel appears below the Info+Financial+Plan row"
    expected: "Panel renders with Activity Feed / Progress Updates / Issues tabs; tab bar is visible; Feed composer (tag select + textarea + Post button) is present"
    why_human: "Zero-build SPA — no automated DOM testing available"
  - test: "Browser UAT — journal panel hidden for pre-execution statuses: open a For Inspection or For Proposal project"
    expected: "No journal panel appears on the page"
    why_human: "CSS class hiding vs DOM injection cannot be verified without rendering"
  - test: "Browser UAT — Completed project read-only: open a Completed project"
    expected: "Panel renders but feed composer, progress form, and issue form are all absent; resolve/reopen buttons absent; history entries visible"
    why_human: "Visual confirmation of read-only mode"
  - test: "Browser UAT — post an Activity Feed entry: pick a tag type, type a note, click Post"
    expected: "Entry appears optimistically immediately; persists after page reload; correct tag pill and author name shown"
    why_human: "Optimistic update + Firestore persistence requires live browser session"
  - test: "Browser UAT — submit a Progress Update: fill pct, summary, blockers, next milestone; click Submit Update"
    expected: "Entry appears in history list newest-first; persists after reload; pct badge visible"
    why_human: "CSS class mismatches (WR-01/02/03) may affect visual rendering of the progress card — needs browser confirmation"
  - test: "Browser UAT — log an issue, resolve it with notes, verify the resolve system entry appears in Activity Feed"
    expected: "Issue appears as Open; after Resolve (with prompt notes) issue badge flips to Resolved; a system entry 'Issue #N ... resolved by ...' appears in the Activity Feed tab"
    why_human: "window.prompt() behavior (WR-07) needs live browser test — if blocked by browser settings, resolve flow silently fails"
  - test: "Browser UAT — re-open a resolved issue"
    expected: "Issue flips back to Open; resolution notes cleared; a system entry 're-opened by ...' appears in the Feed"
    why_human: "Requires browser session with existing resolved issue"
  - test: "Browser UAT — advance a project through a lifecycle gate (e.g., Start Project) and confirm auto Feed entry"
    expected: "System entry 'Project started by [name]' appears in the Activity Feed"
    why_human: "Gate function integration with live Firestore"
  - test: "Browser UAT — CSS class mismatches WR-01 through WR-05: confirm visual rendering of progress cards and issue rows"
    expected: "If the CSS class mismatches found by code review (WR-01: journal-pct-badge vs journal-progress-pct-badge; WR-02: journal-entry-meta-text vs journal-entry-meta; WR-03: journal-progress-field/journal-progress-label absent from CSS; WR-04: journal-issue-desc vs journal-issue-description; WR-05: journal-issue-seq/journal-issue-list/journal-progress-history absent from CSS) cause visible rendering regressions, they must be fixed before the phase can close"
    why_human: "CSS rendering requires browser — five classes referenced in JS have no matching rule in CSS (confirmed via grep)"
---

# Phase 101: Project Journal Verification Report

**Phase Goal:** Ship the Project Journal — a 3-tab panel (Activity Feed / Progress Updates / Issues) embedded in the project detail view for execution-phase projects, with real-time listeners, auto-system entries on lifecycle gate transitions and cost edits, and Firestore subcollection rules deployed.
**Verified:** 2026-06-10T08:30:00Z
**Status:** human_needed — automated checks pass; production deploy confirmation required + browser UAT for CSS regressions
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 3-tab Journal panel renders with tab bar (Activity / Progress / Issues) and active-tab visual state | VERIFIED | `_buildJournalPanelHtml` in project-detail.js lines 2417–2475; `.journal-tab-btn.active` CSS at views.css line 3936 |
| 2 | Feed composer, progress form, issue punch list, filter chips, and resolution badges have dedicated CSS | VERIFIED | views.css lines 3892–4383 — all required selectors present and substantive |
| 3 | Read-only mode hides composer/forms via CSS hook | VERIFIED | views.css lines 3374–3380: `.project-journal-panel--readonly .journal-composer` → `display: none`; applied in `_buildJournalPanelHtml` via `project-journal-panel--readonly` class on Completed |
| 4 | activity_entries and progress_updates are create-only for any active user; delete is admin-only | VERIFIED | firestore.rules lines 273–278 (activity_entries) and 283–288 (progress_updates): `allow create: if isActiveUser(); allow update: if false; allow delete: if hasRole(['super_admin', 'operations_admin'])` |
| 5 | issues subcollection allows create and update (open↔resolved) for any active user; delete is admin-only | VERIFIED | firestore.rules lines 293–298: `allow create: if isActiveUser(); allow update: if isActiveUser(); allow delete: if hasRole(['super_admin', 'operations_admin'])` |
| 6 | All three subcollections allow read for any active user | VERIFIED | firestore.rules lines 274, 284, 294: `allow read: if isActiveUser()` on all three blocks |
| 7 | Firestore rules deployed to the live Firebase project | UNCERTAIN | 101-02-SUMMARY.md says "deployed to clmc-procurement-dev" but 101-02-PLAN.md Task 2 says "The CLI's active project is PRODUCTION (clmc-procurement)". .firebaserc shows default=clmc-procurement, dev=clmc-procurement-dev. Production deploy unconfirmed. |
| 8 | Panel is visible for For Mobilization/On-going/Completed and hidden for all other statuses | VERIFIED | `JOURNAL_VISIBLE_STATUSES = ['For Mobilization', 'On-going', 'Completed']` at line 2412; `_buildJournalPanelHtml` returns `''` when status not in list (line 2419); `ensureJournalListeners()` gated by same list at lines 223, 273 |
| 9 | Three real-time listeners (activity/progress/issues) attach on init and tear down in destroy() | VERIFIED | `ensureJournalListeners` lines 2863–2913; `journalActivityUnsub`/`journalProgressUnsub`/`journalIssuesUnsub` all null-checked and called in destroy() at lines 408–418; all use `orderBy('created_at','desc'), limit(50)` |
| 10 | User can post Activity Feed entries (tag type, text, Post button) with optimistic update and persistence | VERIFIED | `postActivityEntry` lines 2531–2558; `journalActivityEntries.unshift({id:'_optimistic',...})` at line 2540; `await _addActivityEntry(...)` at line 2552 |
| 11 | User can submit Progress Updates, log Issues, filter issues, resolve with required notes, and re-open | VERIFIED | `submitProgressUpdate` lines 2632–2667; `submitNewIssue` lines 2770–2803; `setIssueFilter` lines 2764–2767; `resolveIssue` lines 2806–2833 (window.prompt + updateDoc + _addActivityEntry); `reopenIssue` lines 2836–2857 |
| 12 | Each of the 4 Phase 100 lifecycle gate transitions auto-posts a system Feed entry | VERIFIED | `lcAdvanceToForProposal` line 3064; `lcStartMobilization` line 3076; `lcStartProject` line 3087; `lcMarkProjectComplete` line 3099 — each calls `await _addActivityEntry(projectId, {type:'system', is_system:true, text:'...'})` inside existing try block after `addProjectAuditEntry` |
| 13 | contract_cost or budget edit auto-posts a system Feed entry with before/after delta | VERIFIED | project-detail.js lines 1331–1337: fire-and-forget `_addActivityEntry(currentProject.id, {type:'system', is_system:true, text:'${fieldLabel} changed: ${oldDisplay} → ${newDisplay} by ...'})` placed OUTSIDE `if (recipients.length > 0)` guard at line 1331 (after notification block closes at line 1330) |
| 14 | PO Delivered (non-subcon) auto-posts a system Feed entry via mrf_id→project_name→projects traversal | VERIFIED | procurement.js lines 7962–7992: separate try/catch; traversal `poDataFresh.mrf_id → mrfs query → project_name → projects query → projectDocId → addDoc activity_entries`; guards on `mrf_id`, `mrfSnap.empty`, `projectName`, `projSnap.empty`; no `d.project_id` usage |
| 15 | All journal write surfaces (composer, progress form, issue form, resolve/reopen) are hidden in Completed (read-only) projects | VERIFIED | `isReadOnly = project.project_status === 'Completed'` in `_buildJournalPanelHtml` line 2421; composer omitted when `isReadOnly` (line 2435); `_buildProgressTabHtml` omits form when `isReadOnly` (line 2603); `_buildIssuesTabHtml` omits form when `isReadOnly` (line 2737); `_renderIssueRow` omits action buttons when `isReadOnly` (line 2710); CSS `.project-journal-panel--readonly` provides defense-in-depth |

**Score:** 14/15 truths verified (1 UNCERTAIN due to production deploy ambiguity)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `styles/views.css` | Project Journal panel CSS block (tab bar, Feed composer, progress form, issue list, filter chips, badges) | VERIFIED | Lines 3892–4383; all 14 plan-required selectors confirmed present; braces balanced |
| `firestore.rules` | Three Phase 101 subcollection rule blocks inside match /projects/{projectId} | VERIFIED | Lines 269–298; all three blocks present with correct permissions |
| `app/views/project-detail.js` | Journal panel render + listeners + tab switching + Activity Feed composer/CRUD | VERIFIED | 9 new functions; substantive implementations; no stubs |
| `app/views/project-detail.js` | `function _addActivityEntry` — shared write primitive | VERIFIED | Lines 2564–2578; `addDoc(collection(db, 'projects', projectId, 'activity_entries'), {...created_at: serverTimestamp()})` |
| `app/views/project-detail.js` | Progress Updates tab + Issues tab (filter chips, log form, resolve/reopen workflow) | VERIFIED | `_buildProgressTabHtml`, `_buildIssuesTabHtml`, `resolveIssue`, `reopenIssue` all substantive |
| `app/views/project-detail.js` | Auto-entry calls in 4 gate functions + saveField cost-delta block | VERIFIED | 4 gate functions each contain `_addActivityEntry` after `addProjectAuditEntry`; saveField cost block is fire-and-forget |
| `app/views/procurement.js` | PO Delivered auto-entry write to projects/{id}/activity_entries via mrf_id→project_name→projects traversal | VERIFIED | Lines 7962–7992; traversal confirmed; no `d.project_id` guard |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `styles/views.css .journal-tab-btn.active` | `project-detail.js switchJournalTab DOM toggle` | `classList.toggle('active')` | VERIFIED | `switchJournalTab` at lines 2517–2525: `btn.classList.toggle('active', t === tab)` |
| `project-detail.js renderProjectDetail()` | `#projectJournalPanel (Plan 01 CSS)` | `_buildJournalPanelHtml injected after #projectDetailBottomRow` | VERIFIED | Line 716: `${_buildJournalPanelHtml(currentProject)}` between `#projectDetailBottomRow` closing div and Delete button block |
| `project-detail.js ensureJournalListeners()` | `projects/{id}/activity_entries onSnapshot` | `query(collection(...), orderBy('created_at','desc'), limit(50))` | VERIFIED | Lines 2867–2882 |
| `project-detail.js resolveIssue()` | `_addActivityEntry (Plan 03) system entry` | `await _addActivityEntry after updateDoc resolves issue` | VERIFIED | Lines 2819–2826: `await _addActivityEntry(currentProject.id, {type:'system', is_system:true, text:...})` after `updateDoc` |
| `project-detail.js saveField cost block` | `_addActivityEntry` | `fire-and-forget .catch()` | VERIFIED | Line 1333: `_addActivityEntry(currentProject.id, {...}).catch(...)` — not awaited |
| `procurement.js Delivered handler` | `projects/{resolved project doc id}/activity_entries` | `PO.mrf_id → mrfs query → MRF.project_name → projects query → addDoc is_system:true` | VERIFIED | Lines 7965–7992; traversal confirmed |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `_buildJournalPanelHtml` / Feed list | `journalActivityEntries` | `onSnapshot` in `ensureJournalListeners()` → `activity_entries` subcollection | Yes — real Firestore query | FLOWING |
| `_buildProgressTabHtml` / history list | `journalProgressUpdates` | `onSnapshot` in `ensureJournalListeners()` → `progress_updates` subcollection | Yes — real Firestore query | FLOWING |
| `_buildIssuesTabHtml` / punch list | `journalIssues` | `onSnapshot` in `ensureJournalListeners()` → `issues` subcollection | Yes — real Firestore query | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — zero-build static SPA with no runnable entry points accessible without a browser session.

---

## Probe Execution

No probe scripts found in `.planning/` for Phase 101. SKIPPED.

---

## Requirements Coverage

No requirement IDs declared in plan frontmatter (`requirements: []` in all five plans). Phase scope defined by CONTEXT.md D-01..D-20 decisions (locked by spike 032). All D-decisions verified above via truth table.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/views/project-detail.js` | 2591 | `journal-pct-badge` emitted but CSS defines `journal-progress-pct-badge` | Warning | % badge on progress cards renders unstyled (no blue pill, no white text) |
| `app/views/project-detail.js` | 2592 | `journal-entry-meta-text` emitted but CSS defines `journal-entry-meta` | Warning | Progress card meta line (timestamp + author) renders as unstyled body text |
| `app/views/project-detail.js` | 2594–2596 | `journal-progress-field` / `journal-progress-label` emitted but no CSS rule | Warning | Summary/Blockers/Next Milestone labels and field wrappers render unstyled |
| `app/views/project-detail.js` | 2724 | `journal-issue-desc` emitted but CSS defines `journal-issue-description` | Warning | Issue description renders unstyled |
| `app/views/project-detail.js` | 2718 | `journal-issue-seq` emitted but no CSS rule | Warning | Issue "#N" label renders unstyled |
| `app/views/project-detail.js` | 2760 | `journal-issue-list` emitted but no CSS rule | Warning | No gap/spacing between issue cards |
| `app/views/project-detail.js` | 2628 | `journal-progress-history` emitted but no CSS rule | Warning | No top margin between progress form and history list |
| `app/views/project-detail.js` | 2491 (dynamic) | `journal-entry-tag--issue` variant produced when user posts with tag type "issue" but no CSS rule | Warning | "Issue" tag pill renders colorless |
| `app/views/project-detail.js` | 1311–1337 | `_addActivityEntry` fires on budget/contract_cost edits regardless of project_status | Warning | Pre-execution projects (For Proposal, Client Approved, etc.) accumulate cost-change entries in Firestore; they silently appear in the Feed when the project later advances to For Mobilization with old timestamps |
| `app/views/project-detail.js` | 2807 | `window.prompt('Resolution notes (required):')` — blocked by some browser popup settings; returns null silently when blocked | Warning | Issue resolution fails silently with no user feedback when prompt is blocked; contradicts project's modal UX pattern |

**Debt marker scan:** No TBD/FIXME/XXX markers found in the Phase 101-modified files. No blockers from debt markers.

None of the anti-patterns above are BLOCKERS for the goal — they are visual regressions (WR-01 through WR-05) or behavioral edge cases (WR-06, WR-07) that degrade UX but do not prevent the core feature from functioning.

---

## Human Verification Required

### 1. Production Firestore Rules Deploy Confirmation

**Test:** Run `firebase deploy --only firestore:rules` against the production project, or confirm via Firebase Console that the rules in `firestore.rules` are live on `clmc-procurement`.
**Expected:** Deploy succeeds with no compile errors; the three new subcollection blocks (`activity_entries`, `progress_updates`, `issues`) are active in the production Firestore.
**Why human:** The 101-02-SUMMARY.md states "Rules deployed to clmc-procurement-dev" but the PLAN Task 2 explicitly states "The CLI's active project is PRODUCTION (clmc-procurement)". The `.firebaserc` shows `default=clmc-procurement` and `dev=clmc-procurement-dev`. If the deploy ran against dev only, all journal writes in production will fail with "Missing or insufficient permissions" even for Super Admin. This is the highest-priority check.

### 2. Journal Panel Visibility and Tab Navigation

**Test:** Open a For Mobilization or On-going project. Scroll to the bottom of the detail page.
**Expected:** A "Project Journal" panel appears below the Info+Financial+Plan row, with three tabs (Activity Feed / Progress Updates / Issues). Clicking each tab shows its content and the active tab has a blue underline. Panel is absent on For Inspection, For Proposal, and Loss projects.
**Why human:** Zero-build SPA — DOM rendering requires browser.

### 3. Activity Feed Posting (Optimistic + Persistence)

**Test:** On an active project, select a tag type (e.g., "Update"), type a note, click Post.
**Expected:** Entry appears immediately (optimistic); after page reload the entry persists; author name and timestamp shown; tag pill visible.
**Why human:** Requires live Firestore session.

### 4. Progress Update Submission and History

**Test:** On an active project, go to Progress Updates tab, fill in % complete + summary, submit.
**Expected:** Entry appears in history list newest-first with pct displayed. Check whether the pct badge renders styled (WR-01 concern: `journal-pct-badge` vs `journal-progress-pct-badge`).
**Why human:** CSS mismatch WR-01 may cause visual regression; browser needed to confirm.

### 5. Issue Lifecycle (Log, Filter, Resolve with Notes, Re-open)

**Test:** Log an issue (type + title + description). Filter by Open. Click Resolve — note whether browser's popup prompt appears. If it does, enter notes; if blocked, report the failure. Check that the Feed tab shows a system entry. Re-open the issue.
**Expected:** Issue logged as Open; filter chips narrow the list; Resolve prompts for notes (if browser allows prompts) and blocks empty submission; after resolving, issue shows Resolved badge, resolution notes visible, system Feed entry appears; Re-open clears resolution and posts another system entry.
**Why human:** `window.prompt()` behavior (WR-07) varies by browser and security settings; requires live test to confirm or deny.

### 6. Lifecycle Gate Auto-Entry (e.g., Start Project)

**Test:** On a For Mobilization project, trigger "Start Project" gate. Check the Activity Feed tab.
**Expected:** System entry "Project started by [your name]" appears in the Feed.
**Why human:** Requires live Firestore session and a project at the right status.

### 7. CSS Class Mismatch Impact Assessment (WR-01 through WR-05)

**Test:** Open the Progress Updates and Issues tabs in a browser with DevTools. Check whether the following elements render styled:
- Progress card pct badge (WR-01)
- Progress card meta line — small grey timestamp+author (WR-02)
- Progress field labels Summary/Blockers/Next Milestone (WR-03)
- Issue description text (WR-04)
- Issue "#N" sequence label, issue list spacing, progress history spacing (WR-05)

**Expected:** All elements should render with correct visual styling per the Phase 101 design. If any render unstyled, the corresponding CSS rule must be added to `styles/views.css` before the phase can close.
**Why human:** CSS rendering requires browser; grep confirmed the mismatches but visual impact degree (tolerable vs. severely broken) requires human judgment.

---

## Gaps Summary

No BLOCKER gaps found. The core feature is implemented and wired. The following items require human resolution before the phase can be marked passed:

1. **Production deploy confirmation (UNCERTAIN — highest priority):** The SUMMARY says rules were deployed to `clmc-procurement-dev`. The PLAN says production. If production is not deployed, all journal writes fail in production. Requires one `firebase deploy --only firestore:rules` command or Firebase Console confirmation.

2. **CSS class mismatches (WR-01 through WR-05, WARNING):** 5 class names used in JS have no matching CSS rule. These are visual regressions on progress cards and issue rows. Must be assessed in browser; if visually broken, fixes are small (add ~5 CSS rules to the journal block or rename the JS-emitted class).

3. **window.prompt UX concern (WR-07, WARNING):** Issue resolution uses `window.prompt()` which contradicts the project's modal pattern and can be blocked by browser settings. Functional for most users but may silently fail in hardened browser environments. Flagged for decision: accept as-is or convert to inline modal.

---

_Verified: 2026-06-10T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
