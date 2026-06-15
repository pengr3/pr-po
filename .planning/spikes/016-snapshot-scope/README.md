---
spike: 016
name: snapshot-scope
type: standard
validates: "Given the user wants to restore an iteration (015c mechanic), when a snapshot is saved, then the scope — dates only / dates+deps / full task doc — determines what's preserved vs. what stays live on restore"
verdict: WINNER — full task doc
related: [015c-restore-auto-snapshot, 017-iteration-history-ux, 018-iteration-diff-view]
tags: [iteration, snapshot, storage, schema, project-plan]
---

# Spike 016: Snapshot Scope

## What This Validates

Given that 015c won (auto-snapshot + undo restore mechanic), when a user saves an
iteration, three scope choices are possible:

- **Dates only** — `{task_id, start_date, end_date}` per task
- **Dates + deps** — `{task_id, start_date, end_date, predecessors}` per task
- **Full task doc** — complete task snapshot (name, dates, deps, assignee, progress, notes)

Each scope has different storage size, restore fidelity, and "what's lost" implications.
The spike makes each scope's tradeoff *visible and felt*, not just described.

**The question:** Which scope feels like a real save-state without being heavy? Does
"dates only" feel dangerously thin? Does "full doc" feel like overkill?

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/016-snapshot-scope/spike.html
```

## What to Expect

- **Top scope bar:** Three buttons — "Dates only", "Dates + deps", "Full task doc". Switching scope instantly updates the whole UI.
- **Task table:** Green-tinted cells = saved in snapshot. Red-faded cells = NOT saved — stays live on restore. Column headers dim for unsaved fields.
- **Iteration sidebar cards:** Field chips show what each saved iteration captured (green = in, red/strikethrough = out of snapshot).
- **"Save Iteration…" button:** Opens a modal showing exactly which fields get captured at the current scope, with a note for any fields that won't be saved.
- **"Load" on any iteration card:** Opens the 015c-style restore modal. Shows "Restored" vs "Stays live" per field. Confirms with auto-snapshot + undo toast.
- **Log pane:** Records every scope change, save, restore, and undo with field counts.

## Key Interactions to Try

1. Switch to **Dates only** → note how 5 of 7 columns go red — that's a lot of data left behind on restore.
2. Click **Save Iteration…** → read the "Not saved" fields list. See the caveat note about task renaming.
3. Switch to **Full task doc** → all columns green. Click **Save Iteration…** → the modal is simple, no caveats.
4. Click **Load** on any saved iteration with **Dates only** scope → restore modal shows "Stays live" for 5 fields. Feel whether that's acceptable.
5. Try **Dates + deps** as the middle ground.

## Investigation Trail

(Filled in during checkpoint.)

## Results

**Verdict: WINNER — full task doc** (2026-06-02)

Full doc is the only scope that makes restore trustworthy. Partial scopes (dates-only, dates+deps) create a confusing partial restore where some fields come from the snapshot and others silently stay live — hard to explain, easy to misunderstand. Storage cost is negligible (2–3 KB per iteration even at 20 tasks × 7 fields). Full doc also handles task additions/deletions cleanly — the snapshot is self-contained, no dangling IDs. No user-configurable scope needed: always save everything.
