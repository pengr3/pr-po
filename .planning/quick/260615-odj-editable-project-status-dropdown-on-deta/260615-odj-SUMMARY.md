---
phase: quick-260615-odj
plan: "01"
subsystem: project-detail
tags: [project-status, dropdown, legacy-migration, lifecycle]
dependency_graph:
  requires: [UNIFIED_STATUS_OPTIONS, saveField, showEditControls, updateLifecycleBadge]
  provides: [hdrStatusSelect, select-aware-updateLifecycleBadge]
  affects: [app/views/project-detail.js]
tech_stack:
  added: []
  patterns: [IIFE-in-template-literal, select-value-fast-path]
key_files:
  created: []
  modified:
    - app/views/project-detail.js
decisions:
  - Used an IIFE (`(() => { ... })()`) inside the template literal for Edit 1 to keep multi-line option-building logic readable without extracting a helper function
  - Legacy option is prepended (not appended) so it appears first in the dropdown list, clearly indicating its non-canonical nature
  - updateLifecycleBadge uses `else` branching: if select exists, set .value only; if only badge exists, keep original textContent path — prevents any fallthrough corruption
metrics:
  duration_minutes: 10
  completed_date: "2026-06-15"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 1
---

# Phase quick-260615-odj Plan 01: Editable Project Status Dropdown Summary

## One-liner

Permission-gated `<select id="hdrStatusSelect">` in the project detail header strip, wired to `saveField('project_status')`, with legacy-value display and a select-aware `updateLifecycleBadge` that sets `.value` instead of wiping option children.

## What Was Built

**Edit 1 — Header strip status control (`app/views/project-detail.js` ~L632):**

The static `hdrStatusBadge` span is now conditional on `showEditControls`:

- `showEditControls === false`: renders the unchanged read-only `<span id="hdrStatusBadge">` with color and text exactly as before.
- `showEditControls === true`: renders `<select id="hdrStatusSelect" onchange="window.saveField('project_status', this.value)">` populated from `UNIFIED_STATUS_OPTIONS`. The current status is preselected. If the project's `project_status` is not in `UNIFIED_STATUS_OPTIONS` (legacy), a `(legacy)`-suffixed option is prepended and selected, allowing the user to see and re-stage it to any canonical value. If status is falsy, a disabled `—` placeholder is prepended.

**Edit 2 — `updateLifecycleBadge` select-awareness (~L2774):**

Looks up `hdrStatusSelect` first. If it exists, sets `hdrSelect.value = status` (no textContent/children mutation). Falls through to the existing `hdrStatusBadge` path only when the select is not present (read-only users). This prevents the lifecycle fast-path from destroying the select's options on incremental Firestore snapshots.

## Verification

- `node --check app/views/project-detail.js` — PASS (syntax clean)
- Plan automated grep gate — PASS: all 4 patterns found (`id="hdrStatusSelect"`, `saveField('project_status', this.value)`, `(legacy)`, `const hdrSelect = document.getElementById('hdrStatusSelect')`)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `d96650a` | feat(quick-260615-odj): permission-gated editable status dropdown in project detail header |

## Deviations from Plan

None — plan executed exactly as written. Both edits applied verbatim per spec.

## Known Stubs

None. The select is fully wired to the live `saveField` path.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced. `saveField` already validates permission internally before writing.

## Self-Check

- [x] `app/views/project-detail.js` modified — confirmed present
- [x] Commit `d96650a` exists — confirmed
- [x] No unintended file deletions in commit

## Self-Check: PASSED
