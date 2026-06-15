---
spike: 009
name: proposal-card-redesign
type: comparison
validates: "Given the proposal card is visually behind the other project-detail cards, when redesigned with a progress track (Concept B) and title-first stat-chip data section (Alt B), then the card feels as polished as the Project Plan card next to it"
verdict: VALIDATED ✓ — Concept B + Alt B
related: [008]
tags: [ux, layout, proposal, project-detail, design]
---

# Spike 009: Proposal Card Redesign

## What This Validates
The inline proposal card in project/service detail is visually behind the rest of the project detail cards: no heading, tiny dot+label for status, ID displayed above the title, and noisy empty-state text ("No attachment", "No comms yet"). This spike validated the full redesign across two axes — overall card structure, then data section layout.

## Results

**Verdict: VALIDATED ✓**

### Chosen design: Concept B + Alt B

**Card structure — Concept B (progress track):**
- Card header: `PROPOSAL` heading (uppercase, matches `PROJECT PLAN` card style)
- 4-node stage track below header: Draft → Internal Review → Client Review → Approved
  - Completed stages: filled blue dot with check icon
  - Active stage: ring glow (blue for normal, orange for revision)
  - Loss: track replaced with a red `✕ Loss — Proposal closed` badge
- Overdue (>7d in stage): amber left border on the whole card

**Data section — Alt B (title-first + stat chips):**
| Element | Treatment |
|---------|-----------|
| Title | First, 15px bold — most important, now leads |
| ID + version | Secondary, below title, monospace faint — tracking ref not primary focus |
| Value chip | `#f8fafc` stat chip with `VALUE` label, full PHP amount |
| Stage Age chip | Same style; turns amber (`#fffbeb` bg, `#92400e` text) when overdue + shows "needs attention" sub-line |
| Attachment | Only rendered when present — `📎 hostname` link row |
| Latest comms | Only rendered when present — `💬 date · excerpt` row |
| Empty states | Not shown — "No attachment" / "No comms yet" removed as noise |

**Footer:**
- `Submit for Approval` (primary, left) — shown only for canDrive + draft/for_revision states
- `View Proposal` (outline) — always present when a proposal exists

### Why Concept B + Alt B beats the current card
1. **Status position is immediately scannable** — track shows where in the workflow without reading a label
2. **Title leads** — users identify proposals by name, not ID
3. **Stat chips match Financial Summary** — consistent design language, both cards in the same bottom row now feel paired
4. **Silences empty state noise** — no "No attachment" text when nothing is attached
5. **Loss is a first-class state** — not crammed into the normal track

## How to Run
```
python -m http.server 8000
```
`http://localhost:8000/.planning/spikes/009-proposal-card-redesign/spike.html`

## Implementation Notes

**What changes in `renderInlineProposalCard()` (project-detail.js):**
- Add track HTML above the data section (4 nodes, drive from `STATUS_META[status].trackIdx`)
- Reorder data: title → ID+version → chips row → info rows
- Replace `.proposal-inline-card__header` dot+label with the track
- Add card heading via `loadProposalCard` (wrap in a card with heading, or add heading to the card HTML in `renderInlineProposalCard`)
- Kill `_renderCardAttachment` / `_renderCardLatestComms` empty-state branches — hide row rather than show "None" text

**New CSS classes needed (in `components.css`):**
- `.proposal-card-track` — track wrapper with border-bottom
- `.proposal-track-node` — flex column node
- `.proposal-chip-row` — flex gap-8 row
- `.proposal-stat-chip` — matches financial summary chip style
- `.proposal-stat-chip.chip-warn` — amber overdue variant

**Loss state:** `STATUS_META.loss.trackIdx === -1` → render badge instead of track.
**for_revision:** `trackIdx: 2` with `warn: true` → orange ring on client review node.

## Investigation Trail
- Round 1: Built Concept A (pill) vs Concept B (track) — user chose B
- Round 2: With Concept B as base, built 3 data section variants — Current (ID first), Alt A (title-first + labeled stat row with divider), Alt B (title-first + stat chips matching Financial Summary style) — user chose Alt B
