# Phase 59: TR Display, My Requests Sorting, Timeline Lifecycle & Workspace Responsiveness - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase improves the presentation of Transport Requests in MRF Records and My Requests tables, adds sortable column headers to My Requests, enriches the Timeline modal to capture the full PR/TR rejection and reprocessing lifecycle, and makes Procurement and Finance views fit laptop screens without zooming. No new procurement workflow logic is added — this is purely display and UX improvement.

</domain>

<decisions>
## Implementation Decisions

### TR Status Display in Tables
- TR rows in the MRF Status column show status badges: yellow "Pending", green "Approved", red "Rejected"
- Badge style should match how MRF status badges look (same pill/badge component)
- Currently TR rows show "—" in MRF Status — replace with the appropriate badge based on `finance_status`
- PRs column for TR rows stays as a dash — no change
- TR ID style and formatting stays the same as MRF IDs — no visual distinction needed in the ID cell itself
- Applies to both MRF Records tab and My Requests tab

### Timeline Event Capture
- Rejection reason field already exists on PRs/TRs — just not currently surfaced in Timeline
- Timeline must display: rejection reason + who rejected + timestamp for each rejection event
- When a rejected PR/TR is resubmitted, show a "Resubmitted" event that references the prior rejection
- The full loop must be readable: Submitted → Rejected (reason, actor, timestamp) → Resubmitted → Approved/Rejected again
- Visual redesign: clearer vertical timeline with color-coded event types (approved = green, rejected = red, resubmitted/pending = yellow/orange, created/submitted = blue/grey)
- Keep it as a modal (same trigger — Timeline button) but improve internal layout

### My Requests Sorting
- Sortable columns: MRF ID, Date Needed, MRF Status, Procurement Status
- Click header to sort ascending → click again for descending → toggle
- Sort arrow indicators on sortable headers (↑↓ arrows, active direction highlighted)
- Default sort: Date Needed ascending (soonest date needed at top)
- Sort resets to default when user leaves and returns to My Requests tab

### Responsive Layout
- Root cause: Fixed-width panels/modals that don't shrink on smaller screens
- Target minimum: 1366×768 (13"–14" standard laptop) — must look correct without zooming
- Strategy: Fluid columns — tables and panels resize to fill available space, no hard-coded pixel widths
- Priority: All tabs in both Procurement and Finance views equally
- Focus on PC/laptop views only (mobile optimization is a future phase)

### Claude's Discretion
- Exact badge color shades (should match existing design system: `#059669` green, `#f59e0b` yellow, `#ef4444` red)
- Timeline animation/transition details
- Specific pixel breakpoints within the fluid layout approach
- Which CSS properties to change to achieve fluid column behavior

</decisions>

<specifics>
## Specific Ideas

- The user showed a screenshot of My Requests where the TR row (TR_2026_03-003-TRANSPORT) shows "—" in MRF Status column — this is exactly what needs to become a status badge
- The badge style reference is the existing MRF status badges already in the app (same visual language)
- Timeline redesign: vertical timeline with event-type color coding — not a complete rebuild, just a clearer visual hierarchy within the existing modal

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 59-improve-tr-display-on-mrf-records-and-my-requests-...*
*Context gathered: 2026-03-05*
