---
series: iterations (015–018)
status: COMPLETE
closed: 2026-06-02
---

# Spike Series: Project Plan Iterations

Explored "extend baselining to save rewindable iterations of the project plan" — the user's idea from Phase 86.12 UAT.

## Decisions Made

| Question | Answer | Spike |
|----------|--------|-------|
| Restore mechanic | Auto-snapshot current state before restore + 5s undo toast | 015c |
| Snapshot scope | Full task doc — all fields captured, nothing lost on restore | 016 |
| History UX surface | Right rail (persistent side panel, toggleable) | 017B |
| Diff view | Ship it — inline old→new per field, "Load this →" from diff panel | 018 |

## Key Distinctions Established

- **Iterations ≠ Baselines.** Baselines (Phase 86.12) are immutable comparison anchors. Iterations are rewindable save-states. Kept separate to avoid polluting the baseline mechanic with restore logic.
- **Linear history only** — no branching, no parallel iteration lines. Out of scope for MVP.
- **Auto-snapshots** are labeled distinctly and auto-removed on undo to limit sidebar clutter.

## What to Build (Implementation Guidance)

### Firestore schema

```
project_iterations/{iterationId}
  project_id:   string
  label:        string          // user-supplied name
  saved_at:     timestamp
  auto:         boolean         // true = auto-snapshot before restore
  tasks:        array<TaskDoc>  // full task doc snapshot per task
```

`TaskDoc` mirrors `project_tasks` fields: `{ id, name, start_date, end_date, predecessors, assignee_user_ids, progress, notes, ... }`

### UI components to build

1. **Right rail** — toggleable via toolbar button; shows timeline of iterations newest-first; each card has `⟷ Diff` + `Load →` buttons
2. **Save button** — in plan toolbar; prompts for name (or defaults to "Iteration N"); writes to `project_iterations`
3. **Diff panel** — slides up from bottom of plan pane when `⟷ Diff` clicked; shows task rows color-coded by status (added/removed/changed/same); "Load this →" triggers restore from within panel
4. **Restore mechanic** — on Load: auto-snapshot current → overwrite `project_tasks` with iteration tasks → show undo toast (5s) → on undo: restore auto-snapshot + remove it from rail

### Auto-snapshot pruning (future)

Auto-snapshots can accumulate if user loads frequently without undoing. Consider: keep only the last 3 auto-snapshots, auto-prune older ones silently.

## Rejected Approaches

- **015a (destructive + confirm modal)** — confirm modals become click-through theater; safety belongs in the system not a dialog
- **015b (preview-only)** — defers the real restore question; feature has no teeth without actual load
- **Dates-only / dates+deps scope** — partial restores are confusing; fields not in snapshot silently stay live
- **Modal list (017A)** — forces context switch every time user glances at history
- **Toolbar dropdown (017C)** — too cramped at scale, buries the feature
