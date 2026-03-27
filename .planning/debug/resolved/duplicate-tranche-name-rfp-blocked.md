---
status: resolved
trigger: "duplicate-tranche-name-rfp-blocked"
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — openRFPModal uses a Set of tranche labels (usedTrancheLabels) to decide which tranche options are disabled. Two tranches with the same label both appear "used" after just one is filed, because label is used as the key, not index.
test: N/A — root cause confirmed by direct code reading
expecting: N/A
next_action: Apply fix — add tranche_index to RFP doc on submit; use index-based deduplication in openRFPModal

## Symptoms

expected: Each payment tranche should be independently RFP-able, even if two tranches share the same name (e.g., two "Progress billing" at 30% each). Filing RFP for tranche #1 should not prevent filing RFP for tranche #2.
actual: When the first "Progress billing" tranche is filed as an RFP, the second "Progress billing" tranche cannot be filed — it appears blocked or treated as already paid/filed.
errors: No explicit error reported — the RFP option is simply unavailable or the tranche is treated as already filed.
reproduction: Create a PO with 4 tranches: Downpayment 30%, Progress billing 30%, Progress billing 30%, Retention 10%. File an RFP for the first "Progress billing". Then attempt to file an RFP for the second "Progress billing" — it will be blocked.
started: Likely always been this way — duplicate tranche names were not an anticipated case.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-27T00:00:00Z
  checked: procurement.js openRFPModal() lines 437-446
  found: const usedTrancheLabels = new Set(existingRFPs.map(r => r.tranche_label)); — builds dedup set from label strings. Then: const used = usedTrancheLabels.has(t.label); — disables any tranche whose label matches a filed RFP's label. With two "Progress billing" tranches, filing the first adds "Progress billing" to the set, which then also disables the second.
  implication: Root cause confirmed. The dedup check is name-based, not index-based.

- timestamp: 2026-03-27T00:00:00Z
  checked: procurement.js submitRFP() lines 935-956
  found: rfpDoc stores tranche_label and tranche_percentage but NOT tranche_index. No positional information is persisted to Firestore.
  implication: Fix requires adding tranche_index to the stored rfp document AND updating the dedup check in openRFPModal to match by index.

- timestamp: 2026-03-27T00:00:00Z
  checked: entire procurement.js and finance.js for "tranche_index"
  found: Zero matches — this field does not exist yet anywhere.
  implication: No backward-compat issue with existing code consuming the field. Existing RFPs without tranche_index need a fallback in the dedup logic.

## Resolution

root_cause: openRFPModal() built a Set of tranche_label strings (usedTrancheLabels) from existing RFPs, then disabled any tranche option whose label was in that Set. Two tranches with the same label (e.g., two "Progress billing" at 30% each) are indistinguishable by name alone, so filing the first caused the second to also appear as "RFP exists" and get disabled.
fix: Changed deduplication to use tranche_index (0-based position) instead of label. In openRFPModal(), usedTrancheIndices is now built from r.tranche_index on existing RFPs, with a legacy fallback for old RFPs that lack the field (label-based first-match). In submitRFP(), added tranche_index: idx to the rfpDoc written to Firestore so future deduplication uses position.
verification: Confirmed by human UAT — filing RFP for first "Progress billing" tranche no longer blocks second "Progress billing" tranche from being filed.
files_changed: [app/views/procurement.js]
