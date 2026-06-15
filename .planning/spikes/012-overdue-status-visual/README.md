---
spike: 012
name: overdue-status-visual
type: comparison
validates: "Given a task whose end_date is in the past with progress < 100, when rendered in the grid, then which treatment — Variant A (Status chip column) or Variant B (row tinting + bar color) — makes overdue tasks immediately obvious without visual noise on healthy tasks"
verdict: "VALIDATED ✓ WINNER — Variant B (row tinting + bar color): overdue rows red fill (#fff5f5) + red left border, complete rows green fill (#f0fdf4), Gantt bars colored by status. No Status column added."
related: [010-milestone-ux]
tags: [gantt, overdue, status, ux, project-plan]
---

# Spike 012: Overdue & Status Visual

## What This Validates

Gaps G3 (Tier 1 — overdue tasks invisible) and G4 (Tier 2 — no status column):

- **Variant A** — auto-computed Status chip column (Not Started / In Progress / Overdue / Complete) inserted between Progress and Resources. Overdue rows get a red left-border accent. Grid bars colored by status.
- **Variant B** — no Status column. Overdue rows get red row tint + red left border. Complete rows get green tint. Gantt rows and bars also tinted by status. Status is ambient, not labeled.

## Root Cause This Fixes

`project-plan.js` renderRow() (line 723–784) applies no visual class based on task status. A task with `end_date: '2026-05-01'` and `progress: 0` looks identical to a task starting next month. `computeProjectProgress()` already derives `overdue` count from `end_date < today && progress < 100` — we just need to surface that in the grid.

## Status Logic

```js
function computeStatus(task, today) {
    if (task.progress >= 100)                          return 'complete';
    if (task.end_date < today)                         return 'overdue';
    if (task.start_date > today && task.progress === 0) return 'not-started';
    return 'in-progress';
}
```

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/012-overdue-status-visual/spike.html
```

## What to Expect

Left panel (Variant A — chip column):
- Status column shows colored chip pill for each task
- Overdue rows have a red left-border accent (no fill)
- MEP Rough-in (45%, ended May 15) → red "Overdue" chip
- Final Inspection (0%, ended May 22) → red "Overdue" chip
- Foundation Work / Structural Steel → green "Complete" chip
- Electrical Panel (starts Jun 1) → gray "Not Started" chip

Right panel (Variant B — row tinting):
- No Status column — grid is narrower
- Overdue rows: red fill (#fff5f5) + red left border
- Complete rows: green fill (#f0fdf4) + green left border
- Not Started rows: light gray fill
- Gantt rows match grid tinting; bars colored by status

## Key Tension

- **Variant A** is explicit — status is readable without decoding color. Adds ~100px column width.
- **Variant B** is scannable at-a-glance — a red row is immediately alarming. But relies on users learning the color convention; no label for new users.
- **Hybrid** possible: add Variant B row tinting to Variant A as well (tinting + chip column).

## Investigation Trail

**2026-05-29** — Built both variants with 7 representative tasks spanning all four statuses. Gantt mock uses proportional bars over Apr–Jul timeline with today-line. Status computation matches `computeProjectProgress()` logic already in project-detail.js.

## Results

**VALIDATED ✓ — 2026-05-29**

**Verdict: Variant B (row tinting + bar color)**

No Status column. Status is ambient: overdue rows get red tint (#fff5f5) + 3px red left border, complete rows get green tint (#f0fdf4) + 3px green left border, not-started rows get light gray fill. Gantt bars colored by computed status. Saves ~100px of grid width vs Variant A.

**Implementation targets:**
- `app/views/project-plan.js` renderRow() — add `computeStatus()` helper; apply `tg-row-overdue` / `tg-row-complete` / `tg-row-not-started` CSS class to `<tr>`
- `app/views/project-plan.js` renderGantt() — pass `customClass` based on status to Frappe task (already has `milestone-marker` / `parent-summary-bar` branching at line 1922–1924)
- `styles/views.css` or inline — add CSS for `.tg-row-overdue`, `.tg-row-complete`, `.tg-row-not-started` + bar colors
