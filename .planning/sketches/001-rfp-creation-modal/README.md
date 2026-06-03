---
sketch: 001
name: rfp-creation-modal
question: "How should the new Fees section sit in the overhauled sectioned RFP modal, and how should the live running total read?"
winner: "B"
tags: [rfp, modal, fees, form, mobile]
---

> **Winner: Variant B — Progressive disclosure.** Fees section stays clean (just "+ add fee" chips) for the common no-fee RFP; fields and the live total appear only when a fee is added. Sectioned modal (Reference → Base → Fees → Payment) confirmed.

# Sketch 001: RFP Creation Modal w/ Fees

## Design Question
The RFP creation modal is being overhauled (Phase 91.3) into a sectioned, mobile-friendly layout — **Reference → Base Amount → Fees → Payment Details** — with new optional Transfer/Cash-Out fees, repeatable Miscellaneous fee lines, and a live running grand total. This sketch tests **how the Fees section should behave** and **where/how the running total reads**.

## How to View
open .planning/sketches/001-rfp-creation-modal/index.html

Use the **view** toggle (bottom-right) to switch Phone / Tablet / Desktop. Type in the fee fields and add misc lines — the total updates live.

## Variants
- **A: Always-visible** — Transfer & Cash-Out fields are always shown in the Fees section (blank = not applied); "+ Add miscellaneous fee" appends label+amount rows. Running total sits at the bottom of the Fees section + echoed in the footer with an "incl. fees" pill.
- **B: Progressive disclosure** — Fees section starts as just three "add" chips, keeping the common no-fee case clean. Tapping a chip reveals that field (with a × to remove). Total block + "incl. fees" pill appear only once a fee exists; otherwise a muted "No fees added" hint.
- **C: Boxed card + sticky total bar** — Fees grouped in a tinted card; a persistent total bar between the body and footer always shows `Base + Fees = Total` as you type.

## What to Look For
- **Default cleanliness vs discoverability:** Does B's empty state feel cleaner, or does A/C's always-present fee fields make the feature more discoverable for the operator?
- **Where the total belongs:** inline at the end of Fees (A), conditional (B), or a persistent sticky bar (C)?
- **Mobile (Phone 390px):** do the fee rows, the `₱`-prefixed right-aligned amounts, and the total still read well and stay touch-friendly?
- **The "incl. fees" cue** — preview of the downstream concept explored fully in sketch 002.
- Section numbering/headers — do they make the overhaul feel structured without adding clutter?
