---
phase: 65
slug: rfp-payables-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — zero-build static SPA, no test runner configured |
| **Config file** | None |
| **Quick run command** | `python -m http.server 8000` then browser DevTools |
| **Full suite command** | Manual browser testing per checklist below |
| **Estimated runtime** | ~10 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Manual smoke test for the task's feature area in browser
- **After every plan wave:** Full manual checklist covering all 6 requirements
- **Before `/gsd:verify-work`:** Full manual suite must pass all requirement checks
- **Max feedback latency:** ~10 minutes per wave

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Manual Steps | Status |
|---------|------|------|-------------|-----------|-------------------|--------------|--------|
| 65-01-01 | 01 | 1 | — | Manual | None | Verify `arrayUnion` exported from `app/firebase.js`; verify `query`, `where`, `getDocs` imported in `procurement.js` | ⬜ pending |
| 65-01-02 | 01 | 1 | — | Manual | None | `firestore.rules` contains `match /rfps/{rfpId}` block with `create`, `read`, `update`, `delete` rules | ⬜ pending |
| 65-01-03 | 01 | 1 | — | Manual | None | PO edit modal shows tranche builder rows; tranches sum validates to 100% on save; `pos` doc in Firestore has `tranches` array after save | ⬜ pending |
| 65-02-01 | 02 | 2 | RFP-01 | Manual | None | Right-click PO row in Procurement > PO Tracking opens context menu with "Request Payment" option | ⬜ pending |
| 65-02-02 | 02 | 2 | RFP-01 | Manual | None | RFP modal pre-fills supplier name, shows tranche selector, has invoice number + due date fields | ⬜ pending |
| 65-02-03 | 02 | 2 | RFP-01 | Manual | None | After RFP submit: `rfps` doc appears in Firestore with correct `rfp_id` format `RFP-[PROJECT_CODE]-###`; no `status` field present | ⬜ pending |
| 65-03-01 | 03 | 2 | RFP-02 | Manual | None | Finance > Payables tab visible and clickable; `#/finance/payables` route loads Payables section | ⬜ pending |
| 65-03-02 | 03 | 2 | RFP-02 | Manual | None | Payables table shows correct columns: RFP ID, Supplier, PO Ref, Project/Service, Tranche Label, Amount, Paid, Balance, Due Date, Status, Actions | ⬜ pending |
| 65-03-03 | 03 | 2 | RFP-02, RFP-04, RFP-05 | Manual | None | Status badge shows Pending/Partially Paid/Fully Paid/Overdue correctly; Overdue = red badge + #fef2f2 row tint | ⬜ pending |
| 65-03-04 | 03 | 2 | RFP-03 | Manual | None | "Record Payment" action opens payment modal; amount is read-only (pre-filled with tranche amount); submit appends to `payment_records` array in Firestore | ⬜ pending |
| 65-03-05 | 03 | 2 | RFP-03 | Manual | None | Void payment: sets `status: 'voided'` on payment record; voided amount excluded from balance recalculation | ⬜ pending |
| 65-03-06 | 03 | 2 | RFP-02 | Manual | None | Chevron toggle shows/hides expandable payment history row per RFP | ⬜ pending |
| 65-04-01 | 04 | 3 | RFP-06 | Manual | None | PO ID cell in Procurement PO Tracking shows colored fill: red (no RFPs), orange/yellow (in progress), green (fully paid) | ⬜ pending |
| 65-04-02 | 04 | 3 | RFP-06 | Manual | None | Hover on PO ID cell shows tooltip with payment summary (e.g., "Paid: ₱X | Balance: ₱X | XX% complete") | ⬜ pending |
| 65-04-03 | 04 | 3 | RFP-06 | Manual | None | After recording payment, PO ID fill updates immediately (real-time via `rfps` onSnapshot listener) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Verify `arrayUnion` is exported from `app/firebase.js` — if not, add to both import and re-export before any plan that writes to `rfps` proceeds
- [ ] Verify `app/views/procurement.js` already imports `query`, `where`, `getDocs` — needed for custom RFP ID generator

*No test stub files to create — project has no automated test infrastructure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RFP submission creates correct `RFP-[PROJECT_CODE]-###` ID | RFP-01 | No test runner; ID generation is runtime logic | Submit RFP for a PO with a hyphenated project code (e.g., CLMC-ACME-2026001); verify Firestore `rfp_id` = `RFP-CLMC-ACME-2026001-001` |
| Payment status derives client-side (no `status` field in Firestore) | RFP-04 | Status is never written to Firestore | Submit RFP; inspect Firestore doc — confirm no `status` field; verify badge reflects computed value |
| Overdue indicator for past-due unpaid RFPs | RFP-05 | Requires date manipulation | Set `due_date` to a past date in a test RFP; verify "Overdue" badge appears with #fef2f2 row background |
| PO ID fill transitions smoothly | RFP-06 | Visual/CSS animation | Record a payment; observe PO ID cell fill width animating (0.4s transition) |
| Legacy PO without `tranches` field loads RFP modal correctly | RFP-01 | Requires old test data | Open RFP modal on a PO created before Phase 65; verify tranche dropdown shows "Full Payment / 100%" fallback |
| `rfps` security rules block unauthorized writes | RFP-01, RFP-03 | Firebase security; no automated rule tester available | Attempt RFP creation as Finance-only user — should be blocked; attempt payment recording as Procurement-only — should be blocked |

---

## Validation Sign-Off

- [ ] All tasks have manual verification steps defined above
- [ ] Sampling continuity: each plan wave has a full manual checklist
- [ ] Wave 0 covers both MISSING import checks
- [ ] No watch-mode flags (N/A — no test runner)
- [ ] Feedback latency: ~10 min per wave (manual)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
