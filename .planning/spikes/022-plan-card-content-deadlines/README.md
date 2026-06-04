---
spike: 022
name: plan-card-content-deadlines
type: standard
validates: "Given the plan card shows milestone slots that are almost always empty and 'No upcoming milestones.' noise, when the content is replaced with the next 2 upcoming tasks by due date + overdue count, then the card is genuinely useful for checking project health without opening the full plan"
verdict: PENDING
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

- **Current** vs **New: Deadline-Centric** switcher at top
- Data states: Typical / With overdue / No dates set / All complete / Empty plan
- The "With overdue" state is the most revealing — shows both overdue section and remaining upcoming task

## Investigation Trail

- Round 1: Built Current baseline + Deadline-Centric layout across 5 data states
- Awaiting user verdict

## Results

_Pending browser verification._
