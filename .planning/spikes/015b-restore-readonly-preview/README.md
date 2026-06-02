---
spike: 015b
name: restore-readonly-preview
type: comparison
validates: "Given a saved iteration, when user clicks Preview, then the Plan view shows the saved tasks in a read-only banner mode (Exit Preview to return) — project_tasks untouched"
verdict: REJECTED
related: [014-baseline, 015a-restore-destructive-replace, 015c-restore-auto-snapshot]
tags: [iteration, restore, save-state, project-plan, ux]
---

# Spike 015b: Restore — Read-only Preview Banner

## What This Validates

Given a project plan with 5 live tasks and 3 saved iterations, when the user clicks
**Preview** on a saved iteration, then the Plan view swaps to render that iteration's
tasks behind a yellow "Viewing — read-only" banner. The live `project_tasks` collection
is untouched. Editing affordances are visibly disabled. **Exit Preview** returns to the
live plan.

**The question:** Is preview-only enough? Does the user actually need to *restore* — or
do they just need to *see* the saved state? If preview answers 80% of the use case
without any data risk, maybe destructive restore isn't needed at all.

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/015b-restore-readonly-preview/spike.html
```

## What to Expect

- Top: "LIVE" tag next to project name — confirms current state is the live plan.
- Click **Preview** on any iteration → page enters preview mode:
  - Amber banner slides in: `Viewing "<name>" — read-only. Your live plan is unchanged.`
  - Task table border turns amber + soft glow.
  - Table rows render the iteration's tasks instead of the live plan.
  - Cell hover state is suppressed (cursor: not-allowed on dates/names).
  - Sidebar card for the active iteration is highlighted.
  - "LIVE" tag in topbar disappears.
- Click any editable cell while previewing → silently blocked; event log records attempt.
- Click **Exit Preview** (banner button) → back to live tasks, LIVE tag returns.
- Switch between iterations by clicking Preview on a different card → cleaner than
  exit-then-re-enter.

## Observability

Event log captures:
- `event` — neutral actions, blocked edit attempts
- `preview-enter` (amber) — entering preview mode
- `preview-exit` (green) — back to live

The "edit attempt blocked" entries are a useful proxy: if the user keeps trying to edit
while previewing, that signals they expected restore semantics, not preview.

## Investigation Trail

(Filled in during checkpoint.)

## Results

**Verdict: REJECTED** (2026-06-02)

Preview-only is a dead end — useful for browsing but the feature has no teeth if you can never actually load an iteration into your live plan. Users will eventually want restore semantics, so 015b defers the hard question rather than answering it. Keep the amber "Viewing" banner concept as a post-restore state indicator (see 015c hybrid note), but not as the primary mechanic.
