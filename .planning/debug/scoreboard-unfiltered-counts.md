# Root Cause Report — Scoreboards show unfiltered PO counts

## Hypothesis

`updatePOScoreboards` is fed a separate, unfiltered Firestore query over the entire `pos` collection, fetched independently of `allPRPORecords`, so the user-scope filter applied to MRF records has no effect on what the scoreboards display.

## Evidence

| # | File | Line | Observation |
|---|------|------|-------------|
| 1 | `app/views/procurement.js` | 5092 | `cachedAllPRPORecords = [...allPRPORecords]` — the raw MRF snapshot is cached BEFORE scope filtering |
| 2 | `app/views/procurement.js` | 5095–5106 | Project-scope filter (`getAssignedProjectCodes`) and service-scope filter (`getAssignedServiceCodes`) are applied to `allPRPORecords` — the MRF list — immediately after caching |
| 3 | `app/views/procurement.js` | 5108–5114 | A **second, independent** `getDocs(collection(db, 'pos'))` is issued. This fetches the full `pos` collection with no scope filtering whatsoever. Result is stored in local `allPOData` |
| 4 | `app/views/procurement.js` | 5117 | `updatePOScoreboards(allPOData)` — the scoreboards are driven by this completely unfiltered PO array |
| 5 | `app/views/procurement.js` | 5135–5163 | `updatePOScoreboards(pos)` iterates `pos` and buckets every PO by `procurement_status`. It has no knowledge of which MRFs the current user is allowed to see |
| 6 | `app/views/procurement.js` | 7040–7045 | Second call-site: `loadPOTracking()` also calls `updatePOScoreboards(poData)` where `poData` is populated from an `onSnapshot` on the full `pos` collection — again, no user-scope filter |
| 7 | `app/views/procurement.js` | 2787–2803 | `reFilterAndRenderPRPORecords()` (the fast re-filter path on `assignmentsChanged`) correctly re-scopes `allPRPORecords` from `cachedAllPRPORecords` but never calls `updatePOScoreboards` at all, so scoreboards are not refreshed even when assignments change |

## Root Cause

`updatePOScoreboards` operates on raw PO documents fetched directly from Firestore (`pos` collection), completely bypassing the MRF-level user-scope filter. The user-scope filter (`getAssignedProjectCodes` / `getAssignedServiceCodes`) is applied only to `allPRPORecords` (the MRF list). The `pos` collection is queried separately at line 5109–5114 with no equivalent scope constraint, and that unfiltered array is passed directly to `updatePOScoreboards`. There is no linkage between "which POs belong to MRFs the current user can see" and "which POs are counted in the scoreboards."

## Recommended Fix (no code)

The scoreboards should be computed from the POs that are **reachable through the already-scoped `allPRPORecords`**, not from a separate full-collection fetch.

Concretely:

1. After the scope filter has been applied and `allPRPORecords` reflects only the MRFs the user may see, derive the set of visible PO IDs by walking the `_pos` sub-data (or `pr_ids` / `po_ids` fields) already associated with those MRFs — or, simpler, filter `allPOData` to only those POs whose `mrf_id` is present in the scoped `allPRPORecords`.

2. Pass that filtered PO array to `updatePOScoreboards` instead of the raw `allPOData`.

3. Apply the same logic inside `reFilterAndRenderPRPORecords` so that when assignments change and the MRF list is re-scoped, the scoreboards are also recomputed from the newly scoped set (currently that function never calls `updatePOScoreboards` at all).

4. The `loadPOTracking` call-site (line 7045) feeds `poData` from a separate real-time listener and is used for a different tab (PO Tracking), not the MRF Records tab — verify whether scoreboards should even be driven from that path, and if so apply the same scoping logic there.
