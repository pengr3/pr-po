---
spike: 017
name: iteration-history-ux
type: comparison
validates: "Given multiple saved iterations, when user wants to browse and load one, then A (modal list) vs B (right rail timeline) vs C (toolbar dropdown) — which makes the right tradeoff between discoverability, context, and surface area"
verdict: PENDING
related: [015c-restore-auto-snapshot, 016-snapshot-scope, 018-iteration-diff-view]
tags: [iteration, ux, history, project-plan]
---

# Spike 017: Iteration History UX

## What This Validates

Given that iterations exist (015c mechanic, full-doc snapshots from 016), when a user
wants to see, browse, and load a saved iteration, three UX surfaces are possible:

- **Variant A — Modal list**: A "History" button opens a centered modal with all
  iterations as rows. Familiar, focused, but context-switching.
- **Variant B — Right rail**: A "History" button slides open a persistent timeline panel
  beside the plan. Keeps the plan visible while browsing history.
- **Variant C — Toolbar dropdown**: Iterations live in a compact dropdown next to the
  baseline button. Minimal surface area, discoverable via toolbar.

**The question:** Which surface feels right for how users will actually use history —
occasional glances, or active back-and-forth?

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/017-iteration-history-ux/spike.html
```

## What to Expect

- **Top variant bar:** Switch between A, B, C. Each variant swaps the toolbar and
  history surface while keeping the same task table and 015c restore mechanic.
- **Variant A:** Click "History" → modal with all iterations + Load buttons. Save from
  inside the modal or via "Save Iteration" in the toolbar.
- **Variant B:** Click "History" → right panel slides in beside the plan. Timeline dots
  with Load buttons. Plan stays visible while browsing.
- **Variant C:** Click "Iterations ▾" → compact dropdown. Hover to reveal "Load →".
  Sits next to a Baseline button to show how they coexist in the toolbar.
- **All variants share the 015c restore mechanic:** Load → auto-snapshot + undo toast.

## Key Questions to Feel Out

1. With Variant A — does closing the modal to look at the plan feel disruptive?
2. With Variant B — does the rail feel intrusive, or does having the plan visible while
   browsing actually help?
3. With Variant C — is the dropdown obvious enough? Would a user know "Iterations ▾"
   means history?
4. Try saving a new iteration from each variant — which flow feels most natural?

## Investigation Trail

(Filled in during checkpoint.)

## Results

(Pending user verdict at the 017 checkpoint.)
