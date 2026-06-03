# Phase 98: UI/UX Fixes — Client Contact Split, Notifications Alignment, Payables PO Ref, Home Widget Fit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 98-ui-fixes-client-contact-notifications-payables-home
**Areas discussed:** Client contact split, Notifications layout, Payables Ref link, Home wide-screen fit

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Client contact split | Migrate legacy? required/optional? email validation? | ✓ |
| Notifications layout | Inline vs stacked, long-message handling, page width | ✓ |
| Payables Ref link | Where non-PO (TR / delivery-fee) rows link | ✓ |
| Home wide-screen | Cap/spread/reflow approach | ✓ |

**User's choice:** All four areas.

---

## Client contact split

**Q1 — Legacy `contact_details` handling**

| Option | Description | Selected |
|--------|-------------|----------|
| Leave legacy, split forward | Old clients keep `contact_details` as read-only fallback; new/edited use Phone+Email; zero data touched | ✓ |
| Best-effort auto-migrate | One-time regex parse of `contact_details` into Phone/Email | |
| Blank old, re-enter manually | Split now; old clients show empty until edited | |

**Q2 — Phone/Email required?**

| Option | Description | Selected |
|--------|-------------|----------|
| At least one required | Form requires Phone OR Email — mirrors today's required contact | ✓ |
| Both optional | Neither required | |
| Both required | Every client must have both | |

**Q3 — Email-format validation**

| Option | Description | Selected |
|--------|-------------|----------|
| Light / none | Free-text, no blocking (current behavior) | |
| Soft validate | Warn but allow save | |
| Strict validate | Block save on malformed email | ✓ |

**User's choice:** Leave legacy fallback + split forward; at least one of Phone/Email required; strict email validation.
**Notes:** Strict email + at-least-one-required combine as: require (phone OR email); if email is non-empty it must be well-formed; phone alone is a valid save.

---

## Notifications layout

**Q1 — Target row layout / long-message handling** *(initial 3-option question with previews was rejected; user clarified in free text)*

**User's choice (free text):** "It's current format is okay, just align the items as you can see they are not aligned."
**Notes:** No layout redesign wanted. Keep the current inline row format; the only fix is alignment — type-label + icon become a fixed-width left column so all message text starts at the same x-position, and time + ✓ stay consistently right-aligned. Truncation/wrap behavior left as-is beyond what alignment requires.

---

## Payables Ref link

**Q1 — Where the Ref link opens per row type**

| Option | Description | Selected |
|--------|-------------|----------|
| Route by type | PO → PO detail; TR → TR detail modal; standalone delivery-fee → plain text, no link | ✓ |
| PO rows only | Only PO-linked rows clickable; TR + delivery-fee shown as plain text | |
| Open RFP detail | Any Ref click opens the RFP/payment detail instead | |

**User's choice:** Route by type.
**Notes:** Full parity. The underlying doc-fetch bug is fixed in planning; this decision governs link target per row type across both Payables tables.

---

## Home wide-screen fit

**Q1 — Actual symptom on the wide monitor**

| Option | Description | Selected |
|--------|-------------|----------|
| Too much empty space | Narrow 1200px column, big blank margins | |
| Something gets cut off | A widget overflows/clips | |
| Too much vertical scrolling | Widgets stack tall | |
| (free text) | "the 'Hero' with the 5 widgets does not fit the screen on load, it would be perfect if it fit perfectly" (+ screenshot) | ✓ |

**Q2 — Layout approach** *(reformulated after the screenshot revealed the symptom is vertical, not horizontal)*

| Option | Description | Selected |
|--------|-------------|----------|
| One row of 5 | All five tiles in one row; widen container | |
| Keep 3 + 2, compress | Preserve grouping; shrink padding/icon/title + spacing so both rows fit on load | ✓ |

**User's choice:** Keep 3 + 2, compress vertically.
**Notes:** First approach question (cap/spread/reflow) was based on a wrong horizontal-dead-space read; the attached Home screenshot showed the top 3 tiles fitting but Procurement + Finance clipped below the fold. Reformulated to a vertical-fit question. Fix = vertical compression, keep 3+2, width cap unchanged.

---

## Claude's Discretion

- Exact fixed-column width for the notification label column (size to longest label).
- Exact reduced padding/font/icon values for Home tile compression.
- Whether to shrink the Home hero title to reclaim vertical space.

## Deferred Ideas

None — discussion stayed within the four scoped slices.
