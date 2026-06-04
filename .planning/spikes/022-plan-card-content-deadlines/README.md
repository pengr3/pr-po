---
spike: 022
name: plan-card-content-deadlines
type: standard
validates: "Given the plan card shows milestone slots that are almost always empty and 'No upcoming milestones.' noise, when the content is replaced with the next 2 upcoming tasks by due date + overdue count, then the card is genuinely useful for checking project health without opening the full plan"
verdict: VALIDATED ✓ WINNER — Variant C (Combined: health badge + overdue pill + deadline rows)
related: [021, 010, 012]
tags: [ux, project-plan, project-detail, content, deadlines]
---

# Spike 022: Plan Card Content — Deadline-Centric

## What This Validates

The current plan card shows task count + %, then three milestone slots that are almost always empty ("No upcoming milestones." / "No active milestones."). Replacing those slots with:
- **Overdue section** (amber block, only shown when tasks are overdue)
- **Next Up** (the next 2 upcoming tasks by end_date, with milestone diamond indicator)
- **Last completed** (single line, replaces "Most recent accomplishment" heading)

Visual base is Spike 021A (progress bar). This spike is purely about content/information architecture.

## How to Run

```
python -m http.server 8000
```
`http://localhost:8000/.planning/spikes/022-plan-card-content-deadlines/spike.html`

## What to Expect

Four content variants in one file:
- **Current** — original milestone slots ("No upcoming milestones." noise)
- **A: Deadline-Centric** — next 2 tasks by due date + overdue section
- **B: Health-Centric** — On Track / At Risk / Behind badge + single next deadline row
- **C: Combined** — health badge + overdue pill + full upcoming task rows

Data states: Typical / With overdue / No dates / All done / Empty

The "With overdue" state is the most revealing — all variants handle it differently.

## Investigation Trail

- Round 1: Built Current + A (deadlines) across 5 data states
- Round 2: Added B (health) and C (combined) at user request; fixed layout to full two-column project detail context
- Round 3: User chose Variant C

## Results

**Verdict: VALIDATED ✓ WINNER — Variant C (Combined)**

**Chosen design:**

| Element | Treatment |
|---------|-----------|
| Progress bar | Full-width 8px bar, blue fill → green at 100% (from Spike 021A) |
| Health badge | "On Track" (green) / "At Risk" (amber) / "Behind" (red) pill — derived from overdue count |
| Overdue pill | Amber `N overdue` pill, inline with health badge; hidden when 0 |
| Overdue detail | Amber section card: task name + days late, up to 2 shown + "+N more" |
| Next Up | Task rows with ◆/○ icon, name, date, relative time; hidden when no dated tasks |
| Last completed | Single "LAST COMPLETED / task name" row; hidden when no completed tasks |
| Empty state | "No tasks yet" + Open Plan → CTA only; skip all stats |
| All-done state | Green completion block; replaces overdue/upcoming content |
| Footer | Task count (left) + Open Plan button (right) |

**Rejected:**
- A (Deadlines only): useful but no at-a-glance health signal
- B (Health only): health badge good but losing the task-level deadline detail felt like a downgrade

## Implementation Notes

**Data derivation from existing `computeStatus(task, today)` (project-plan.js:1375):**
```js
// Run across all tasks on the project detail snapshot
const today = new Date().toISOString().slice(0, 10);
const overdueTasks  = tasks.filter(t => !t.is_parent && computeStatus(t, today) === 'overdue')
                           .sort((a,b) => a.end_date.localeCompare(b.end_date));
const upcomingTasks = tasks.filter(t => !t.is_parent && t.end_date >= today && t.progress < 100)
                           .sort((a,b) => a.end_date.localeCompare(b.end_date))
                           .slice(0, 2);
const doneTasks     = tasks.filter(t => t.progress >= 100)
                           .sort((a,b) => (b.updated_at||'').localeCompare(a.updated_at||''));
const recentDone    = doneTasks[0]?.name || null;
```

**Health badge thresholds (proposed):**
- 0 overdue → On Track (green `#166534`)
- 1–2 overdue → At Risk (amber `#92400e`)
- 3+ overdue → Behind (red `#991b1b`)

**Changes to `project-detail.js`:**
- `updatePlanCard()` (line 225): add overdue/upcoming/recentDone to the data it patches
- `planCardHtml` template (line 386): full replacement with Combined layout
- The `currentProjectProgress` object needs `overdueTasks`, `upcomingTasks`, `recentDone`

**`computeStatus` is already exported-accessible** within project-plan.js scope but is a module-local function. For project-detail.js to use it, either:
1. Re-implement the 4-line function inline in project-detail.js (simplest — it's pure logic)
2. Move it to `app/utils.js` and import from both views

**New CSS classes needed:**
- `.plan-health-badge`, `.plan-health-badge.on-track/at-risk/behind`
- `.plan-overdue-pill`
- `.plan-combined-top` (flex row for badge + pill)
- `.plan-overdue-section` (amber card)
- `.plan-upcoming-section`, `.plan-upcoming-row`
- `.plan-last-done`
