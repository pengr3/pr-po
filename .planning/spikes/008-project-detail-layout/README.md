---
spike: 008
name: project-detail-layout
type: standard
validates: "Given the project detail page has excessive whitespace across stacked cards, when we reorganize into a compact 2-column layout with conditional plan/proposal visibility, then the page fits significantly more information without scrolling and status-irrelevant cards are hidden"
verdict: VALIDATED ✓
related: []
tags: [layout, ux, project-detail, whitespace, responsive]
---

# Spike 008: Project Detail Layout Redesign

## What This Validates
Given the current layout stacks 3 full-width cards vertically with 1.5rem padding throughout, when we apply Concept B (header strip + side-by-side Info/Financial cards + conditional bottom row), then vertical scroll is reduced ~50% and the page feels appropriately dense.

## Results

**Verdict: VALIDATED ✓ — Concept B chosen**

### Chosen layout (Concept B)

**Header strip (single row):**
- Active/Inactive badge (clickable toggle)
- Project Code (read-only, monospace)
- Status dropdown (inline — eliminates dedicated Status card)
- Edit History button + Export CSV button (right-aligned)

**Main row (2 equal columns):**
- Left: Project Information card — Name, Client, Location, Personnel
- Right: Financial Summary card — Budget/Contract inputs + 6 computed stat chips (3×2 grid)

**Bottom row (conditional):**
| Status | Proposal slot | Plan slot |
|---|---|---|
| For Inspection / Loss | — | — (hidden) |
| For Proposal+ (no doc yet) | — | Plan card full-width |
| For Proposal + canDrive | CTA card (dashed blue) | Plan card half-width |
| Active proposal | Proposal card | Plan card half-width |

### Key decisions
- **Status card eliminated** — merged into header strip as an inline `<select>`
- **Plan card is conditional** — hidden for `For Inspection` and `Loss` only; visible from `For Proposal` onwards (some projects need Gantt for the proposal itself)
- **Plan card width adapts** — full-width when no proposal slot, half-width when proposal slot has content
- **Financial stats as chips** — 6 computed values rendered as compact `background:#f8fafc` stat chips in a 3-column grid, not full form-group rows
- **Padding reduced** — `1.5rem` → `0.75rem 1rem` throughout; `gap: 1rem` → `0.4rem 0.75rem`

## Implementation Notes

```javascript
// Plan visibility
const PLAN_HIDDEN_STATUSES = new Set(['For Inspection', 'Loss']);
const showPlanCard = !PLAN_HIDDEN_STATUSES.has(currentProject.project_status);

// Bottom row: proposal slot injected dynamically by loadProposalCard
// Plan card wraps in a flex/grid container only when proposal slot is visible
```

The `proposalInlineCard` div already handles its own show/hide via `loadProposalCard`. The plan card wrapper needs to respond to whether the proposal slot is occupied — simplest approach: `loadProposalCard` toggles a class on the bottom row container after injecting content.
