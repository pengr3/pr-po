# Phase 38: Code Quality & DRY Cleanup - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Close code tech debt across the codebase: extract duplicate helper functions to shared modules, fix procurement scoreboard global totals, remove dead code, fix hardcoded approver names, correct mislabeled section headers, and optimize code where opportunities arise. This is a comprehensive cleanup pass — not adding new features.

</domain>

<decisions>
## Implementation Decisions

### Shared Module Placement
- HTML/UI generators (getMRFLabel, getDeptBadgeHTML, etc.) go to **components.js**
- Data/logic helpers go to **utils.js** — split by type
- **Full audit across ALL view files** (not just finance.js + procurement.js) for duplicate functions
- Old duplicate definitions **removed completely** — no thin wrappers, update all call sites to import from shared module
- **Consolidate duplicate CSS** alongside JS extraction — move shared styles to components.css
- Let the audit discover duplicates; no specific known duplicates beyond getMRFLabel/getDeptBadgeHTML

### Claude's Discretion: Export Style
- Claude decides per function whether to use ES6 exports + window, or window only, based on how each function is actually called

### Scoreboard Calculation Fix
- Procurement PO Tracking scoreboard shows **global totals only** — no filtered counts
- **Silently global** — no labels or indicators when department filter is active
- Users expect scoreboards to always show full picture

### Claude's Discretion: Scoreboard Implementation
- Claude picks the cleanest approach (calculate before filter vs separate data source) based on current code structure
- Claude checks if other views have the same filter-leaking-into-totals issue and fixes if found

### Dynamic Approver Name
- Use **current logged-in user's display name** as approver
- Fallback: **use email address** if display name unavailable
- **Store on document**: write `approved_by_name` AND `approved_by_uid` fields to Firestore for audit trail
- **Audit ALL approval flows** for hardcoded names (not just TR approval)

### Dead Code Removal
- **Full sweep across ALL view files** for unreachable functions, unused imports, orphaned code
- **Remove dead CSS** rules that no longer have matching HTML
- **Remove commented-out code blocks** — git has the history
- **Audit all user-facing labels/headers** for accuracy (not just the PR-PO Records fix)

### Claude's Discretion: Logging
- Claude keeps meaningful prefixed logs ([Router], [Procurement], etc.) and removes raw debug console.log() noise

### Code Optimization
- General optimization as opportunities arise during cleanup — no specific performance concerns reported
- **Include Firestore audit**: check for redundant reads, listeners that could be getDocs, missing composite indexes

</decisions>

<specifics>
## Specific Ideas

- User wants to "optimize our code in this phase" — take optimization opportunities wherever found during the sweep
- Comprehensive pass: JS deduplication + CSS consolidation + dead code removal + Firestore optimization + label audit
- This is the last phase of v2.3 — make the codebase clean for the next milestone

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 38-code-quality-dry-cleanup*
*Context gathered: 2026-02-24*
