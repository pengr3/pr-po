---
phase: 97
name: Project Plan Iterations
spike_series: 015–018
status: ready-to-plan
created: 2026-06-02
---

# Phase 97 Context: Project Plan Iterations

## Origin

User idea surfaced during Phase 86.12 (Baseline Snapshot) UAT: "we can also extend this to save state? like we can save different iterations of the project plan." Explored via spike series 015–018 (2026-06-02). All four open questions answered before planning.

## What the User Imagines

From the project plan view, the user can:
1. Click "Save Iteration" to snapshot the current plan under a name
2. Open a right-side History panel to see all saved iterations in a timeline
3. Click "⟷ Diff" on any iteration to see what changed without loading it
4. Click "Load →" to restore — the current state is auto-saved first, and a 5-second Undo toast appears

The feature feels like a low-friction "save game" mechanic for the project plan.

## Spike Verdicts (all four questions answered)

| Question | Decision | Spike |
|----------|----------|-------|
| Restore mechanic | Auto-snapshot current state before restore + 5s undo toast. On undo: roll back + remove auto-snapshot from rail. | 015c WINNER |
| Snapshot scope | Full task doc — every field captured. No partial restores, no silent "stays live" surprises. | 016 WINNER |
| History UX surface | Right rail — persistent side panel toggled from toolbar. Plan stays visible while browsing history. | 017B WINNER |
| Diff view | Ship it — inline old→new per field in colored rows; "Load this →" from diff panel header. | 018 VALIDATED |

## Firestore Schema

```
project_iterations/{iterationId}
  project_id:   string
  label:        string          // user-supplied name (e.g. "Pre-scope-change")
  saved_at:     timestamp
  auto:         boolean         // true = auto-snapshot created before a restore
  tasks:        array<TaskDoc>  // full task snapshot
```

`TaskDoc` mirrors `project_tasks` document fields: `{ id, name, start_date, end_date, predecessors, assignee_user_ids, progress, notes, is_milestone, status, ... }`

Security Rules: same pattern as `baselines` subcollection from Phase 86.12 — all active users read, project members write.

## UI Components to Build

All live in `app/views/project-plan.js` and `styles/views.css`.

1. **"Save Iteration" toolbar button** — prompts for a name (default: "Iteration N"); writes to `project_iterations`
2. **"History" toolbar button** — toggles the right rail open/closed
3. **Right rail** — 260px wide, slides in beside the plan; shows iterations newest-first as timeline cards; each card has `⟷ Diff` + `Load →` buttons; `+ Save current state` button at top
4. **Diff panel** — slides up from the bottom of the plan pane when `⟷ Diff` is clicked; task rows color-coded (amber=changed, green=added, red=removed, grey=same); inline `old → new` per changed field; "Load this →" button in panel header; `×` to close
5. **Restore mechanic** — on Load: (a) auto-snapshot current to `project_iterations`, (b) batch-write iteration's tasks to `project_tasks`, (c) show 5s undo toast; on Undo: (a) restore from auto-snapshot, (b) delete auto-snapshot doc, (c) dismiss toast

## Key Constraints

- **Auto-snapshot labeling**: label as `Auto-save before "[iteration name]"`, `auto: true`
- **Iterations ≠ Baselines**: baselines are immutable comparison anchors (Phase 86.12); iterations are mutable save-states. No cross-contamination.
- **Linear history only** — no branching. Auto-snapshots stack in order like any other iteration.
- **Auto-snapshot pruning** (optional/future): keep only last N auto-snapshots to prevent rail clutter. Not required for MVP.
- **Right rail width**: 260px — consistent with spike 017 prototype
- **Restore is a full batch-write to `project_tasks`**: delete all existing docs, write all iteration task docs (same pattern used by Phase 86 task CRUD)

## What NOT to Change

- Baseline overlay (dashed bars, slip badges) from Phase 86.12 — untouched
- Bar colors / overdue status from Phase 86.11 — untouched
- `project_tasks` Firestore Security Rules — iterations writes go to `project_iterations` subcollection only

## Reference Artifacts

- `.planning/spikes/iterations-series-SUMMARY.md` — full decision log + rejected approaches
- `.planning/spikes/015c-restore-auto-snapshot/spike.html` — restore mechanic prototype
- `.planning/spikes/017-iteration-history-ux/spike.html` — right-rail layout prototype
- `.planning/spikes/018-iteration-diff-view/spike.html` — diff panel prototype (most complete — use as primary reference)
