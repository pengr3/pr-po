---
status: complete
phase: 20-multi-personnel-pill-selection
source: 20-01-PLAN.md, 20-02-PLAN.md, 20-03-PLAN.md
started: 2026-02-09T18:00:00Z
updated: 2026-02-09T18:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Pill input container renders in project creation form
expected: Navigate to #/projects, click "Add Project". Personnel field shows a pill-style input container (bordered box) with placeholder "Type name or email..." instead of the old datalist input.
result: pass

### 2. Typing filters users by name or email
expected: In the Personnel pill input, type part of a user's name or email. A dropdown appears below the input showing matching active users (name in bold, email in gray). Only users matching the search term appear.
result: pass

### 3. Selecting a user adds a pill
expected: Click a user in the dropdown. A blue pill/chip appears inside the input container with the user's name and an X button. The dropdown closes and the search input clears. The placeholder disappears since a pill is present.
result: pass

### 4. Adding multiple users and duplicate prevention
expected: Type another name and select a second user. Both pills appear side by side in the container. The first user is NOT shown in the dropdown (already selected). You can continue adding more users.
result: pass

### 5. Removing a pill with X button
expected: Click the X button on one of the pills. The pill is removed from the container. The removed user reappears in dropdown results when you search again.
result: pass

### 6. Click outside closes dropdown
expected: Type something to open the dropdown, then click anywhere outside the input container and dropdown. The dropdown closes.
result: pass

### 7. Creating a project saves personnel arrays
expected: Fill in all required fields (Client, Name, Internal Status, Project Status, at least one personnel pill) and submit. Project is created successfully. In Firebase Console, the project document has `personnel_user_ids` (array of strings) and `personnel_names` (array of strings). Legacy fields `personnel_user_id`, `personnel_name`, `personnel` are null.
result: pass

### 8. Editing a project populates pills from existing data
expected: Click Edit on a project that has existing personnel (single or multiple). The form opens with personnel displayed as blue pills inside the container. For legacy single-personnel projects, the one user appears as a pill.
result: pass

### 9. Saving an edited project writes array format
expected: Edit a project's personnel (add or remove), then save. In Firebase Console, the updated document has `personnel_user_ids` and `personnel_names` arrays, and all legacy fields are null.
result: pass

### 10. Project detail page shows personnel as pills
expected: Navigate to a project detail page (#/projects/detail/CLMC_XXX_YYYYNNN). The Assigned Personnel field in Card 1 displays the assigned personnel as blue pills (not a text input).
result: pass

### 11. Detail page inline add personnel
expected: On the project detail page (with edit permission), click the pill input and type a name. Dropdown appears. Select a user. A pill appears AND the change saves immediately to Firestore (check Firebase Console - no save button needed).
result: pass

### 12. Detail page inline remove personnel
expected: On the project detail page, click X on a personnel pill. The pill is removed AND the change saves immediately to Firestore.
result: pass

### 13. View-only users see pills without edit controls
expected: Log in as a view-only user (e.g., operations_user without edit permission). Navigate to a project detail page. Personnel appears as pills but WITHOUT X buttons and WITHOUT a search input. The container has a gray/disabled appearance.
result: pass
note: Initial test revealed operations_user could see edit UI but couldn't save. Fixed by restricting personnel editing to super_admin and operations_admin roles only.

### 14. Backward compatibility with legacy freetext personnel
expected: If any project has old freetext-only personnel data (from Phase 2, stored as `personnel` string without a user ID), it displays as a gray-colored pill (not blue). The gray pill still has an X to remove it.
result: pass

## Summary

total: 14
passed: 14
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
