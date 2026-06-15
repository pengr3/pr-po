---
spike: 023b
name: plan-card-iteration-label
type: standard
validates: "Given last_loaded_iteration_id is set on the project doc, when the inline plan card renders on project-detail, then a blue 'On: [Iteration Name]' strip appears between the heading and the task content; absent when in live mode or after loading an auto-save"
verdict: VALIDATED ✓
related: [015c, 017, 018, 023a]
tags: [ux, project-plan, project-detail, iteration, data-accuracy]
---

# Spike 023b: Plan Card Iteration Label

## What This Validates

When a named iteration is loaded in the plan page:
1. `restoreIteration()` batch-overwrites `project_tasks` with the iteration's snapshot
2. `last_loaded_iteration_id` is written to the project doc

The inline card's `onSnapshot` listener on `project_tasks` will pick up the overwritten tasks immediately — so task data is already accurate. The missing piece is context: the card doesn't tell the user WHICH iteration they're looking at.

Fix: read the iteration label from `project_iterations` when `last_loaded_iteration_id` is detected, and render an "On: [label]" strip in the card. Auto-saves set `last_loaded_iteration_id = null`, so they never show a strip.

## How to Run

```
python -m http.server 8000
```
`http://localhost:8000/.planning/spikes/023b-plan-card-iteration-label/spike.html`

## What to Expect

Four modes via the switcher:
- **Live** — no strip
- **Iteration 1 loaded** — blue strip "On: Iteration 1" + A and B shown as complete
- **"Baseline Sprint 3" loaded** — named iteration with different task structure
- **Auto-save** — no strip (auto-saves don't persist last_loaded_iteration_id)

## Implementation Notes

**Changes to `project-detail.js`:**

1. Add `let currentIterationLabel = null;` at module level

2. Add `ensureIterationLabel()` async function:
```js
async function ensureIterationLabel() {
    const iterationId = currentProject?.last_loaded_iteration_id;
    if (!iterationId) { currentIterationLabel = null; return; }
    try {
        const snap = await getDoc(doc(db, 'project_iterations', iterationId));
        currentIterationLabel = snap.exists() ? (snap.data().label || null) : null;
    } catch { currentIterationLabel = null; }
}
```

3. In the project `onSnapshot` callback (both branches), call `await ensureIterationLabel()` BEFORE `renderProjectDetail()` so the card renders with the label on first load.

4. In `ensureTasksListener()` snapshot handler: no change needed — task data is already live.

5. In `buildPlanCardHtml()`: insert `iterStrip` between `.plan-heading-new` and `.plan-inner`.

6. In `destroy()`: add `currentIterationLabel = null;`

**CSS (add to views.css):**
```css
.plan-iter-strip {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 16px;
    background: #eff6ff; border-bottom: 1px solid #bfdbfe;
    font-size: 11px; color: #1e40af; font-weight: 600;
}
.plan-iter-strip .iter-icon { font-size: 12px; opacity: 0.8; }
.plan-iter-strip .iter-label { flex: 1; }
.plan-iter-strip .iter-open-link { font-size: 11px; color: #1a73e8; text-decoration: none; font-weight: 500; }
.plan-iter-strip .iter-open-link:hover { text-decoration: underline; }
```

## Investigation Trail

- Confirmed: task data sync is NOT broken — loading an iteration already batch-overwrites project_tasks
- Confirmed: the onSnapshot listener in project-detail.js fires on project_tasks changes
- Root cause of "card says otherwise": doneCount calculation bug (Spike 023a), not a sync failure
- Root cause of iteration uncertainty: no label shown on card

## Results

**Verdict: VALIDATED ✓**

Implemented in `project-detail.js`:
- `let currentIterationLabel = null` added at module level; reset in `destroy()`
- `ensureIterationLabel()` async function fetches label via `getDoc` on `project_iterations/{id}`; called with `await` in both `onSnapshot` branches before `renderProjectDetail()`
- `buildPlanCardHtml()`: `iterStrip` injected between `.plan-heading-new` and inner content when `currentIterationLabel` is set
- CSS added to `styles/views.css`: `.plan-iter-strip` and child classes
