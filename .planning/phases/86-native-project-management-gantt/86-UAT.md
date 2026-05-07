---
status: abandoned
phase: 86-native-project-management-gantt
source: [86-01-SUMMARY.md, 86-02-SUMMARY.md, 86-03-SUMMARY.md, 86-04-SUMMARY.md, 86-05-SUMMARY.md]
started: 2026-05-06T00:00:00Z
updated: 2026-05-06T00:10:00Z
---

## Current Test

number: 2
name: Task tree renders with hierarchy
expected: |
  With tasks present, the left rail shows a hierarchical tree. Parent tasks
  have a chevron (›) that expands/collapses to show child tasks. Child tasks
  are indented relative to their parent. Each row shows the task name and a
  progress percentage on the right. Clicking a chevron toggles the subtree
  without navigating away.
awaiting: user response

## Tests

### 1. Navigate to Project Plan view
expected: |
  Open a project from the Projects tab. On the project-detail page you should
  see a "Project Plan" summary card (stats row + Highlights + Open Plan button).
  Click "Open Plan" (or navigate to #/projects/CODE/plan directly).
  The full-screen plan view loads: left toolbar shows the project name, a back
  link, zoom pills (Day / Week / Month with Week pre-selected), a Filters
  button, and a + Add Task button. No console errors. Navigating back via the
  back link returns you to the project-detail page.
result: pass
note: Initial load had permission-denied on project_tasks snapshot — root cause was firestore.rules not deployed to clmc-procurement-dev. Fixed inline via `firebase deploy --only firestore:rules --project dev`. Retest passed cleanly.

### 2. Task tree renders with hierarchy
expected: |
  With tasks present, the left rail shows a hierarchical tree. Parent tasks
  have a chevron (›) that expands/collapses to show child tasks. Child tasks
  are indented relative to their parent. Each row shows the task name and a
  progress percentage on the right. Clicking a chevron toggles the subtree
  without navigating away.
result: [pending]

### 3. Task tree row selection (CR-04 onclick refactor)
expected: |
  Click on a task row in the left rail (not the chevron — click the task name
  area). The row highlights (selected state). Click a different row — the
  previous row de-selects, the new row highlights. This verifies the
  onclick→data-attribute refactor from the code review didn't break row
  selection.
result: [pending]

### 4. Add Task modal
expected: |
  Click "+ Add Task". A modal opens with fields: Task Name, Description,
  Start Date, End Date, Parent Task dropdown, Depends On multi-select,
  Milestone checkbox, and Assignees pill picker. Fill in a name and dates,
  leave parent empty (root task), and save. The new task appears in the tree
  and in the Gantt without a page refresh.
result: [pending]

### 5. Edit Task modal — parent dates persist (CR-02)
expected: |
  Create a parent task and add at least one child task under it. Note the
  parent's date range. Click the child task row to select it, then open its
  edit modal (right-click the row or find the edit button). Change the child's
  end date to extend past the parent's current end. Save. The parent task's
  date range should automatically extend to cover the new child end date —
  it must NOT reset to blank. This is the CR-02 regression check.
result: [pending]

### 6. 3-level parent date recompute (WR-02)
expected: |
  Create a 3-level chain: GrandParent → Parent → Child. Note the GrandParent's
  date range. Edit the Child task's end date so it extends past GrandParent's
  current end date. Save. Both Parent AND GrandParent date ranges should
  automatically expand to cover the new Child end date. The recompute should
  bubble up all the way to the root ancestor.
result: [pending]

### 7. Cycle detection on dependency save
expected: |
  Create two tasks A and B. Edit task B and add task A as a "Depends On"
  dependency. Save — this should work fine. Now edit task A and try to add
  task B as a dependency (which would create A → B → A cycle). On save, you
  should see an error toast: "This dependency would create a cycle: A → B → A.
  Remove one of the deps to continue." The task is NOT saved with the cyclic dep.
result: [pending]

### 8. Delete leaf task
expected: |
  Select a task with no children and trigger delete (delete button or X icon
  on the row). A confirmation modal appears: "Delete Task?" with the task name.
  Confirm the delete. The task disappears from the tree and Gantt without a
  page refresh. If the deleted task had a parent, the parent's date range
  recomputes accordingly.
result: [pending]

### 9. Cascade delete (delete parent with subtasks)
expected: |
  Select a parent task that has at least 2 child tasks and trigger delete.
  The confirmation modal should show "Delete Task and Subtasks?" and display
  the count of tasks that will be deleted (parent + all descendants). Confirm.
  The parent AND all its subtasks disappear from the tree and Gantt.
result: [pending]

### 10. Frappe Gantt renders — parent bars, milestones, today line
expected: |
  With tasks loaded, the right pane shows a Gantt chart. Leaf tasks appear as
  normal bars. Parent tasks appear as thin charcoal summary bars (not full-height
  bars). Milestone tasks (is_milestone checked) appear as yellow diamond markers
  instead of bars. A red vertical line marks today's date on the timeline. The
  chart scrolls horizontally and is centered approximately on today on load.
result: [pending]

### 11. Zoom toolbar — Day / Week / Month
expected: |
  Click "Day" in the zoom pill bar — the Gantt zooms to show individual days.
  Click "Month" — the Gantt zooms out to show months. Click "Week" — returns to
  week view. Only one zoom pill is highlighted (active) at a time. The Gantt
  does not lose scroll position or reset state when switching zoom levels.
result: [pending]

### 12. Drag-resize or drag-reschedule a leaf task
expected: |
  In the Gantt, grab a leaf task bar (by dragging the body to reschedule, or
  dragging an edge to resize) and drop it at a new position. After dropping,
  the task's dates update in the Firestore without a page refresh — the tree
  left rail and Gantt both reflect the new dates. If you move an edge, start
  or end date changes; if you move the body, both shift.
result: [pending]

### 13. Parent task drag is blocked (D-11)
expected: |
  Try to drag a parent task's bar in the Gantt (a parent that has child tasks).
  The drag should be blocked — either the bar handles are not clickable (CSS
  pointer-events: none), or if a drag somehow starts, it snaps back and shows
  a toast: "Parent task dates are computed from subtasks. Edit subtask dates
  instead." The parent task dates should NOT change in Firestore.
result: [pending]

### 14. Inline leaf progress slider (WR-04 NaN guard)
expected: |
  Select a leaf task row in the left rail. A horizontal range slider (0–100%)
  appears on the row. Drag the slider to a new value (e.g. 50%). The progress
  percentage updates visually and saves to Firestore. Parent task progress
  percentages in the left rail update via the weighted rollup formula. Also
  verify the slider DOESN'T appear on parent task rows (only on leaf rows).
result: [pending]

### 15. FS-violation toast on broken dependency order
expected: |
  Create task A (ends day 5) and task B (starts day 3, after A ends day 5 —
  so B starts before A finishes). Add "A → B" as a Finish-to-Start dependency.
  After saving, a warning toast should appear: "Task 'B' now starts before
  Task 'A' finishes. Reschedule manually if needed." Alternatively, drag a task
  so its end date is after a dependent task's start date — same toast fires.
result: [pending]

### 16. Filter panel — date range and assignees
expected: |
  Click the "Filters" button on the toolbar. A filter panel slides down showing
  From/To date inputs and assignee pills (one pill per person assigned to any
  task). Enter a date range that matches some tasks but not others, then click
  Apply. Both the task tree (left rail) and the Gantt (right pane) narrow to
  show only tasks that overlap the date range. Parent rows stay visible even if
  the filter matches only their descendants. Click Clear — all tasks reappear.
result: [pending]

### 17. Project Plan summary card on project-detail
expected: |
  Navigate to a project's detail page (not the plan view). A "Project Plan"
  card is visible on the page showing: total task count, overall % complete
  (weighted rollup), and three Highlights cells — "Most recent accomplishment",
  "Next milestone", and "Ongoing milestone" (showing task names or "None" if
  none qualify). An "Open Plan" button/link navigates to the plan view.
  The card updates in real time as tasks change (no page refresh needed).
result: [pending]

## Summary

total: 17
passed: 1
issues: 0
pending: 16
skipped: 0
blocked: 0

## Gaps

[none yet]
