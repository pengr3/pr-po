---
phase: 71
slug: revamp-expense-modal-financials
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (zero-build SPA — no automated test framework) |
| **Config file** | None |
| **Quick run command** | `python -m http.server 8000` then open expense modal via any project or service |
| **Full suite command** | Same — manual walkthrough covering rename, Payables tab, and sort behavior |
| **Estimated runtime** | ~4 minutes |

---

## Sampling Rate

- **After every task commit:** Smoke test: open expense modal, confirm title reads "Financial Breakdown: {name}"
- **After Plan 02 commit:** Verify Payables tab appears and renders rows correctly
- **Before `/gsd:verify-work`:** All success criteria must pass across Plans 01–03
- **Max feedback latency:** ~4 minutes (manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 71-01-01 | 01 | 1 | FINMOD-RENAME | manual | n/a | n/a | ⬜ pending |
| 71-02-01 | 02 | 2 | FINMOD-PAYABLES-TAB | manual | n/a | n/a | ⬜ pending |
| 71-02-02 | 02 | 2 | FINMOD-PAYABLES-SORT | manual | n/a | n/a | ⬜ pending |
| 71-03-01 | 03 | 3 | FINMOD-PARTIAL-LABEL | manual | n/a | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test infrastructure needed; project uses manual testing exclusively.

*Existing manual testing process covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Modal header reads "Financial Breakdown: {name}" | FINMOD-RENAME | Zero-build SPA | Click expense/breakdown button for any project or service — modal header title shows "Financial Breakdown: {ProjectName}" not "Expense Breakdown: {ProjectName}" |
| Internal symbols are unchanged | FINMOD-RENAME | Zero-build SPA | All other modal behavior works: By Category tab, Transport Fees tab, CSV export, close button all function normally |
| Payables tab appears as third tab | FINMOD-PAYABLES-TAB | Zero-build SPA | Open Financial Breakdown modal — three tab buttons visible: "By Category", "Transport Fees", "Payables" |
| Payables tab shows collapsible PAYABLES card | FINMOD-PAYABLES-TAB | Zero-build SPA | Click Payables tab — "PAYABLES" card appears with total on right; card body has 4-column table: PARTICULARS \| STATUS \| TOTAL PAYABLE \| TOTAL PAID |
| PO, TR, and Delivery Fee rows appear in Payables table | FINMOD-PAYABLES-TAB | Zero-build SPA | For a project/service with POs and TRs, verify each PO shows as one row, each TR shows as one row, and POs with delivery_fee > 0 show an additional Delivery Fee row |
| Status values reflect payment state accurately | FINMOD-PAYABLES-TAB | Zero-build SPA | "Not Requested" for POs/TRs with no RFP; "Requested" for pending RFPs; "{TrancheLabel} — NN% Paid" for partial; "Fully Paid" for complete |
| Rows sorted by status bucket | FINMOD-PAYABLES-SORT | Zero-build SPA | Payables table row order: Not Requested first, then Requested, then Partial, then Fully Paid; within each bucket, higher Total Payable amounts appear first |
| Partial PO with no active tranche shows percentage label | FINMOD-PARTIAL-LABEL | Zero-build SPA | Find a PO where all individual RFPs are settled but balance still outstanding — Status column shows "XX% Paid" format (not literal "Partial") |
| Payables tab is read-only | FINMOD-PAYABLES-TAB | Zero-build SPA | Click any row in the Payables table — no action; no context menus; table is display-only |

---

## Validation Sign-Off

- [ ] All tasks have manual verify instructions
- [ ] Sampling continuity: smoke test after every commit
- [ ] Wave 0: N/A
- [ ] No watch-mode flags
- [ ] Feedback latency < 4 minutes
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
