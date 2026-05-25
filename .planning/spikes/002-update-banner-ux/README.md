---
spike: "002"
name: update-banner-ux
type: standard
validates: "Given a version change is detected, when the banner renders, then the user can see and dismiss it without disrupting their active workflow"
verdict: PENDING
related: ["001"]
tags: [ux, banner, notification, design, dismissible]
---

# Spike 002: Update Banner UX

## What This Validates
Given the ETag poll (Spike 001) has detected a new version, when we render the notification, which UX pattern is least disruptive while still being reliably noticed? Three variants are compared side-by-side.

## Research

| Variant | Pattern | Pros | Cons |
|---------|---------|------|------|
| A | Fixed top strip (full-width, slides in above nav) | Hard to miss; widely understood convention (GitHub, Vercel) | Shifts content; slightly more aggressive |
| B | Bottom-right toast | Unobtrusive; doesn't shift layout | Can be missed; overlaps bottom content |
| C | Nav badge + click-to-expand popover | Least disruptive; familiar pattern | Easiest to miss entirely |

**Criteria for winner:** Must be noticeable without demanding attention. Users in the middle of filling a form should not have their layout disrupted mid-action.

## How to Run
1. From project root: `python -m http.server 8000`
2. Open: `http://localhost:8000/.planning/spikes/002-update-banner-ux/spike.html`
3. Use the control panel (bottom-left) to trigger each variant
4. Try each one and pick the pattern that feels right

## What to Expect
- A mock of the CLMC app (nav + content) is shown
- Clicking A/B/C in the control panel triggers that notification variant
- "Refresh Now" reloads the page; "Dismiss/Later" hides the notification
- Variant C shows a dot on the nav bar; clicking it opens a small popover

## Investigation Trail
— (to be filled during run)

## Results
— (to be filled after user picks preferred variant)
