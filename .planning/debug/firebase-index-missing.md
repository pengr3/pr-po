---
status: diagnosed
trigger: "Firebase index missing for project expense aggregation (Test 1)"
created: 2026-02-06T00:00:00Z
updated: 2026-02-06T00:00:05Z
---

## Current Focus

hypothesis: Server-side aggregation query requires composite Firebase index
test: Analyze query structure in refreshProjectExpenses()
expecting: Query uses where() + aggregation, requires index configuration
next_action: Examine exact query structure and identify index requirements

## Symptoms

expected: Project List tab loads without errors and displays project expense data
actual: FirebaseError thrown stating "The query requires an index"
errors: "FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/clmc-procurement/firestore..."
reproduction: Navigate to Finance > Project List tab
started: Phase 13 implementation (Finance Dashboard)

## Eliminated

## Evidence

- timestamp: 2026-02-06T00:00:00Z
  checked: app/views/finance.js lines 342-397 (refreshProjectExpenses function)
  found: Uses getAggregateFromServer with query(collection, where('project_name', '==', projectName))
  implication: Server-side aggregation with where clause requires composite index in Firebase

- timestamp: 2026-02-06T00:00:01Z
  checked: Query structure at lines 362-370
  found: |
    const posQuery = query(
        collection(db, 'pos'),
        where('project_name', '==', projectName)
    );
    const aggregateSnapshot = await getAggregateFromServer(posQuery, {
        totalAmount: sum('total_amount'),
        poCount: count()
    });
  implication: Firebase requires explicit index for aggregation queries with filters

- timestamp: 2026-02-06T00:00:02Z
  checked: firestore.indexes.json
  found: Only has index for 'users' collection (status + created_at), no index for 'pos' collection
  implication: Missing required index configuration for pos collection queries

- timestamp: 2026-02-06T00:00:03Z
  checked: firebase.json
  found: Project properly configured with firestore.indexes.json reference
  implication: Index file exists and is linked, just needs pos collection index added

## Resolution

root_cause: Firebase aggregation queries (getAggregateFromServer) with where() clauses require composite indexes. The query filters 'pos' collection by 'project_name' and aggregates 'total_amount' using sum() and count(). Firebase cannot execute this server-side aggregation without a predefined composite index. Current firestore.indexes.json only contains a users collection index.

fix: Add composite index entry to firestore.indexes.json for 'pos' collection with field 'project_name' (ASCENDING)

verification: Deploy index to Firebase, wait for index build completion, test Project List tab

files_changed:
  - firestore.indexes.json (add pos collection index)
