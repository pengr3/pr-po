---
spike: 018
name: iteration-diff-view
type: standard
validates: "Given an iteration in the history rail, when user clicks Diff, then a panel shows adds/changes/deletes between current and that iteration — without loading it"
verdict: VALIDATED — diff view will ship with the feature
related: [015c-restore-auto-snapshot, 016-snapshot-scope, 017-iteration-history-ux]
tags: [iteration, diff, comparison, ux, project-plan]
---

# Spike 018: Iteration Diff View

## What This Validates

Given that the right rail shows saved iterations (spike 017), when the user wants to
understand *what changed* between now and a saved state, a diff panel answers that
without requiring a load. The user can see exactly which tasks were added, removed, or
changed (and which fields changed) before deciding whether to load.

**The question:** Is a diff view worth the surface area? Does it actually help the user
decide whether to load an iteration — or is the iteration name + date enough context?

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/018-iteration-diff-view/spike.html
```

## What to Expect

- **Right rail:** Shows 3 saved iterations (same Variant B rail from spike 017).
  Each card has two buttons: `⟷ Diff` and `Load →`.
- **Diff button:** Opens a panel at the bottom of the plan pane showing a task-by-task
  comparison — current state on left, iteration state expressed as changes.
  - Green rows = task added in current (not in iteration)
  - Red rows = task removed in current (was in iteration)
  - Amber rows = task changed — shows old → new per field inline
  - Grey rows = unchanged
- **"Q3 plan freeze" iteration** is intentionally missing T004 (Structural steel) —
  load it to see a removed-task diff row.
- **Diff stays open** while you browse other iterations — click a different `⟷ Diff`
  to switch, or `×` to close.
- **"Load this →" button** in the diff panel header triggers the 015c restore mechanic
  directly from the diff view.
- **Log pane** records diff opens, saves, restores, and undos.

## Key Questions to Feel Out

1. Does seeing the diff help you decide whether to load? Or is the iteration name enough?
2. Is the inline `old → new` field comparison readable at a glance?
3. Does the bottom panel feel like the right position, or should it be a separate column?
4. After seeing the diff, is "Load this →" the natural next action?

## Investigation Trail

(Filled in during checkpoint.)

## Results

**Verdict: VALIDATED** (2026-06-02) — diff view will ship with the feature.

Diff view earns its surface area: users accumulate iterations over time and lose track of what each one contains. Inline `old → new` per field in an amber row is readable at a glance. "Load this →" directly from the diff panel is the natural next action — no need to close and re-click in the rail. Position (bottom panel sliding up) works well without obscuring the rail.
