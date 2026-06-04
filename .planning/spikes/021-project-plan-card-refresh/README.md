---
spike: 021
name: project-plan-card-refresh
type: comparison
validates: "Given the Project Plan card feels visually dated after the Proposal card was redesigned (Spike 009), when redesigned with (A) a progress bar hero or (B) stat chips matching the proposal card's design language, then the right column feels visually paired and project status is scannable without clutter"
verdict: PENDING
related: [008, 009, 010, 012]
tags: [ux, project-plan, project-detail, design, comparison]
---

# Spike 021: Project Plan Card Refresh

## What This Validates

Spike 009 redesigned the Proposal card to use a stage track + stat chips, explicitly calling the Project Plan card "the polished reference." After that, the roles reversed: the Project Plan card is now the dated one. Both cards sit in the right column of the project detail page — they need to feel like a pair.

Two variants:
- **A: Progress Bar** — horizontal bar as visual hero, compact chips, silenced milestone slots
- **B: Stat Chips** — TASKS + COMPLETE chips matching proposal card's VALUE/STAGE AGE chip style, mini progress bar inside the chip, silenced milestones

Common to both: uppercase card heading, silenced empty milestone slots (no "No upcoming milestones." noise), cleaner empty state.

## How to Run

```
python -m http.server 8000
```
`http://localhost:8000/.planning/spikes/021-project-plan-card-refresh/spike.html`

## What to Expect

- Top bar switches between **Current / A / B** — no tab juggling
- Bottom row switches data states: **Screenshot state** (8 tasks, 7%) / **Populated** (milestones, overdue) / **Empty plan** / **Complete**
- Proposal card (Spike 009 winner) visible alongside the plan card for direct comparison
- Financial Summary card as context (static)

## Investigation Trail

- Round 1: Built Current recreation + Variants A and B across 4 data states
- Awaiting user verdict

## Results

_Pending browser verification._
