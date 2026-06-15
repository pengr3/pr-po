---
spike: 015c
name: restore-auto-snapshot
type: comparison
validates: "Given a saved iteration, when user clicks Load, then current state is auto-saved as Iteration N+1 (auto) first, then the chosen iteration overwrites tasks — no data loss possible"
verdict: WINNER
related: [014-baseline, 015a-restore-destructive-replace, 015b-restore-readonly-preview]
tags: [iteration, restore, save-state, undo, project-plan, ux]
---

# Spike 015c: Restore — Auto-snapshot Safety Net

## What This Validates

Given a project plan with 5 live tasks and 3 saved iterations, when the user clicks
**Load** on a saved iteration, then:

1. A light confirm modal appears explaining the safety guarantee (green safety note).
2. On Confirm, the **current state is auto-saved** as a new iteration tagged `auto`.
3. The chosen iteration overwrites the live tasks.
4. A toast appears with an **Undo** link that restores the auto-snapshot if clicked
   within ~5 seconds — and removes the auto-snapshot from the sidebar to avoid clutter.

**The question:** Does the safety net make destructive restore feel cheap and easy?
Or does the auto-snapshot clutter the sidebar in a way that defeats the purpose?

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/015c-restore-auto-snapshot/spike.html
```

## What to Expect

1. Click **Load** on any iteration → light blue confirm modal with `↺` icon. Body is
   reassuring ("Safe by default") not scary. Primary button reads
   "Load & auto-save". Cancel works as expected.
2. Click **Load & auto-save** →
   - Sidebar gets a new card at the top with the **auto** pill, animated in from the
     right with a brief green tint. Note reads "Auto-saved before loading '<chosen>'".
   - Live table swaps to the chosen iteration's tasks; rows flash light blue.
   - Bottom toast: `Loaded "<name>". Previous saved as "<auto-label>".` with an
     **Undo** link.
3. Click **Undo** in the toast (within 5s) → live tasks roll back to the previous
   state; auto-snapshot is removed from the sidebar. Event log records the undo.
4. Load multiple iterations in succession → sidebar accumulates `auto` cards. This is
   the clutter concern to feel out.

## Observability

Event log distinguishes:
- `auto` (green) — auto-snapshot creation
- `restore` (blue) — the actual overwrite
- `undo` (amber) — rollback via toast link
- `event` (muted) — modal open/cancel

If you load 3 iterations in a row without undoing, you'll see 3 new `auto` cards stack
up — that's the trade-off being surfaced.

## Investigation Trail

(Filled in during checkpoint.)

## Results

**Verdict: WINNER** (2026-06-02)

Auto-snapshot before restore is the right mental model: restore confidently because you can always undo. The 5s undo toast gives immediate escape for accidental restores, and auto-removing the snapshot on undo prevents sidebar clutter. The light blue confirm modal (reassuring, not scary) felt better than 015a's red modal.

**Hybrid enhancement noted:** Surface a light "Restored from [Iteration 2]" banner after the restore lands (borrowing 015b's amber bar concept) so the user knows what state they're in after the toast disappears.

**Open concern for Spike 016:** Auto-snapshots stack up if the user restores frequently without undoing. Could be addressed by labeling auto-snapshots distinctly and/or auto-pruning them (e.g. keep only the last N auto-snapshots).
