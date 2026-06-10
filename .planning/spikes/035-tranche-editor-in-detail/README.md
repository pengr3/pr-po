---
spike: 035
name: tranche-editor-in-detail
type: standard
validates: "Given a project with no collection_tranches while status is On-going, when PM/Finance opens project-detail, then they can add/edit tranches inline without going back to the Projects list edit modal"
verdict: PENDING
related: [034, 036]
tags: [tranche, project-detail, finance, dlp, ux, inline-edit]
---

# Spike 035: Inline Tranche Editor in Project-Detail

## What This Validates
Given a project is On-going and has no `collection_tranches` (or needs them modified), when PM/Finance opens project-detail, then they can add, label, and percentage-allocate tranches without navigating to the Projects list edit modal — closing the "ongoing project can't configure billing tranches" gap.

## Research

### The gap (confirmed in codebase exploration)
- `collection_tranches` is written only from `projects.js` edit modal (lines 682-1165)
- `project-detail.js` has no write path for tranches — read-only display only
- Once a project is `On-going`, PM cannot add or adjust the tranche split
- The Projects list edit modal is the only UI — requires navigating away from the project context

### What the editor needs
1. Read existing `collection_tranches` from project document
2. Allow add/remove rows (label + percentage)
3. Flag one tranche as "Retention tranche" — expands DLP sub-fields
4. Validate: total must be 100%, all labels filled
5. Save back to `projects/{docId}` → `collection_tranches`
6. Also save DLP fields if retention tranche is flagged: `dlp_months`, `dlp_start_date`, `retention_percentage` (on project doc or on the tranche, TBD by Spike 034 decision)

### Where in the layout
Below the financial summary bar, in the same Financial card — consistent with existing "Collection Tranches" display already present in the finance card.

## How to Run
```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/035-tranche-editor-in-detail/spike.html
```

## What to Expect
Three scenarios via top switcher:
- **No tranches set**: shows CTA prompt "Set Up Tranches" button → opens inline editor
- **Partial (2 tranches)**: shows read-only display + "Edit Tranches" button → opens editor pre-filled
- **Full (4 tranches + retention)**: shows read-only with retention badge; editor shows DLP sub-fields below editor list

Key interactions:
1. "Ret?" toggle on any row → marks it the retention tranche → DLP fields appear below the list
2. DLP fields: Retention %, DLP months selector, DLP expiry auto-calculated from completion date
3. Total bar turns green at exactly 100%
4. Save validates completeness; logs Firestore write summary to log pane

## Investigation Trail
- The inline editor pattern (expand below the section header) matches the lifecycle accordion from Spike 030 and feels native in the project-detail layout
- One retention tranche only enforced — toggling one removes the flag from others; this models the real-world constraint
- DLP fields appear below the entire editor list (not inline on the row) because DLP is project-level info attached to the retention concept, not the tranche row itself
- The "Ret?" toggle approach is lighter than a separate "Add Retention Tranche" button — it works with whatever the user names their final tranche

## Results
Verdict: PENDING — awaiting user review.

Key question: Should the "Edit Tranches" button live in the financial card, or does it need a dedicated "Billing Setup" section? The spike shows it in the financial card as the most contextually relevant location.
