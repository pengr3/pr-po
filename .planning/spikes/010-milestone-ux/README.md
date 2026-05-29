---
spike: 010
name: milestone-ux
type: comparison
validates: "Given a task row in the grid, when the user wants to mark it as a milestone, then which UX (context menu addition vs inline column toggle) feels more natural — and the project-detail plan card highlights update in real-time"
verdict: PENDING
related: [008-project-detail-layout, 009-proposal-card-redesign]
tags: [gantt, milestone, ux, project-plan, project-detail]
---

# Spike 010: Milestone UX

## What This Validates

Given `project_tasks` in the Gantt view, when a user wants to designate a task as a milestone:
- **Variant A** — right-click context menu adds "Mark as Milestone / Remove Milestone" item
- **Variant B** — a narrow ◆ column in the grid acts as a one-click toggle

Then: the chosen approach feels intuitive, the milestone diamond appears on the Gantt bar row, and the project-detail plan card's "Next Milestone" + "Ongoing Milestone" slots populate immediately.

## Root Cause This Fixes

`computeProjectProgress()` in `project-detail.js` (line 1677–1682) filters on `is_milestone === true`:

```js
tasks.filter(t => t.is_milestone && t.end_date >= today …)   // nextMilestone
tasks.filter(t => t.is_milestone && … start_date <= today …) // ongoingMilestone
```

`project-plan.js` defaults every new task to `is_milestone: false` (line 1155). The context menu
has no "Mark as Milestone" entry. Result: these slots always show "No upcoming milestones" even
on active plans with tasks.

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/010-milestone-ux/spike.html
```

## What to Expect

- Left panel (A): right-click any task row → context menu shows "Mark as Milestone" (amber) or "Remove Milestone"
- Right panel (B): click ◆ column button → toggles immediately; active state is amber/gold
- Both variants: milestone rows get amber row tint + diamond prefix on the name
- Gantt preview rows: milestone tasks show diamond shape instead of bar
- Project Plan card (right): "Next Milestone" and "Ongoing Milestone" slots populate as soon as any task with a future or current date window is marked

## Observability

State is all in-memory `taskData[]` array. Toggle any task's `is_milestone` in browser console:
```js
taskData[2].is_milestone = true; renderAll();
```

## Investigation Trail

**2026-05-26** — Built both variants in a single spike file so user can feel the difference
side-by-side. Key tension:
- Variant A (context menu): zero columns added, consistent with existing right-click UX.
  Downside: discovery requires knowing to right-click; no at-a-glance scan of which tasks
  are milestones.
- Variant B (inline column): always visible, one-click. Downside: already-wide grid adds
  one more column (36px). Header ◆ is not immediately obvious as "milestone" to new users.

**Open question surfaced during build:** Even if we pick A or B for the toggle action,
the grid never shows a milestone indicator on the row *name* unless we add the diamond prefix.
A hybrid may be optimal: add the diamond prefix to the name regardless of variant, so milestone
rows are always scannable in the grid even without looking at the column.

## Results

VALIDATED ✓ — **Variant A chosen** (context menu right-click).

Implemented in `app/views/project-plan.js` and `styles/views.css`:
- `gridToggleMilestone(taskId)` + `gridGroupToggleMilestone(idsJson)` functions
- Single context menu: "◆ Mark as Milestone" / "◆ Remove Milestone" item (amber, after header)
- Group context menu: "◆ Toggle Milestone" item for multi-select
- `tg-row-milestone` class on grid rows → amber tint (#fffbeb / #fef3c7 hover)
- `tg-milestone-icon` span (◆, amber #d97706) in name cell before input
- Gantt diamond already handled by existing `milestone-marker` CSS class
