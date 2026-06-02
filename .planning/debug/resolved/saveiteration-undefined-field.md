---
slug: saveiteration-undefined-field
status: fixing
trigger: "project-plan.js:3335 [Plan] saveIteration error: FirebaseError: Function addDoc() called with invalid data. Unsupported field value: undefined (found in document project_iterations/s7dY3lBir1v7rJ9dW2xc)"
created: "2026-06-02"
updated: "2026-06-02"
phase: "97"
---

# Debug Session: saveIteration undefined field

## Symptoms

- **Expected:** Save a named iteration snapshot to Firestore `project_iterations`
- **Actual:** Firebase throws "Unsupported field value: undefined" — toast shows "Failed to save Iteration"
- **Error:** `FirebaseError: Function addDoc() called with invalid data. Unsupported field value: undefined (found in document project_iterations/s7dY3lBir1v7rJ9dW2xc)`
- **Location:** `app/views/project-plan.js:3335` (catch block in `saveIteration()`)

## Current Focus

hypothesis: saveIteration() snapshot map copies optional task fields without null fallbacks; any task with undefined values (project_code, parent_task_id, row_order, status, created_at, etc.) causes Firestore to reject the entire write
test: read saveIteration() lines 3304–3323 and check every field for || null guards
expecting: multiple fields missing fallbacks
next_action: apply null fallbacks to all 12 unguarded fields

## Evidence

- timestamp: "2026-06-02T00:00:00Z"
  observation: "lines 3315-3318 have guards (dependencies || [], assignees || [], notes || '') but lines 3305-3314 and 3317-3322 have no guards"
  source: "app/views/project-plan.js:3304-3323"
  conclusion: "any task missing project_code, parent_task_id, row_order, status, created_at, updated_at, created_by, task_id, start_date, end_date, progress, or is_milestone will trigger the Firebase error"

## Eliminated

## Resolution

root_cause: "saveIteration() task snapshot map copies 19 fields without null-coalescing optional fields. Firestore rejects any undefined value in a document write. Tasks created before project_code was added, or root tasks with no parent_task_id, or tasks with undefined status/timestamps trigger the error."
fix: "Add ?? null / || null / ?? false / ?? 0 fallbacks to all 12 unguarded fields in the snapshot map"
files_changed:
  - app/views/project-plan.js
