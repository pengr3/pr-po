---
slug: pcr-plan-card-021a-022c
status: in-progress
created: 2026-06-04
---

# Plan Card Redesign — Spike 021A + 022C

Implement the validated Spike 021A (progress bar) + 022C (Combined: health badge + overdue + upcoming) design into project-detail.js.

## Files to change
- `app/views/project-detail.js` — refactor computeProjectProgress, add buildPlanCardHtml(), update ensureTasksListener, update destroy()
- `styles/views.css` — replace old plan-card styles with new CSS

## Steps
1. Add new CSS classes to views.css (replace old plan-card block)
2. Update currentProjectProgress shape + computeProjectProgress()
3. Add buildPlanCardHtml() function
4. Replace planCardHtml local var with buildPlanCardHtml()
5. Update ensureTasksListener to re-render card via id="projectPlanCard"
6. Update destroy() reset to new shape
