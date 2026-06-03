---
sketch: 005
name: fee-edge-validation-states
question: "How should the fee controls behave in edge & error states — positive-only validation, and the existing blocked-RFP guards?"
winner: null
tags: [rfp, fees, validation, edge-states, behavior]
---

# Sketch 005: Fee Edge & Validation States

## Design Question
Phase 91.3 must ship "100% error-free" (SC #5) and enforces positive-only fees (D-05). This is a **behavior reference**, not a design fork — it cycles the winning modal through the states the planner must implement. Review/approve the behaviors rather than picking a winner.

## How to View
open .planning/sketches/005-fee-edge-validation-states/index.html

Use the **state** buttons in the top bar to cycle. In "Invalid fee", edit the value to a positive number to watch the error clear and Submit re-enable.

## States
- **Empty (default)** — no fees; section is just chips; total hidden; Submit enabled. The clean baseline for the common no-fee RFP.
- **Valid + fees** — a Transfer fee + a Misc "Notary" line; live total = base + fees; Submit enabled.
- **Invalid fee** — a 0 / negative amount flags the field inline ("Amount must be greater than ₱0."), shows a footer alert, and **disables Submit** until fixed (D-05 positive-only). Live-validates as you type.
- **Blocked · delivery-fee exists** — reuses the existing one-per-PO guard: red banner, form dimmed, Submit disabled.
- **Blocked · all tranches used** — existing guard: banner shown, tranche locked, Submit disabled.

## What to Look For
- Is **inline field error + footer alert + disabled Submit** the right firmness for an invalid fee, or too aggressive?
- Should an empty fee field simply be ignored (treated as "not applied") — yes, per D-05 — confirm that reads naturally vs. requiring an explicit 0.
- Do the **new fee controls coexist cleanly with the existing blocked-RFP banners** without layout breakage (the "ship error-free" concern)?
- Mobile: error messages and the dimmed/blocked states at 390px.
