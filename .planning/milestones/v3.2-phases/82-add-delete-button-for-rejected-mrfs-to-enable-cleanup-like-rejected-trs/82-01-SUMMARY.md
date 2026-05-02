---
phase: 82-add-delete-button-for-rejected-mrfs-to-enable-cleanup-like-rejected-trs
plan: 01
subsystem: ui
tags: [procurement, mrf, soft-delete, cascade, firestore, window-functions]

# Dependency graph
requires:
  - phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error
    provides: "soft-reject terminal status === 'Rejected' that Phase 82 keys eligibility off"
  - phase: 70
    provides: "rejected-MRF left-panel grouping context"
provides:
  - "deleteRejectedMRF() — lightweight cascade delete for soft-rejected MRFs in MRF Processing"
  - "Dual-site Delete MRF button render (renderMRFDetails + updateActionButtons) gated on status === 'Rejected'"
  - "window.deleteRejectedMRF registration + destroy cleanup"
affects: ["MRF Processing", "rejected MRFs cleanup", "future MRF cleanup phases"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-site button render pattern (initial-render + re-render mirror) for action-buttons that survive innerHTML rewrites"
    - "Lightweight cascade delete: count-children → counted-confirm → children-first deleteDoc loop → MRF doc delete → UI reset"

key-files:
  created: []
  modified:
    - "app/views/procurement.js — +123 lines, 0 deletions; new deleteRejectedMRF function + dual-site button render + window registration + destroy cleanup"

key-decisions:
  - "D-01 lightweight pattern enforced: single confirm() with cascade counts, NO reason prompt, NO deleted_mrfs audit row"
  - "D-02 single discoverable location: button only in MRF Processing details panel; not added to mrf-records.js or mrf-form.js"
  - "D-03 strict eligibility: only literal status === 'Rejected'; PR Rejected / TR Rejected / Finance Rejected explicitly excluded from gate"
  - "D-04 permission gate: window.canEditTab?.('procurement') === false → toast + return"
  - "D-05 children-first cascade ordering: prs → pos → transport_requests → mrfs (MRF deleted last so partial child failure leaves MRF in place for retry)"
  - "Dual-site render required: site #1 (renderMRFDetails) handles initial render, site #2 (updateActionButtons) handles re-renders triggered by category changes / line-item adds / saves which unconditionally rewrite mrfActionsEl.innerHTML"
  - "Legacy deleteMRF() at line 3913 (was 3790, shifted +123) is byte-for-byte unchanged — left as dead-but-correct code per CONTEXT.md scope boundary"

patterns-established:
  - "Cleanup-companion to soft-reject: when a phase introduces soft-rejection (Phase 62), a paired cleanup phase reintroduces a routine deletion path scoped strictly to the terminal soft-rejected status"
  - "Dual-site button render: any button whose visibility is data-driven AND whose container is rewritten by a re-render path MUST be appended at BOTH the initial render site and the re-render site, gated by the same eligibility expression evaluated against the appropriate scope (parameter vs module-level)"

requirements-completed: []  # No formal REQ-IDs assigned to Phase 82 in REQUIREMENTS.md per plan frontmatter

# Metrics
duration: 3min
completed: 2026-04-28
---

# Phase 82 Plan 01: Add Delete Button for Rejected MRFs Summary

**Lightweight cascade-delete cleanup path for soft-rejected MRFs in MRF Processing, mirroring the existing Delete TR pattern; dual-site button render survives line-item interactions; legacy deleteMRF() left untouched.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-28T03:40:18Z
- **Completed:** 2026-04-28T03:43:18Z
- **Tasks:** 3 of 3
- **Files modified:** 1 (`app/views/procurement.js`)

## Accomplishments

- New `async function deleteRejectedMRF(mrfDocId)` at `app/views/procurement.js:2902` — permission gate + status gate + child-count query + counted-confirm dialog + children-first cascade + MRF delete + post-delete UI reset
- Conditional `🗑️ Delete MRF` button rendered at BOTH render sites in MRF Processing details panel — survives every line-item edit / category change / save
- `window.deleteRejectedMRF` registered in `attachWindowFunctions()` and cleaned up in `destroy()`, mirroring the `deleteRejectedTR` lifecycle exactly
- Phase 62's soft-reject pile-up now has a cleanup path; legacy `deleteMRF()` deliberately preserved as dead code for potential future audit-row reintroduction

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement `deleteRejectedMRF()` function with cascade + permission gate + counted-confirm dialog** — `89d24e9` (feat)
2. **Task 2: Add Delete MRF button render to BOTH renderMRFDetails AND updateActionButtons for status === 'Rejected'** — `5536cad` (feat)
3. **Task 3: Register `window.deleteRejectedMRF` in attachWindowFunctions and clean up in destroy()** — `dfa883e` (feat)

**Plan metadata:** _(pending — final docs commit)_

## Exact Line Numbers (per plan output spec)

Final state of `app/views/procurement.js` (post-Task 3):

| Artifact                                  | Line(s)        |
| ----------------------------------------- | -------------- |
| `async function deleteRejectedMRF(...)`   | 2902–2992      |
| Site #1 — `renderMRFDetails` button render | 3100–3102 (gate at 3100, button at 3101) |
| Site #2 — `updateActionButtons` button render | 3448–3450 (gate at 3448, button at 3449) |
| `window.deleteRejectedMRF = deleteRejectedMRF;` (registration) | 1618 |
| `delete window.deleteRejectedMRF;` (destroy cleanup) | 2163 |
| Legacy `async function deleteMRF()` (UNCHANGED) | 3913 (was 3790; shifted +123 by insertions only) |

## Files Created/Modified

- `app/views/procurement.js` — +123 lines / -0 lines across 3 commits. Single file change; no new imports required (all of `db`, `collection`, `getDocs`, `query`, `where`, `doc`, `deleteDoc`, `showToast`, `showLoading` already imported on lines 7–8).

## Decisions Made

All 5 decisions from `82-CONTEXT.md` were honored verbatim:

- **D-01 (lightweight semantics):** single `confirm()` with cascade counts; verified zero `addDoc`, zero `prompt(`, zero `deleted_mrfs` references inside `deleteRejectedMRF` body via grep.
- **D-02 (location):** verified zero occurrences of `deleteRejectedMRF` in `app/views/mrf-records.js` and `app/views/mrf-form.js`.
- **D-03 (eligibility):** both render sites and the function's own status guard use `=== 'Rejected'` exact match. PR Rejected / TR Rejected / Finance Rejected occurrences in the file are unchanged from baseline at the gate level (the +1 'PR Rejected' delta is in an explanatory comment string, not in any eligibility expression).
- **D-04 (permission gate):** `canEditTab?.('procurement')` count rose from 19 to 20 (+1 for the new function), confirming the gate copy.
- **D-05 (cascade ordering):** verified children-first loop order in code (prs → pos → transport_requests → mrfs) — partial-failure recovery semantics preserved.

Implementation choices (Claude's discretion per CONTEXT.md):

- **Button label:** `🗑️ Delete MRF` (trash-can emoji + plain text) — consistent with neighbouring button visual hierarchy (`💾 Save`, `📄 Generate PR`, `&#10005; Reject MRF`).
- **Button styling:** `class="btn btn-danger"` — matches existing Delete TR pattern.
- **Loading wrapper:** added `showLoading(true/false)` around the cascade since count-then-cascade can hit 6 sequential Firestore round-trips for a multi-PR MRF.
- **No manual cache splice:** relied on the `mrfs` `onSnapshot` listener to refresh `cachedAllMRFs` and re-render the left panel (per plan note — `cachedRejectedTRs` is the only cache that needs synchronous splicing because it has no listener).

## Deviations from Plan

None — plan executed exactly as written. The plan's pre-shift line-number references in comments (e.g. `procurement.js:2993`, `~line 3331`) were intentionally preserved verbatim per the plan's instructions; the post-Task-1 line numbers (rendered above in the Exact Line Numbers table) are higher because of the +100-line `deleteRejectedMRF` insertion. Comment line-number references are descriptive, not load-bearing.

## Issues Encountered

None.

## Firestore Security Rules

**No new Firestore Security Rules required.** `deleteDoc` on `mrfs` / `prs` / `pos` / `transport_requests` is already permitted for the `procurement` role per the project's existing security-rules baseline (CLAUDE.md). The legacy `deleteMRF()` function uses the same `deleteDoc` pattern against the same four collections without any rule changes — Phase 82 inherits that authorization surface unchanged.

## Regression Verification

| Check                                                       | Expected | Actual |
| ----------------------------------------------------------- | -------- | ------ |
| `^async function deleteMRF()` in procurement.js             | 1        | 1 (line 3913) |
| `deletion_reason` references                                | ≥ 1      | 1 (legacy intact) |
| `addDoc(deletedMrfsRef` references                          | ≥ 1      | 1 (legacy intact) |
| `window.rejectMRF()` references (baseline 2)                | unchanged | 2 |
| `git diff HEAD~3..HEAD` deletion lines                      | 0        | 0 (insertions only across all 3 commits) |
| `deleteRejectedMRF` references in `app/views/mrf-records.js` | 0        | 0 (D-02) |
| `deleteRejectedMRF` references in `app/views/mrf-form.js`   | 0        | 0 (D-02) |
| `onclick="window.deleteRejectedMRF` occurrences             | 2        | 2 (both render sites) |
| `🗑️ Delete MRF` occurrences                                | 2        | 2 (both render sites) |
| `window.deleteRejectedMRF = deleteRejectedMRF`              | 1        | 1 (line 1618) |
| `delete window.deleteRejectedMRF;`                          | 1        | 1 (line 2163) |
| Total `window.deleteRejectedMRF` occurrences                | 4        | 4 (1 reg + 1 destroy + 2 onclicks) |

## User Setup Required

None — no external service configuration required. The feature is reachable immediately after deploy: any procurement-role user opening MRF Processing and selecting a soft-rejected MRF (status === 'Rejected') will see the new `🗑️ Delete MRF` button alongside Save / Reject MRF.

## Next Phase Readiness

- v3.2 cleanup story complete for soft-rejected MRFs. Pending follow-ups remain in `82-CONTEXT.md` deferred section: PR/TR/Finance Rejected cleanup, audit/recovery via `deleted_mrfs` re-introduction, MRF Records right-click integration, requestor self-cleanup in My Requests, removal of legacy `deleteMRF()`, bulk-delete UX.
- No blockers carried forward.

## Self-Check: PASSED

- File exists: `app/views/procurement.js` (modified) — FOUND
- Commit `89d24e9` exists — FOUND
- Commit `5536cad` exists — FOUND
- Commit `dfa883e` exists — FOUND
- All acceptance criteria verified via grep counts above

---
*Phase: 82-add-delete-button-for-rejected-mrfs-to-enable-cleanup-like-rejected-trs*
*Completed: 2026-04-28*
