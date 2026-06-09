# Project Detail Layout

## Requirements

- **Concept B chosen** — header strip + 2-column main row + conditional bottom row
- Status card eliminated — merged into header strip as an inline `<select>`
- Plan card conditional — hidden only for `For Inspection` and `Loss` statuses
- Plan card width adapts — full-width when no proposal slot, half-width when proposal slot has content
- Padding reduced from `1.5rem` to `0.75rem 1rem`; gap from `1rem` to `0.4rem 0.75rem`

## How to Build It

### Layout Structure

```html
<!-- Header strip: Active/Inactive · Code · Status dropdown · Edit History · Export CSV -->
<div class="project-header-strip">
    <span class="active-badge" onclick="window.toggleActive()">...</span>
    <span class="project-code">CLMC-BLDG-001</span>
    <select id="statusSelect" onchange="window.saveField('project_status', this.value)">...</select>
    <div class="header-actions">
        <button>Edit History</button>
        <button>Export CSV</button>
    </div>
</div>

<!-- Main 2-col row: Info | Financial -->
<div class="project-main-row">
    <div class="project-info-card card">...</div>
    <div class="project-financial-card card">...</div>
</div>

<!-- Bottom row: Proposal slot + Plan card (conditional) -->
<div id="bottomRow" class="project-bottom-row">
    <div id="proposalInlineCard"></div>
    <div id="planCardSlot" class="plan-card-slot">...</div>
</div>
```

### Plan Visibility Logic

```javascript
const PLAN_HIDDEN_STATUSES = new Set(['For Inspection', 'Loss']);
const showPlanCard = !PLAN_HIDDEN_STATUSES.has(currentProject.project_status);
document.getElementById('planCardSlot').style.display = showPlanCard ? '' : 'none';
```

### Bottom Row Sync — `syncBottomRow()`

Called by `loadProposalCard()` after it injects or hides the proposal slot. Adjusts plan card width based on whether the proposal slot is occupied.

```javascript
function syncBottomRow() {
    const bottomRow = document.getElementById('bottomRow');
    const proposalEl = document.getElementById('proposalInlineCard');
    const proposalVisible = proposalEl && proposalEl.style.display !== 'none' && proposalEl.innerHTML.trim() !== '';

    if (proposalVisible) {
        bottomRow.style.gridTemplateColumns = '1fr 1fr'; // side-by-side
    } else {
        bottomRow.style.gridTemplateColumns = '1fr';     // plan takes full width
    }
}
```

### Bottom Row State Table

| Project Status | Proposal Slot | Plan Card |
|---|---|---|
| For Inspection / Loss | hidden | hidden |
| For Proposal (no doc, canDrive) | CTA card (dashed blue) | half-width |
| For Proposal (no doc, view only) | placeholder | half-width |
| For Proposal+ (with proposal) | Proposal card | half-width |

### CSS

```css
.project-bottom-row {
    display: grid;
    grid-template-columns: 1fr; /* default; syncBottomRow() overrides to 1fr 1fr */
    gap: 0.75rem;
}
.project-main-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
}
```

## What to Avoid

- **Stacking 3 full-width cards vertically** — produces ~50% more scroll than the 2-col layout
- **Separate "Status" card** — merged into header strip; the card was empty space
- **Always-showing Plan card** — hide it for pre-proposal statuses; plan is irrelevant before `For Proposal`
- **Fixed bottom row grid** — must sync with proposal slot visibility; hardcoded `1fr 1fr` breaks when proposal is absent

## Constraints

- `syncBottomRow()` must be called every time `loadProposalCard()` completes (both success and empty-state paths)
- Plan card hidden statuses are `['For Inspection', 'Loss']` — all other statuses show the plan card

## Origin

Synthesized from spike: 008
Source files: `sources/008-project-detail-layout/`
