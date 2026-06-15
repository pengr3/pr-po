---
spike: 014
name: baseline
type: comparison
validates: "Given a saved baseline snapshot, when rendered alongside live task dates, then which treatment — Variant A (ghost bars, same height, translucent) or Variant B (slim 4px rail at bar bottom) — makes schedule drift readable without cluttering the Gantt"
verdict: "VALIDATED ✓ WINNER — Variant F (Dashed Outline + Slip Badge): dashed outline shows original planned date range; +Xd / −Xd pill badge beside bars with drift; on-track tasks show outline only. Bar color left untouched — owned by Spike 012 (task status: overdue/complete/in-progress/not-started)."
related: [012-overdue-status-visual, 010-milestone-ux]
tags: [gantt, baseline, schedule, ux, project-plan]
---

# Spike 014: Baseline

## What This Validates

G9 — No baseline support. Users can't tell if tasks are running late vs the original plan.

- **Variant A** — Ghost bars: baseline rendered as a translucent grey rect at the same height as the live bar, inserted behind it. Live bar overlaps from the left; any extension past the ghost tail = slip. Bar colors indicate status (red=late, green=ahead, blue=on track).
- **Variant B** — Slim rail: baseline rendered as a 4px grey rail at the bottom of the bar row. Live bar floats above. Original planned extent is visible as a subtle underline. Live bars keep standard blue (status communicated by row tinting from Spike 012, not bar color).

## Data Design

Baseline stored as a **single Firestore document** per project — not on individual task docs:

```
projects/{projectId}/baselines/{baselineId}
  created_at: timestamp
  label: "Baseline 1"
  tasks: {
    "task_id_1": { start: "2026-05-01", end: "2026-05-12" },
    "task_id_2": { start: "2026-05-08", end: "2026-05-18" },
    ...
  }
```

"Set Baseline" button snapshots all current `start_date`/`end_date` values into this doc. Clean — task docs are not polluted. Supports multiple baselines in future by adding more docs.

## Implementation Approach

Baseline bars are injected into Frappe's SVG **after** `gantt.refresh()` using the same coordinate math as `renderTodayLine()` in project-plan.js:

```js
function dateToX(ganttInst, dateStr) {
    const anchor = ganttInst.gantt_start; // Frappe's timeline origin
    const xpd = ganttXPerDay();            // px per day (already exists in project-plan.js)
    return Math.round((new Date(dateStr) - anchor) / 86400000) * xpd;
}
```

Baseline rect inserted **before** `.bar` within `.bar-wrapper[data-id]` → renders behind the live bar in SVG painter's order. No Frappe internals modified.

## Slip Summary Row

Above the Gantt: counts of "X behind / Y ahead / Z on track" derived at render time by comparing current `end_date` vs baseline `end` for each task.

## How to Run

```
python -m http.server 8000
# open: http://localhost:8000/.planning/spikes/014-baseline/spike.html
```

## What to Expect

Slip table shows 6 tasks with slippage badges:
- Structural Design → On track (0d)
- Foundation Work → +5d late
- MEP Installation → 3d ahead
- Electrical Rough-in → +8d late
- Concrete Pour → On track (0d)
- Interior Fit-out → +12d late

Variant A Gantt: ghost bars visible behind live bars. Late tasks (red) extend past their ghost. Ahead task (green) is shorter than its ghost.
Variant B Gantt: thin grey rail at bar bottom. Live bar (blue) extends past rail on late tasks.

## Investigation Trail

**2026-05-29** — Built using real Frappe Gantt v1.2.2 (same CDN as production). SVG baseline bar injection is the key unknown — validated that `.bar-wrapper[data-id]` selector works, `.bar` rect `x/y/width/height` attributes are readable, and `gantt.gantt_start` + `gantt.config.column_width` are accessible post-construction (same approach as renderTodayLine in project-plan.js).

## Results

**VALIDATED ✓ — 2026-05-29**

**Verdict: Variant F (Dashed Outline + Slip Badge)**

Bar color axis is owned by Spike 012 (task status). Spike 014 uses a separate visual channel:
- Dashed-border outline at original planned date range (grey, no fill) — always shows where the baseline was
- Slip badge (`+8d` / `−3d` pill) beside bars that have drifted — on-track tasks show outline only, no badge noise

**Integration rule:** When rendering baseline overlay, do NOT recolor bars. Call `injectDashedOutlines()` then `injectSlipBadges()` after `gantt.refresh()` completes and after Spike 012's status classes are applied.

**Implementation targets:**
- `app/views/project-plan.js` — add `saveBaseline()`: snapshots all task `start_date`/`end_date` into Firestore `projects/{id}/baselines/{id}`; add `loadBaseline()`: loads latest baseline doc on init
- `app/views/project-plan.js` — add "Set Baseline" button to toolbar; after `gantt.refresh()`, call outline + badge injection functions
- `app/views/project-plan.js` — add slip summary row above Gantt: counts of X behind / Y ahead / Z on track
- Firestore schema: `projects/{projectId}/baselines/{baselineId}` — `{ label, created_at, tasks: { taskId: { start, end } } }`
- No bar color changes — Spike 012 owns that axis
