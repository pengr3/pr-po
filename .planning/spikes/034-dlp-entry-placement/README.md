---
spike: 034
name: dlp-entry-placement
type: comparison
validates: "Given DLP details become known only post-award/near-completion, when comparing three entry points (tranche editor in project-detail / completion gate step / standalone DLP card), then one placement feels natural and keeps data close to the retention tranche"
verdict: PENDING
related: [033, 035, 036]
tags: [dlp, retention, tranche, ux, project-detail, finance]
---

# Spike 034: DLP Entry Placement

## What This Validates
Given DLP details become known only post-award/near-completion (not at project creation), when the user needs to enter `dlp_months`, `dlp_start_date`, `retention_percentage`, when comparing three entry points, then one placement feels natural without adding cognitive overhead.

## Research

### What is DLP in this context?
Defect Liability Period — the post-completion window (typically 12 months) during which CLMC is responsible for defects. The client withholds a **retention** (typically 10% of contract) until DLP expires cleanly. CLMC doesn't know DLP period or retention % at project creation — it's confirmed in the final contract award or PO.

### The gap
- `collection_tranches` can only be set at project creation (`projects.js` edit modal)
- No DLP fields exist yet on any Firestore collection
- Spike 033 designed the 3-state display (amber/red/green) but deferred the data entry

### Three candidate approaches

| Variant | Entry Point | Pros | Cons |
|---------|-------------|------|------|
| **A — On the Tranche** | Tranche editor in project-detail (new) + DLP fields on retention tranche toggle | Data co-located with billing; Finance and PM both see it; tranche editor also closes the "ongoing edit" gap | Two features coupled (tranche edit + DLP in one spike) |
| **B — Completion Gate Step** | DLP entry embedded in "Mark Completed" 3-step modal | Natural moment — you only know DLP when completing; enforces data entry before closing | PM might skip DLP thinking they'll "do it later"; gate adds friction to completion flow |
| **C — Standalone DLP Card** | Separate card in project-detail, visible after project is Completed | First-class visibility; state-switching UI is clear; can be set any time | Extra card adds layout weight; feels disconnected from billing tranches |

### Chosen approach for spike
Build all three as a variant-switcher demo so user can feel each.

## How to Run
```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/034-dlp-entry-placement/spike.html
```

## What to Expect
- **Variant A:** Project-detail with tranche editor + "◆ Ret." badge on final tranche → click badge to expand DLP fields; tranche editor is accessible while project is On-going
- **Variant B:** "Mark Completed" button → 3-step gate modal → Step 2 is DLP setup with months selector, retention %, start date, auto-calculated expiry
- **Variant C:** "In DLP" status project with standalone DLP card; 3 state chips (amber/red/green); simulate button to toggle states; Edit form on card

## Investigation Trail
- Built A first: feels natural because DLP only applies to the retention tranche — co-locating them makes structural sense. The toggle on the "Final / Retention" row makes it clear which tranche carries DLP semantics.
- Built B: the 3-step gate is polished and the placement (at completion) is the right timing. But if a project is completed without a DLP-configured tranche, Finance has to chase the PM.
- Built C: standalone card gives DLP the most visibility but adds a new card to the layout. Works best for projects already in DLP state; less natural for entry.

## Results
Verdict: PENDING — awaiting user review.

Key question for user: Does the "retention tranche toggle" approach (Variant A) feel natural enough for Finance, or should DLP be entered as a dedicated step at project completion (Variant B)?

Secondary question: Are DLP fields project-level or tranche-level? Variant A stores on the tranche; Variants B/C store on the project document.
