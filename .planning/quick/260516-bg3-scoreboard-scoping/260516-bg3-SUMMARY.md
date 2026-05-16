---
quick_id: 260516-bg3
slug: scoreboard-scoping
status: complete
completed: 2026-05-16
commits:
  - 2c28d15  # T1 — declare cachedAllPOData + reset wiring
  - 713e735  # T2 — scope fresh-fetch scoreboard call in loadPRPORecords
  - 7215c95  # T3 — scope scoreboard refresh in reFilterAndRenderPRPORecords
files_modified:
  - app/views/procurement.js  # +19 lines, -3 lines net
---

# Summary — Phase 91 UAT Bug 3 (PO scoreboard scoping)

## What changed

`updatePOScoreboards` is now called with a PO subset filtered to the MRF set the user can actually see, in both the fresh-fetch path (`loadPRPORecords`) and the assignment-change refresh path (`reFilterAndRenderPRPORecords`). The raw PO snapshot is held in a new module-level `cachedAllPOData` array so the refresh path does not need to round-trip Firestore.

## Files touched

- `app/views/procurement.js` — three edits across three atomic commits (see frontmatter).

## Decisions

- **Set built from `mrf.mrf_id`, not `mrf.id`.** The `.continue-here.md` draft instructed building `visibleMrfIds` from `mrf.id` (Firestore doc ID). That contradicts every PO↔MRF join in this file — lines 915, 3380, 4395, 5313, 5531 all use `where('mrf_id', '==', mrf.mrf_id)`, and the explicit comment at 3369 says `// human ID like "MRF-2026-014"`. Following the draft verbatim would have produced an empty filter result for every PO (Firestore doc IDs do not equal human-readable strings). Corrected before patching; called out in commit body for T2.
- **`loadPOTracking` (procurement.js:7061) left untouched.** That call belongs to the PO Tracking tab which is a separate view with its own listener lifecycle. If it needs scoping that is a separate bug — out of scope per the continue-here.md.
- **No `loadPRPORecords` cache-hit scoreboard call added.** The cache-hit branch (5036–5052) only fires on tab re-entry, when the most recent `updatePOScoreboards` write was already scoped and the DOM is stable. The only state-change path is `assignmentsChanged`, which is covered by T3.
- **PLAN.md said two reset paths (2470 and 2500); actual code has one.** Line 2500 is `allPRPORecords = []` (the working array), not the cache. Single reset at 2470 is sufficient. PLAN.md not updated retroactively — flagged here.

## Behavior change for super_admin

A subtle side-effect: super_admin's `allPRPORecords` contains every MRF, so `visibleMrfIds` is the universe of MRFs. POs with valid `mrf_id` references continue to count. However, **orphan POs (POs whose `mrf_id` references a deleted MRF) will no longer appear in scoreboards** under the new behavior — previously the unscoped call would have counted them. This is arguably more correct (orphan POs are stale data), but it is a behavior change beyond the literal bug report. Worth confirming during UAT step 4.

## UAT (deferred to human, per CLAUDE.md "No staging - writes to production Firebase")

Run `python -m http.server 8000` and verify:

1. Log in as `operations_user` with assignments to a subset of projects → MRF Records tab → scoreboard counts reflect only POs tied to MRFs in their assigned projects.
2. Log in as `services_user` with service-code assignments → same expectation against `mrf.service_code`.
3. While on the MRF Records tab, change assignments via admin (triggers `assignmentsChanged`). Confirm scoreboard refreshes without a page reload.
4. Log in as `super_admin` → scoreboard counts match the previous baseline, modulo any orphan POs that drop off (see "Behavior change for super_admin" above).

## Outstanding

None for Bug 3 itself. Open items for the wider Phase 91 UAT cycle:

- Once UAT 1–4 pass, mark Phase 91 UAT closed and consider `/gsd-complete-milestone` for v3.3 → main merge.
- The four untracked files (Phase 86.9 debug leftovers) still need triage independent of this work.
