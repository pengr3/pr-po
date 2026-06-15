---
spike: 015a
name: restore-destructive-replace
type: comparison
validates: "Given a saved iteration, when user clicks Load, then a confirm modal warns 'Replace current plan with this version?' → tasks in project_tasks are batched-overwritten"
verdict: REJECTED
related: [014-baseline, 015b-restore-readonly-preview, 015c-restore-auto-snapshot]
tags: [iteration, restore, save-state, project-plan, ux]
---

# Spike 015a: Restore — Destructive Replace + Confirm

## What This Validates

Given a project plan with 5 live tasks and 3 saved iterations, when the user clicks
**Load** on a saved iteration, then a confirm modal appears warning that the current
plan will be permanently overwritten. On Confirm, all 5 live tasks are replaced with
the iteration's tasks.

**The question:** Does the confirm modal carry enough weight to make this safe? Or
does a single click on "Replace plan" feel reckless even with the warning?

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/015a-restore-destructive-replace/spike.html
```

## What to Expect

- Left pane: live task table with 5 tasks (Mobilization through MEP rough-in).
- Right sidebar: 3 saved iterations (Pre-scope-change, Q3 plan freeze, Conservative re-plan).
- Click any iteration's **Load** button → confirm modal appears with red exclamation icon,
  iteration summary, and a red "Replace plan" button.
- Click **Cancel** → no change. Click **Replace plan** → live table is overwritten,
  rows flash amber briefly, toast confirms `Loaded "<name>" · N tasks now live`.
- Event log below the table records every action (open modal, cancel, restore).

## Observability

Event log captures:
- `event` — neutral actions (modal opened, cancelled)
- `restore` — actual overwrite events with before/after task counts

Useful for asking: how many cancels happen before the user gets comfortable confirming?

## Investigation Trail

(Filled in during checkpoint.)

## Results

**Verdict: REJECTED** (2026-06-02)

Lost to 015c. The confirm modal puts cognitive burden on the user every single restore — and the protection becomes theater once users click through it habitually. The destructive mechanic is right (you do need to actually replace the plan), but the safety guarantee belongs in the system (auto-snapshot), not in a warning dialog.
