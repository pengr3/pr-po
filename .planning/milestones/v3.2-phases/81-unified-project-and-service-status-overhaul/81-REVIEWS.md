---
phase: 81
reviewers: [gemini]
reviewed_at: 2026-04-27T00:00:00Z
plans_reviewed: [81-01-PLAN.md, 81-02-PLAN.md, 81-03-PLAN.md, 81-04-PLAN.md]
note: Claude (current runtime) skipped for independence. Codex not installed.
---

# Cross-AI Plan Review — Phase 81

## Gemini Review

### 1. Summary

The plan is highly cohesive and demonstrates a deep understanding of the project's "zero-build SPA" constraints. By choosing a read-time fallback strategy (D-03) instead of a destructive migration, the plan significantly reduces the risk of data loss and downtime. The parallelization of Project and Service migrations is efficient, and the consolidation of the dashboard charts aligns well with the architectural goal of simplifying the status workflow. The strategy is pragmatic, surgical, and prioritizes UI/UX clarity for the end-user during the transition period.

### 2. Strengths

- **Strategic Legacy Handling:** The `(legacy)` grey italic fallback is an excellent "soft-migration" pattern that guides users to update data without requiring complex backend scripts.
- **Field Reuse:** Using the existing `project_status` field (D-01) prevents schema bloat and maintains compatibility with existing Firestore indexes.
- **Surgical Deletion:** Explicitly removing `internal_status` from forms/filters while leaving it as an orphaned field in the DB is the safest approach for a production system where historical data integrity is paramount.
- **Unified Validation:** Updating validation logic concurrently with the UI changes ensures that new data adheres to the 10-status constraint immediately.
- **Structured UAT:** The inclusion of a dedicated Wave 2 blocking gate with 11 specific checks ensures that cross-cutting changes (like CSV exports and chart rendering) are verified before finality.

### 3. Concerns

- **Chart Crowding [MEDIUM]:** Reusing the `hs-chart-project` CSS class for 10 bars instead of 7 may lead to label overlapping or extremely thin bars on smaller laptop screens or mobile devices. The horizontal axis might become unreadable if the labels are long (e.g., "Proposal Under Client Review").
- **Legacy Filtering [MEDIUM]:** If the "Status" filter dropdown only contains the 10 new options, users may find it difficult to locate "Legacy" projects to update them. If a project has a legacy status, it might disappear from filtered views unless "Legacy" is an available filter option or the filter is cleared.
- **Edit History Context [LOW]:** While renaming `project_status` to "Status" is correct, letting `internal_status` fall through to the raw key in `edit-history.js` might look unprofessional (e.g., showing `internal_status` instead of a user-friendly label like "Old Internal Status").
- **Stale Dashboard Cache [LOW]:** If the home dashboard uses a `cachedStats` object in memory, the transition from 8 keys to 3 keys might result in "ghost" data or NaN values if the UI expects the new structure but finds the old one after a hot reload.

### 4. Suggestions

- **Dynamic Filter Injection:** In `applyFilters` (projects.js/services.js), consider logic that checks if the current record's status exists in the new 10-option list. If not, temporarily inject that legacy value into the filter dropdown so users can "filter by legacy" to perform bulk updates.
- **Chart Label Rotation:** In `home.js`, if using Chart.js or a custom CSS grid, consider rotating labels 45 degrees or using a horizontal bar chart if 10 vertical bars become too cramped.
- **History Label Mapping:** In `edit-history.js`, even if `internal_status` is being retired, add a simple mapping: `field === 'internal_status' ? 'Internal Status (Legacy)' : label`. This provides better context for auditors looking at old records.
- **Cache Busting:** Ensure the `home.js` logic for calculating stats includes a way to ignore or overwrite the old 8-key structure in `cachedStats` to prevent rendering errors during the first load after deployment.

### 5. Risk Assessment: LOW

The overall risk is **LOW**. The decision to avoid a database migration script removes the most common point of failure for this type of overhaul. The primary risks are aesthetic (chart layout) and functional (filtering legacy records), both of which are easily reversible or adjustable without data loss. The plan's reliance on "read-time fallback" makes it exceptionally robust against deployment failures.

---

## Consensus Summary

*Single reviewer — no divergent views to reconcile. Summary reflects Gemini's findings.*

### Agreed Strengths

- Read-time fallback `(legacy)` pattern is the right call for a production system — avoids migration risk entirely
- Surgical orphaning of `internal_status` (no deleteField) is safe and reversible
- Automated grep verification in Plans 81-01/02/03 is a solid correctness gate
- Wave 2 UAT blocking checkpoint (Plan 81-04) correctly depends on all Wave 1 plans completing first

### Key Concerns to Watch (Gemini)

1. **[MEDIUM] Chart crowding** — 10 bars in `hs-chart-project` sized for 7 may clip labels, especially "Proposal Under Client Review" on mobile/1366px. UAT Check 9 should specifically verify label readability at 1366×768.
2. **[MEDIUM] Legacy records invisible in filtered views** — a project with a legacy `project_status` value (e.g. "Approved by Client") will never match any of the 10 new filter options, making it unfindable via the Status filter until the user clears the filter. Consider whether a "Legacy" catch-all filter option is worth adding.
3. **[LOW] `internal_status` raw key in edit history** — acceptable per D-04 but worth noting for future cleanup.
4. **[LOW] cachedStats key shape change** — `home.js` in-memory object goes from 8 keys to 3; first render after deployment should initialize to null without reading stale keys. Plan 81-03 already handles this (new cachedStats object literal), but should verify on first load.

### Divergent Views

None — single reviewer.
