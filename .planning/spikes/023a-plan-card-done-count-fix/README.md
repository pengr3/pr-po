---
spike: 023a
name: plan-card-done-count-fix
type: standard
validates: "Given leaf tasks have unequal durations (e.g., task 3 = 10d vs 1d others) and 2 of 6 leaves are at 100%, when the plan card renders, then 'doneCount of leafCount tasks complete' shows the accurate leaf count — not the derived estimate from weighted-% × taskCount"
verdict: VALIDATED ✓
related: [021, 022]
tags: [ux, project-plan, project-detail, bug, data-accuracy]
---

# Spike 023a: Plan Card Done Count Fix

## What This Validates

`buildPlanCardHtml()` in `project-detail.js` computes:
```js
const doneCount = Math.round(p.taskCount * pct / 100);
```

With your actual data (8 tasks total including 2 parents, 6 leaves, tasks 1+2 at 100%, task 3 at 10d):
- `pct = round((100×1 + 100×1 + 0×10 + 0×1 + 0×1 + 0×1) / 15) = 13%`
- `doneCount = round(8 × 0.13) = 1`

But 2 leaf tasks are actually complete. The formula is wrong because:
1. `taskCount` includes parent groups (8 total, but only 6 are real tasks)
2. The weighted-duration percentage reflects time allocation, not task count

Fix: add `doneCount = leaves.filter(p >= 100).length` and `leafCount = leaves.length` to `computeProjectProgress()` output; use them in `buildPlanCardHtml()`.

## How to Run

```
python -m http.server 8000
```
`http://localhost:8000/.planning/spikes/023a-plan-card-done-count-fix/spike.html`

## What to Expect

Two cards side by side (Buggy / Fixed) across 5 data states:
- **Screenshot state** — your actual data; buggy shows "1 of 8", fixed shows "2 of 6"
- **More complete** — 4/6 done; bugs compound further
- **Equal durations** — bug disappears here (all 1d tasks, formula accidentally works)
- **All done** — both cards identical
- **Empty** — both empty

## Investigation Trail

- Built with exact screenshot data to reproduce the "1 of 8 tasks complete" display
- Confirmed root cause: weighted-duration % used as proxy for count fails when durations differ
- Confirmed fix: `result.doneCount = leaves.filter(...).length` + `result.leafCount = leaves.length` in `computeProjectProgress()`

## Results

**Verdict: VALIDATED ✓**

Fix implemented in `project-detail.js`:
- `computeProjectProgress()`: added `result.leafCount = leaves.length` and `result.doneCount = leaves.filter(l => (l.progress ?? 0) >= 100).length`
- `buildPlanCardHtml()`: replaced `Math.round(p.taskCount * pct / 100)` with `const { doneCount, leafCount } = p`; display now reads `${doneCount} of ${leafCount} tasks complete`; footer count changed from `p.taskCount` to `leafCount`
