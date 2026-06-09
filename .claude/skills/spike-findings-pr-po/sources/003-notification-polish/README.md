---
spike: 003
name: notification-icon-set
type: comparison
validates: "Given 16 notification types each get a unique SVG icon, when rendered in the type badge, then all types are visually distinct and consistent across platforms"
verdict: VALIDATED
related: [002]
tags: [icons, svg, notification, design, polish]
---

# Spike 003a/b: Notification Icon Set

## What This Validates

**Given** 16 notification types in TYPE_META  
**When** each gets a unique SVG icon instead of the current text/emoji mix  
**Then** all types are visually distinct and crisp at 16px badge size on Windows and Mac

## Research

### Current state pain points

| Problem | Impact |
|---------|--------|
| `⏳` (REGISTRATION_PENDING) and `📦` (PO_DELIVERED) are emoji | Render at inconsistent sizes and with OS-specific color/design (Windows yellow 🎨 vs Mac yellow 🎨 differ) |
| `✓` used for MRF_APPROVED + PR_DECIDED + TR_DECIDED | No visual distinction between "MRF approved" and "PR decision" — same icon, different meaning |
| `$` used for PROJECT_COST_CHANGED + RFP_PAID + COLLECTIBLE_CREATED | Same issue — three unrelated events share one icon |
| `!` used for PR/TR/RFP review needed | All three "review needed" types look identical |
| Text chars (`✕`, `↻`, `→`, `★`) render at browser font size | Size/weight varies by OS font stack |

### Approach comparison

| Approach | Method | Pros | Cons |
|----------|--------|------|------|
| **003a: Inline SVG** | SVG string in `TYPE_META.icon` field, rendered via innerHTML | Self-contained, no index.html changes needed | Longer strings in TYPE_META |
| **003b: SVG symbol** | `<symbol>` defs in index.html, referenced via `<use href="#id">` | Clean TYPE_META entries, true single source | Requires index.html modification |

### Chosen icon set (Heroicons outline, 24x24 viewBox, stroke-width 1.75)

| Type | Old icon | New icon | Reasoning |
|------|----------|----------|-----------|
| MRF_APPROVED | `✓` | check mark | Simple check, thin stroke |
| MRF_REJECTED | `✕` | X mark | Simple X |
| PR_REVIEW_NEEDED | `!` | exclamation in circle | Circle frames the alert |
| TR_REVIEW_NEEDED | `!` | truck | Transport/logistics visual |
| RFP_REVIEW_NEEDED | `!` | document with magnify | Document review context |
| PROJECT_STATUS_CHANGED | `↻` | rotating arrows | Refresh/change |
| PROJECT_COST_CHANGED | `$` | dollar in circle | Cost, not payment |
| REGISTRATION_PENDING | `⏳` | user-plus | New user joining |
| PROPOSAL_SUBMITTED | `→` | paper plane (send) | Submitted/sent |
| PROPOSAL_DECIDED | `★` | star | Decision/outcome |
| MRF_SUBMITTED | `+` | document-plus | New document created |
| PR_DECIDED | `✓` | check in circle | Decided, enclosed |
| TR_DECIDED | `✓` | badge-check (star-circle) | Credentialed decision |
| RFP_PAID | `$` | banknotes | Money received |
| PO_DELIVERED | `📦` | archive box | Delivered/stored |
| COLLECTIBLE_CREATED | `$` | coin | Money-in, circular |

## How to Run

```bash
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/003-notification-polish/spike.html
```

## What to Expect

- **Left panel:** Current notification dropdown with 16 types using existing text/emoji icons
- **Right panel:** Same 16 types with SVG icons (toggle 003a/003b using controls — visually identical)
- **Controls (bottom-left):**
  - Toggle between 003a (inline SVG) and 003b (symbol defs) implementation
  - Toggle unread state on first 4 rows
- **Code panel:** Shows the TYPE_META diff between the two approaches

## Investigation Trail

### Session 1 (2026-05-25)
- System analysis: 16 types in TYPE_META, 3 icon conflicts (✓×3, $×3, !×3), 2 emoji (⏳, 📦)
- Double-header bug fixed (commit f44df1e) — renderDropdownRows was injecting its own header into a container that already had a static header in index.html
- Mark-read button DOM-omitted on read rows (not `visibility:hidden`) to avoid dead space
- Decision: DOM-omit is better than hide; investigate icon inconsistency as the core look spike

### Session 2 (2026-05-26)
- Built spike.html with side-by-side OLD vs NEW comparison
- Used Heroicons outline set (24x24, stroke-width 1.75, round linecap/linejoin) for consistency
- 003a approach: inline SVG in TYPE_META.icon — zero change to renderDropdownRows template needed
- 003b approach: `<symbol>` defs in HTML, `<use>` references in TYPE_META — identical visual result

## Results

**VALIDATED ✓** — SVG icons confirmed visually distinct and consistent across all 16 types.

| Question | Answer |
|----------|--------|
| Overall consistency vs text/emoji? | Yes — uniform stroke weight, no emoji size jumps |
| Any icons too small/unrecognizable at badge size? | No — all 16 readable |
| Three "review needed" types distinct? | Yes — PR circle-!, TR truck, RFP doc+magnify |
| Three green check-like icons distinct? | Yes — plain check / check-circle / badge-check burst |
| Three green dollar-like icons distinct? | Yes — dollar-circle / banknotes / coin |
| 003a vs 003b visual difference? | None — identical output, implementation choice only |

**Recommendation: 003a (inline SVG)** — self-contained TYPE_META entries, zero index.html changes needed, the longer string cost is irrelevant in a zero-build SPA.
