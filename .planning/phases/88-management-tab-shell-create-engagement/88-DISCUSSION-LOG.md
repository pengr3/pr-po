# Phase 88 Discussion Log

**Date:** 2026-05-11
**Mode:** /gsd-discuss-phase 88 (default mode, multi-select gray-area selection)

## Areas Discussed

User selected (multi-select): nav placement, form pattern, reuse vs duplicate, default initial project_status. User additionally renamed the tab from "Management" to "Proposals" during the multi-select response.

### 1. Tab name (out-of-band rename)

User direction: "Let's rename management tab as proposals."

Captured as D-01. The MGMT-* requirement IDs continue to apply for traceability; only the user-facing label changes. Phase 89's ROADMAP-stub name will need a parallel rename when 89 starts (noted in specifics).

### 2. Nav placement

**Question:** Where the Proposals tab sits in the top-nav strip.

**Options:**
- Right of 'Finance', left of 'Admin' (Recommended)
- Right of 'Admin'
- As a sub-link inside the Admin dropdown

**Selection:** Right of 'Finance', left of 'Admin'. Captured as D-02.

### 3. Create Engagement form pattern

**Question:** Inline section vs modal vs sub-route.

**Options:**
- Inline section on the Proposals tab (Recommended)
- Modal opened by a 'New Engagement' button
- Sub-route #/proposals/new

**Selection:** Inline section. Captured as D-03 plus the locked top-down section ordering (New Engagement → queue → dashboard) for downstream phases.

### 4. Reuse existing create flow or duplicate?

**Question:** How to share logic between existing projects.js / services.js create and the new Proposals-tab form.

**Options:**
- Extract a shared helper used by both surfaces (Recommended)
- Duplicate the form, keep both surfaces independent
- Replace existing create entry points entirely

**Selection:** Extract a shared helper (proposed `app/engagement-create.js`). Refactor existing call sites in the same phase. Captured as D-04.

### 5. Default initial project_status for new engagements

**Question:** What status string a brand-new engagement starts with.

**Options:**
- 'Draft' — work in progress, no proposal yet (Recommended)
- 'For Mobilization' — ready to start work
- User picks the status on the form

**Selection:** 'Draft'. Captured as D-05. Researcher must verify all consuming views handle the new status string gracefully (procurement.js, finance.js, home.js, projects.js, services.js).

## Deferred Ideas

- Replacing existing project/service create entry points (today both stay, sharing logic).
- Engagement templates (preset budgets/personnel).
- Bulk CSV import.
- Status-workflow editor.
- Custom claims for role gating.
- Activity timeline on Proposals tab landing.

## Claude's Discretion

- Inline form HTML structure (collapsible vs always-expanded).
- Currency-input decoration.
- Submit button copy + post-submit toast.
- Form clear-after-submit behavior.
- Mobile layout below ~768px.
- User picker lazy-load timing.
- Status-badge CSS class for the new "Draft" status.

## Outcome

CONTEXT.md written to `.planning/phases/88-management-tab-shell-create-engagement/88-CONTEXT.md`. Phase 88 is unblocked and ready to plan. Recommended next step: `/gsd-plan-phase 88`.
