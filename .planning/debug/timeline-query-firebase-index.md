---
status: diagnosed
trigger: "Investigate root cause for UAT issue: Timeline query requires Firebase index (Test 9)"
created: 2026-02-06T00:00:00Z
updated: 2026-02-06T00:06:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: POs query (line 4203-4207) combines where('mrf_id') with orderBy('date_issued') requiring composite index
test: Confirmed query structure in loadProcurementTimeline function
expecting: This is the exact query failing - Firebase requires composite index for where + orderBy on different fields
next_action: Verify if other queries (PRs, TRs) also have similar patterns

## Symptoms

expected: Timeline button loads procurement timeline modal without errors
actual: Failed to load procurement timeline with FirebaseError requiring index
errors: "FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/clmc-procurement/firestore..."
reproduction: Click timeline button in procurement view
started: Test 9 of phase 13-finance-dashboard-&-audit-trails
context: Phase 13-03 (Procurement Timeline), file app/views/procurement.js line 4262

## Eliminated

## Evidence

- timestamp: 2026-02-06T00:01:00Z
  checked: procurement.js lines 4203-4207
  found: POs query uses `where('mrf_id', '==', mrfId)` AND `orderBy('date_issued', 'asc')`
  implication: Firebase requires composite index when combining where clause with orderBy on different field

- timestamp: 2026-02-06T00:02:00Z
  checked: procurement.js lines 4185-4191 (PRs query)
  found: PRs query only has `where('mrf_id', '==', mrfId)` - no orderBy
  implication: PRs query does not need composite index

- timestamp: 2026-02-06T00:03:00Z
  checked: procurement.js lines 4194-4200 (TRs query)
  found: TRs query only has `where('mrf_id', '==', mrfId)` - no orderBy
  implication: TRs query does not need composite index

- timestamp: 2026-02-06T00:04:00Z
  checked: firestore.indexes.json
  found: Only contains index for 'users' collection (status + created_at). No index for 'pos' collection with mrf_id + date_issued
  implication: Missing composite index definition for the POs timeline query

- timestamp: 2026-02-06T00:05:00Z
  checked: firebase.json
  found: Points to firestore.indexes.json for index configuration
  implication: Index configuration exists but needs the POs composite index added

## Resolution

root_cause: POs query in loadProcurementTimeline (procurement.js:4203-4207) combines where('mrf_id', '==', mrfId) with orderBy('date_issued', 'asc'). Firebase requires a composite index when filtering on one field and ordering by another field. The firestore.indexes.json file exists but is missing the required composite index definition for the pos collection.

fix: Add composite index to firestore.indexes.json for pos collection with fields: mrf_id (ASCENDING) and date_issued (ASCENDING). Deploy index to Firebase using Firebase CLI or create via the Firebase Console URL provided in the error message.

verification: After index is created and active, click Timeline button in procurement view - should load without Firebase index error.

files_changed:
  - firestore.indexes.json (add pos collection composite index)
