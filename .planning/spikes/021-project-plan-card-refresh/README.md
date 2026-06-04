---
spike: 021
name: project-plan-card-refresh
type: comparison
validates: "Given the Project Plan card feels visually dated after the Proposal card was redesigned (Spike 009), when redesigned with (A) a progress bar hero or (B) stat chips matching the proposal card's design language, then the right column feels visually paired and project status is scannable without clutter"
verdict: VALIDATED ✓ WINNER — Variant A (progress bar)
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
- Round 2: User chose Variant A (progress bar)

## Results

**Verdict: VALIDATED ✓ WINNER — Variant A (progress bar)**

**Chosen design:** Variant A — progress bar hero

| Element | Treatment |
|---------|-----------|
| Card heading | Uppercase `PROJECT PLAN` label (10px, tracking, muted) — matches proposal card |
| Progress bar | Full-width, 8px rounded track, blue fill; turns green at 100% |
| Progress text | "N of M tasks complete" left · "X%" right, below bar |
| Chips | Compact rounded pill chips: task count + overdue (amber, hidden when 0) |
| Milestone rows | Colored dot + label + value; next/ongoing hidden when empty; recent shows "—" |
| Empty state | Centered "No tasks yet" + Open Plan button only — no stats shown |
| Footer | "Open Plan" button, right-aligned |

**Rejected:** Variant B (stat chips) — visually consistent with proposal card but the progress bar gives more immediate status signal.

## Implementation Notes

**Changes to `project-detail.js`:**
- Replace `planCardHtml` template (lines 386–424) with Variant A HTML
- Heading: `<div class="plan-card-heading-label">Project Plan</div>` inside `.card-header`
- Progress bar: `<div class="plan-progress-track"><div class="plan-progress-fill" style="width:${pct}%"></div></div>`
- Text below bar: `${doneCount} of ${taskCount} tasks complete` · `${pct}%`
- Chips row: task count pill + overdue pill (amber, only if overdueCount > 0)
- Milestone rows: three rows using `va-milestone-*` pattern; next/ongoing hidden when null; recent shows "—" when null
- Empty state: taskCount === 0 → skip stats, show centered CTA only
- `updatePlanCard()` patcher (line 225): update IDs to match new DOM elements

**New CSS (add to `views.css` or `components.css`):**
- `.plan-progress-track` — full-width, 8px, border-radius 99px, bg #f1f5f9
- `.plan-progress-fill` — height 100%, border-radius 99px, bg #1a73e8; `.complete` → #10b981
- `.plan-progress-text` — flex space-between, 11px, color #64748b
- `.plan-chip` — inline-flex, rounded pill, bg #f1f5f9, border #e2e8f0, 12px
- `.plan-chip.overdue` — bg #fffbeb, border #fcd34d, color #92400e
- `.plan-milestone-dot` — 6px circle, colors: done=#10b981, upcoming=#1a73e8, ongoing=#f97316, empty=#e2e8f0
- `.plan-milestone-label` — 10px uppercase, color #94a3b8
- `.plan-milestone-value.empty` — color #cbd5e1, font-style italic
